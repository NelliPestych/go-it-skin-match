from typing import Any, Dict

from sqlalchemy import Float, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Recommendation(Base, TimestampMixin):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    analysis_id: Mapped[int] = mapped_column(
        ForeignKey("skin_scans.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[float] = mapped_column(Float, default=0.0)
    reason_json: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)

    user = relationship("User", back_populates="recommendations")
    scan = relationship("SkinScan", back_populates="recommendations")
    product = relationship("Product")
