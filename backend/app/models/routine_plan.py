from typing import Any, Dict

from sqlalchemy import ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class RoutinePlan(Base, TimestampMixin):
    __tablename__ = "routine_plans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    analysis_id: Mapped[int] = mapped_column(
        ForeignKey("skin_scans.id", ondelete="CASCADE"), index=True, unique=True
    )
    plan_json: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)

    user = relationship("User", back_populates="plans")
    scan = relationship("SkinScan", back_populates="plan")
