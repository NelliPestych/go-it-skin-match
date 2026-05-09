"""Schemas for the history and details endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.analysis import SkinFeatures
from app.schemas.plan import BeautyPlan
from app.schemas.recommendation import RecommendationItem


class AnalysisHistoryItem(BaseModel):
    """Compact card for the history list."""

    analysis_id: int
    created_at: datetime
    skin_type: str
    confidence_score: float
    top_products: List[str]


class AnalysisDetails(BaseModel):
    """Full snapshot of one analysis — features + quiz + recos + plan.

    Quiz, recommendations and plan are nullable because a scan may exist
    without those steps (e.g. an upload abandoned mid-flow). The history
    UI handles each section independently.
    """

    analysis_id: int
    created_at: datetime
    features: SkinFeatures
    quiz_answers: Optional[dict] = None
    recommendations: List[RecommendationItem]
    plan: Optional[BeautyPlan] = None
