"""Skin analysis orchestration.

Validates the upload, persists the image, runs the AI analyzer
(via the pipeline factory), and stores the resulting features.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Tuple

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
