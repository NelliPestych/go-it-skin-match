from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import cache_dependency, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.scan_repo import SkinScanRepository
from app.schemas.quiz import QuizRead, QuizSubmission
from app.services.cache_service import CacheService
from app.services.quiz_service import QuizService

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
    return QuizRead.model_validate(record)
