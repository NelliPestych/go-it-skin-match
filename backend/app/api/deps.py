"""Shared dependency-injection helpers for the API layer."""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.repositories.user_repo import UserRepository
from app.services.cache_service import CacheService, get_cache


DEMO_USER_EMAIL = "demo@skinmatch.local"


def cache_dependency() -> CacheService:
    return get_cache()


def _is_production() -> bool:
    return (settings.app_env or "").strip().lower() == "production"


def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> User:
    """Resolve user from Bearer token; non-prod falls back to demo when header absent."""
    repo = UserRepository(db)
    bearer = (authorization or "").strip()

    if bearer and bearer.lower().startswith("bearer "):
        token = bearer.split(" ", 1)[1].strip()
        email = decode_access_token(token)
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired auth token",
            )
        user = repo.get_by_email(email)
        if user is None:
            # Token sub doesn't map to an account — reject so a revoked-then-reissued token can't be reused.
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired auth token",
            )
        return user

    if _is_production():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return repo.get_or_create(DEMO_USER_EMAIL)
