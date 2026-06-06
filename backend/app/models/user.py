from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Nullable so rows persisted before the auth system landed (the
    # legacy `demo@skinmatch.local` service account, etc.) keep
    # working — they simply can no longer log in.  New accounts created
    # via `/auth/register` always carry a hash.
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    scans = relationship("SkinScan", back_populates="user", cascade="all, delete-orphan")
    quiz_answers = relationship("QuizAnswer", back_populates="user", cascade="all, delete-orphan")
    recommendations = relationship("Recommendation", back_populates="user", cascade="all, delete-orphan")
    plans = relationship("RoutinePlan", back_populates="user", cascade="all, delete-orphan")
