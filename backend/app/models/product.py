from typing import List, Optional

from sqlalchemy import Float, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    brand: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    skin_types: Mapped[List[str]] = mapped_column(JSON, default=list)
    concerns: Mapped[List[str]] = mapped_column(JSON, default=list)
    ingredients: Mapped[List[str]] = mapped_column(JSON, default=list)
    price: Mapped[Optional[float]] = mapped_column(Float, default=0.0)
    affiliate_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
