from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ProductBase(BaseModel):
    brand: str
    name: str
    category: str
    skin_types: List[str] = Field(default_factory=list)
    concerns: List[str] = Field(default_factory=list)
    ingredients: List[str] = Field(default_factory=list)
    price: float = 0.0
    affiliate_url: Optional[str] = None
    description: Optional[str] = None


class ProductCreate(ProductBase):
    pass


class ProductRead(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
