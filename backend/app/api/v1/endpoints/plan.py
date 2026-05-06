from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import cache_dependency, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.product_repo import ProductRepository
from app.repositories.recommendation_repo import RecommendationRepository
from app.repositories.scan_repo import SkinScanRepository
from app.schemas.plan import BeautyPlan
from app.services.cache_service import CacheService
from app.services.plan_service import PlanService

router = APIRouter()


@router.get(
    "/{analysis_id}",
    response_model=BeautyPlan,
    summary="Get a daily beauty plan for an analysis",
)
def get_plan(
    analysis_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    cache: CacheService = Depends(cache_dependency),
) -> BeautyPlan:
    scan = SkinScanRepository(db).get(analysis_id)
    if not scan or scan.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found",
        )

    cache_key = f"plan:{analysis_id}"
    cached = cache.get_json(cache_key)
    if cached:
        return BeautyPlan(**cached)

    service = PlanService(db)
    existing = service.get(analysis_id)
    if existing:
        cache.set_json(cache_key, existing.model_dump(mode="json"), ttl_seconds=600)
        return existing

    recos = RecommendationRepository(db).list_for_analysis(analysis_id)
    if not recos:
        # if no recos exist yet, fall back to top catalogue picks
        product_repo = ProductRepository(db)
        recommended_products = product_repo.list()[:5]
    else:
        recommended_products = [r.product for r in recos]

    plan = service.generate(
        user_id=user.id,
        analysis_id=analysis_id,
        features=scan.features_json or {},
        recommended_products=recommended_products,
    )
    cache.set_json(cache_key, plan.model_dump(mode="json"), ttl_seconds=600)
    return plan
