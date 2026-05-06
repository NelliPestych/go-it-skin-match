from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.db.session import get_db
from app.repositories.user_repo import UserRepository
from app.schemas.user import TokenResponse, UserCreate, UserRead

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Mock login (creates user on first call)",
)
def login(payload: UserCreate, db: Session = Depends(get_db)) -> TokenResponse:
    user = UserRepository(db).get_or_create(payload.email)
    return TokenResponse(
        access_token=create_access_token(user.email),
        user=UserRead.model_validate(user),
    )
