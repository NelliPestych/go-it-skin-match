from typing import List

from pydantic import BaseModel

from app.schemas.product import ProductRead


class RecommendationItem(BaseModel):
    product: ProductRead
    score: float
    reasons: List[str]


class RecommendationResponse(BaseModel):
    analysis_id: int
    items: List[RecommendationItem]
    cached: bool = False
