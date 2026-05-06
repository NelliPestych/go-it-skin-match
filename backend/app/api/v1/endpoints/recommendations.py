from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import cache_dependency, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.quiz_repo import QuizRepository
from app.repositories.scan_repo import SkinScanRepository
from app.schemas.product import ProductRead
from app.schemas.recommendation import RecommendationItem, RecommendationResponse
from app.services.cache_service import CacheService
from app.services.recommendation_service import RecommendationService

router = APIRouter()


@router.get(
    "/{analysis_id}",
    response_model=RecommendationResponse,
    summary="Get personalized product recommendations for an analysis",
)
def get_recommendations(
    analysis_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    cache: CacheService = Depends(cache_dependency),
) -> RecommendationResponse:
    scan = SkinScanRepository(db).get(analysis_id)
    if not scan or scan.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found",
        )

    cache_key = f"reco:{analysis_id}"
    cached = cache.get_json(cache_key)
    if cached:
        return RecommendationResponse(**cached, cached=True)

    quiz = QuizRepository(db).get_by_analysis(analysis_id)
    quiz_payload = (quiz.answers_json if quiz else {}) or {}

    service = RecommendationService(db)
    scored = service.generate(
        user_id=user.id,
        analysis_id=analysis_id,
        features=scan.features_json or {},
        quiz=quiz_payload,
    )

    items = [
        RecommendationItem(
            product=ProductRead.model_validate(s["product"]),
            score=s["score"],
            reasons=s["reasons"],
        )
        for s in scored
    ]
    response = RecommendationResponse(analysis_id=analysis_id, items=items, cached=False)
    cache.set_json(cache_key, response.model_dump(mode="json"), ttl_seconds=600)
    return response
