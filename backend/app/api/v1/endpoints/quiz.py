from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import cache_dependency, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.scan_repo import SkinScanRepository
from app.schemas.quiz import QuizRead, QuizSubmission
from app.services.cache_service import CacheService
from app.services.plan_service import PlanService
from app.services.quiz_service import QuizService
from app.services.recommendation_service import RecommendationService

router = APIRouter()


@router.post(
    "/submit",
    response_model=QuizRead,
    summary="Submit quiz answers tied to an existing analysis",
)
def submit_quiz(
    payload: QuizSubmission,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    cache: CacheService = Depends(cache_dependency),
) -> QuizRead:
    scan = SkinScanRepository(db).get(payload.analysis_id)
    if not scan or scan.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found",
        )
    record = QuizService(db).submit(user.id, payload)
    cache.invalidate(f"reco:{payload.analysis_id}")
    cache.invalidate(f"plan:{payload.analysis_id}")

    # Eagerly persist recommendations and routine plan so the full
    # flow (SkinScan → Quiz → Recommendation → RoutinePlan) is durably
    # snapshotted in the DB. This makes the history endpoint
    # consistent regardless of whether the client ever fetches them.
    reco_service = RecommendationService(db)
    scored = reco_service.generate(
        user_id=user.id,
        analysis_id=payload.analysis_id,
        features=scan.features_json or {},
        quiz=record.answers_json or {},
    )
    PlanService(db).generate(
        user_id=user.id,
        analysis_id=payload.analysis_id,
        features=scan.features_json or {},
        recommended_products=[s["product"] for s in scored],
        # Forward the persisted quiz dict so PlanService can apply
        # the routine_level / sunscreen_usage / sensitivity rules
        # added in Step 5. `quiz` is optional on PlanService.generate(),
        # so older callers (and unit tests that hit the service
        # directly without a quiz dict) still work unchanged.
        quiz=record.answers_json or {},
    )

    return QuizRead.model_validate(record)
