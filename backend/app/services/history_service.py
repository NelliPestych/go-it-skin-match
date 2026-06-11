"""History list + details snapshots joining SkinScan, Quiz, Recommendation, Plan."""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.recommendation import Recommendation
from app.models.skin_scan import SkinScan
from app.repositories.plan_repo import PlanRepository
from app.repositories.quiz_repo import QuizRepository
from app.repositories.recommendation_repo import RecommendationRepository
from app.repositories.scan_repo import SkinScanRepository
from app.schemas.analysis import SkinFeatures
from app.schemas.history import AnalysisDetails, AnalysisHistoryItem, FusionDecision
from app.schemas.plan import BeautyPlan
from app.schemas.product import ProductRead
from app.schemas.recommendation import RecommendationItem
from app.schemas.skin_analysis import AIMetrics
from app.services.recommendation_service import resolve_skin_type


class HistoryService:
    def __init__(self, db: Session):
        self.db = db
        self.scan_repo = SkinScanRepository(db)
        self.quiz_repo = QuizRepository(db)
        self.reco_repo = RecommendationRepository(db)
        self.plan_repo = PlanRepository(db)

    def list_for_user(self, user_id: int, limit: int = 20) -> List[AnalysisHistoryItem]:
        scans: List[SkinScan] = self.scan_repo.list_for_user(user_id)[:limit]
        items: List[AnalysisHistoryItem] = []
        for scan in scans:
            features = scan.features_json or {}
            recos: List[Recommendation] = self.reco_repo.list_for_analysis(scan.id)
            top_products = [r.product.name for r in recos[:3] if r.product is not None]
            items.append(
                AnalysisHistoryItem(
                    analysis_id=scan.id,
                    created_at=scan.created_at,
                    skin_type=str(features.get("skin_type", "unknown")),
                    confidence_score=float(features.get("confidence_score", 0.0)),
                    top_products=top_products,
                )
            )
        return items

    def details(self, user_id: int, analysis_id: int) -> Optional[AnalysisDetails]:
        scan = self.scan_repo.get(analysis_id)
        if not scan or scan.user_id != user_id:
            return None

        features = SkinFeatures.model_validate(scan.features_json or {})
        quiz = self.quiz_repo.get_by_analysis(analysis_id)
        plan_record = self.plan_repo.get_by_analysis(analysis_id)
        plan_obj: Optional[BeautyPlan] = None
        if plan_record and plan_record.plan_json:
            plan_obj = BeautyPlan.model_validate(plan_record.plan_json)

        reco_items: List[RecommendationItem] = []
        for r in self.reco_repo.list_for_analysis(analysis_id):
            if r.product is None:
                continue
            reco_items.append(
                RecommendationItem(
                    product=ProductRead.model_validate(r.product),
                    score=float(r.score or 0.0),
                    reasons=(r.reason_json or {}).get("reasons", []),
                )
            )

        fusion = self._build_fusion(scan.features_json, quiz.answers_json if quiz else None)

        return AnalysisDetails(
            analysis_id=scan.id,
            created_at=scan.created_at,
            features=features,
            ai_metrics=AIMetrics.from_features_json(scan.features_json),
            quiz_answers=quiz.answers_json if quiz else None,
            recommendations=reco_items,
            plan=plan_obj,
            fusion=fusion,
        )

    @staticmethod
    def _build_fusion(
        features_json: Optional[dict],
        quiz_answers: Optional[dict],
    ) -> Optional[FusionDecision]:
        if not features_json:
            return None
        features = features_json or {}
        quiz = quiz_answers or {}
        effective, resolution = resolve_skin_type(features, quiz)
        return FusionDecision(
            effective_skin_type=effective,
            resolution=resolution,
            ai_skin_type=str(features.get("skin_type", "unknown")),
            quiz_skin_type=quiz.get("self_reported_skin_type"),
            confidence_score=float(features.get("confidence_score", 0.0)),
        )
