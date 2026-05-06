from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)

    scans = relationship("SkinScan", back_populates="user", cascade="all, delete-orphan")
    quiz_answers = relationship("QuizAnswer", back_populates="user", cascade="all, delete-orphan")
    recommendations = relationship("Recommendation", back_populates="user", cascade="all, delete-orphan")
    plans = relationship("RoutinePlan", back_populates="user", cascade="all, delete-orphan")
