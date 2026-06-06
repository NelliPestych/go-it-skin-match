from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# Max 128 so an accidental multi-KB paste doesn't burn CPU on scrypt.
_PASSWORD_MIN = 8
_PASSWORD_MAX = 128


class UserBase(BaseModel):
    email: EmailStr


class UserRegister(UserBase):
    password: str = Field(min_length=_PASSWORD_MIN, max_length=_PASSWORD_MAX)


class UserLogin(UserBase):
    password: str = Field(min_length=_PASSWORD_MIN, max_length=_PASSWORD_MAX)


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
