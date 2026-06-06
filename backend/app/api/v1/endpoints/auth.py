"""Auth endpoints — registration + login.

Two routes, both anonymous (no auth dependency).  Both return the
same `TokenResponse` shape so the frontend can use a single success
handler.

Design choices:

* The `/login` route returns the same 401 message regardless of
  whether the email exists or the password is wrong — this stops a
  drive-by attacker from probing the registered-email list.
* `/register` returns 409 on duplicate email (not 400) so the
  frontend can render a tailored "this account already exists" hint.
* Neither route ever logs the plaintext password.  The repo layer
  never sees plaintext either; hashing happens here.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.repositories.user_repo import UserRepository
from app.schemas.user import (
    TokenResponse,
    UserLogin,
    UserRead,
    UserRegister,
)


router = APIRouter()


_INVALID_CREDENTIALS_DETAIL = "Invalid email or password"


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new account and return an access token",
)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> TokenResponse:
    repo = UserRepository(db)
    email = payload.email.lower().strip()

    if repo.get_by_email(email) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = repo.create_with_password(email, hash_password(payload.password))
    return TokenResponse(
        access_token=create_access_token(user.email),
        user=UserRead.model_validate(user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate an existing account and return an access token",
)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    repo = UserRepository(db)
    email = payload.email.lower().strip()
    user = repo.get_by_email(email)

    # Identical message for both branches — stops email enumeration.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_CREDENTIALS_DETAIL,
        )

    return TokenResponse(
        access_token=create_access_token(user.email),
        user=UserRead.model_validate(user),
    )
