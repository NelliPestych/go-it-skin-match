"""Skin analysis orchestration.

Validates the upload(s), persists the image(s), runs the AI analyzer
(via the pipeline factory), and stores the resulting features.

Two entry points:

* `analyze(...)`        — legacy single-image path used by the
                          manual-upload form. Stores the file in
                          `image_path` only.
* `analyze_multi(...)`  — Smart Camera 3-shot path. Persists the
                          front photo into both `image_path` (for
                          backward compat with downstream readers)
                          and `image_front_path`; left / right go
                          into `image_left_path` / `image_right_path`
                          as nullable extras. The MVP heuristic
                          analyzer still runs on the FRONT image only
                          — we collect the side angles for future
                          multi-angle pipelines without complicating
                          today's scoring.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional, Tuple

from fastapi import HTTPException, UploadFile, status

from app.ai.pipeline import get_analyzer
from app.core.config import settings
from app.models.skin_scan import SkinScan
from app.repositories.scan_repo import SkinScanRepository
from app.schemas.analysis import SkinFeatures


ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class AnalysisService:
    def __init__(self, scan_repo: SkinScanRepository):
        self.scan_repo = scan_repo
        self.analyzer = get_analyzer()

    def _validate_upload(self, upload: UploadFile, contents: bytes) -> str:
        if upload.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported content type: {upload.content_type}",
            )
        suffix = Path(upload.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file extension: {suffix}",
            )
        max_bytes = settings.max_upload_size_mb * 1024 * 1024
        if len(contents) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large (max {settings.max_upload_size_mb}MB).",
            )
        if len(contents) < 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File too small to be a valid image.",
            )
        return suffix

    def _persist(self, contents: bytes, suffix: str) -> str:
        filename = f"{uuid.uuid4().hex}{suffix}"
        target = settings.upload_path / filename
        target.write_bytes(contents)
        return str(target)

    def analyze(self, user_id: int, upload: UploadFile, contents: bytes) -> Tuple[SkinScan, SkinFeatures]:
        suffix = self._validate_upload(upload, contents)
        image_path = self._persist(contents, suffix)
        try:
            features = self.analyzer.analyze(contents)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        scan = self.scan_repo.create(
            user_id=user_id,
            image_path=image_path,
            features=features.model_dump(mode="json"),
        )
        return scan, features

    def analyze_multi(
        self,
        user_id: int,
        front_upload: UploadFile,
        front_contents: bytes,
        left_upload: Optional[UploadFile] = None,
        left_contents: Optional[bytes] = None,
        right_upload: Optional[UploadFile] = None,
        right_contents: Optional[bytes] = None,
    ) -> Tuple[SkinScan, SkinFeatures]:
        """Smart Camera 3-shot ingestion.

        Validates each provided upload independently (front is
        required, left/right optional); persists every accepted
        image; runs the analyzer on the FRONT image only; stores
        all paths on the SkinScan.

        `image_path` mirrors `image_front_path` so legacy code that
        reads the single-image column (history thumbnails, details,
        recommendations) keeps working without branching.
        """
        front_suffix = self._validate_upload(front_upload, front_contents)
        front_path = self._persist(front_contents, front_suffix)

        left_path: Optional[str] = None
        if left_upload is not None and left_contents is not None:
            left_suffix = self._validate_upload(left_upload, left_contents)
            left_path = self._persist(left_contents, left_suffix)

        right_path: Optional[str] = None
        if right_upload is not None and right_contents is not None:
            right_suffix = self._validate_upload(right_upload, right_contents)
            right_path = self._persist(right_contents, right_suffix)

        try:
            features = self.analyzer.analyze(front_contents)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc

        scan = self.scan_repo.create(
            user_id=user_id,
            image_path=front_path,
            features=features.model_dump(mode="json"),
            image_front_path=front_path,
            image_left_path=left_path,
            image_right_path=right_path,
        )
        return scan, features
