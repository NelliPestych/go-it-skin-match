from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import cache_dependency, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.scan_repo import SkinScanRepository
from app.schemas.analysis import AnalysisCreateResponse, SkinFeatures
from app.schemas.history import AnalysisDetails, AnalysisHistoryItem
from app.services.analysis_service import AnalysisService
from app.services.cache_service import CacheService
from app.services.history_service import HistoryService

router = APIRouter()


@router.post(
    "/upload",
    response_model=AnalysisCreateResponse,
    summary="Upload a face/skin image and run AI analysis",
)
def upload_analysis(
    # Legacy single-image field. Kept for backward compat with the
    # manual-upload form and any older clients.
    file: Optional[UploadFile] = File(default=None),
    # Smart Camera 3-shot fields. `front` is required when used;
    # `left` / `right` are optional. The endpoint dispatches to the
    # multi-image service path whenever `front` is present.
    front: Optional[UploadFile] = File(default=None),
    left: Optional[UploadFile] = File(default=None),
    right: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    cache: CacheService = Depends(cache_dependency),
) -> AnalysisCreateResponse:
    """Accepts EITHER:

    * legacy: ``file`` — single image (manual uploader / old clients)
    * new:    ``front`` (+ optional ``left`` / ``right``) — Smart Camera

    `front` wins if both are supplied; using just `file` keeps the
    pre-Smart-Camera contract intact so existing callers don't break.
    """
    service = AnalysisService(SkinScanRepository(db))

    if front is not None:
        front_bytes = front.file.read()
        left_bytes = left.file.read() if left is not None else None
        right_bytes = right.file.read() if right is not None else None
        scan, features = service.analyze_multi(
            user.id,
            front_upload=front,
            front_contents=front_bytes,
            left_upload=left,
            left_contents=left_bytes,
            right_upload=right,
            right_contents=right_bytes,
        )
    elif file is not None:
        contents = file.file.read()
        scan, features = service.analyze(user.id, file, contents)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No image supplied. Send either `file` or `front` (with optional `left` / `right`).",
        )

    cache.invalidate(f"reco:{scan.id}")
    return AnalysisCreateResponse(
        analysis_id=scan.id,
        features=features,
        image_path=scan.image_path,
        image_front_path=scan.image_front_path,
        image_left_path=scan.image_left_path,
        image_right_path=scan.image_right_path,
    )


# IMPORTANT: static routes must come before /{analysis_id} so that
# `/analysis/history` is not interpreted as `analysis_id="history"`.
@router.get(
    "/history",
    response_model=List[AnalysisHistoryItem],
    summary="List previous analyses for the current user",
)
def list_history(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> List[AnalysisHistoryItem]:
    return HistoryService(db).list_for_user(user.id)


@router.get(
    "/{analysis_id}/details",
    response_model=AnalysisDetails,
    summary="Full snapshot of one analysis (features + quiz + recos + plan)",
)
def get_details(
    analysis_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalysisDetails:
    record = HistoryService(db).details(user.id, analysis_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    return record


@router.get(
    "/{analysis_id}",
    response_model=SkinFeatures,
    summary="Get raw skin features",
)
def get_features(
    analysis_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SkinFeatures:
    repo = SkinScanRepository(db)
    scan = repo.get(analysis_id)
    if not scan or scan.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    return SkinFeatures.model_validate(scan.features_json)
