"""Schemas for the history and details endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.analysis import SkinFeatures
from app.schemas.plan import BeautyPlan
from app.schemas.recommendation import RecommendationItem
from app.schemas.skin_analysis import AIMetrics


class AnalysisHistoryItem(BaseModel):
    """Compact card for the history list."""

    analysis_id: int
    created_at: datetime
    skin_type: str
    confidence_score: float
    top_products: List[str]


class FusionDecision(BaseModel):
    """How the scoring engine fused AI vs quiz signals for this analysis.

    Used by the UI to show a transparent banner when the user-quiz answer
    overrode a low-confidence AI verdict — see
    ``recommendation_service.resolve_skin_type``.
    """

    effective_skin_type: str
    resolution: str  # ai_high_confidence | ai_medium_confidence | low_confidence_quiz_override | low_confidence_default
    ai_skin_type: str
    quiz_skin_type: Optional[str] = None
    confidence_score: float


class AnalysisDetails(BaseModel):
    """Full snapshot of one analysis — features + quiz + recos + plan."""

    analysis_id: int
    created_at: datetime
    features: SkinFeatures
    ai_metrics: Optional[AIMetrics] = None
    quiz_answers: Optional[dict] = None
    recommendations: List[RecommendationItem]
    plan: Optional[BeautyPlan] = None
    fusion: Optional[FusionDecision] = None
