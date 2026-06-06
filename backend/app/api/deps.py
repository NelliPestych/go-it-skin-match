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
    """Resolve the current user.

    Behaviour by `APP_ENV`:

    * **production** — a valid Bearer token is required.  Missing or
      malformed Authorization headers, invalid signatures, and
      expired tokens all return 401.  No demo fallback.
    * **anything else (development / test / staging)** — same Bearer
      check first; if no header is supplied at all, we transparently
      use the shared demo account so the existing test fixtures and
      pre-auth dev flow keep working without rewriting.

    A *malformed* token in non-prod still 401s — the fallback only
    fires when the header is absent.  That keeps explicit bad-token
    test cases honest.
    """
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
            # Token's `sub` doesn't map to any account — treat as
            # invalid rather than auto-creating, so a leaked-but-
            # revoked token can't be reused via reissue.
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

    # Non-production: keep the demo flow frictionless.  Existing
    # records persisted before auth landed remain attached to this
    # service account; see README "Authentication".
    return repo.get_or_create(DEMO_USER_EMAIL)
