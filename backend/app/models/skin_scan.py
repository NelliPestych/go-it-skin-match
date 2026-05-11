from typing import Any, Dict, Optional

from sqlalchemy import ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SkinScan(Base, TimestampMixin):
    __tablename__ = "skin_scans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Legacy single-image column. Kept non-null for backward compat
    # with the original `/analysis/upload` payload (`file=...`).  For
    # multi-image (Smart Camera) uploads we mirror the front photo
    # here so existing readers (history, detail, recommendations) keep
    # working without any branching.
    image_path: Mapped[str] = mapped_column(String(512), nullable=False)
    # Per-pose paths from the Smart Camera 3-shot capture.  All three
    # are nullable so legacy single-image uploads (which only set
    # `image_path`) still satisfy the schema.  MVP heuristic analysis
    # runs on the front image only; left / right are stored for
    # future multi-angle pipelines.
    image_front_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    image_left_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    image_right_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
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
