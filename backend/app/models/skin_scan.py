from typing import Any, Dict

from sqlalchemy import ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SkinScan(Base, TimestampMixin):
    __tablename__ = "skin_scans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    image_path: Mapped[str] = mapped_column(String(512), nullable=False)
    features_json: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)

    user = relationship("User", back_populates="scans")
    quiz_answer = relationship(
        "QuizAnswer",
        back_populates="scan",
        uselist=False,
        cascade="all, delete-orphan",
    )
    recommendations = relationship(
        "Recommendation",
        back_populates="scan",
        cascade="all, delete-orphan",
    )
    plan = relationship(
        "RoutinePlan",
        back_populates="scan",
        uselist=False,
        cascade="all, delete-orphan",
    )
