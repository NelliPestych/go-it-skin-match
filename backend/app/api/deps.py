"""Shared dependency-injection helpers for the API layer."""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.repositories.user_repo import UserRepository
from app.services.cache_service import CacheService, get_cache


DEMO_USER_EMAIL = "demo@skinmatch.local"


def cache_dependency() -> CacheService:
    return get_cache()


def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> User:
    """Resolve the current user.

    For the MVP we accept either:
    - a Bearer token issued by `/auth/login` (carries email);
    - or no token at all, in which case we transparently use a demo user.

    This keeps the demo flow frictionless while still validating tokens
    when supplied.
    """
    repo = UserRepository(db)
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        email = decode_access_token(token)
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid auth token",
            )
        return repo.get_or_create(email)
    return repo.get_or_create(DEMO_USER_EMAIL)
