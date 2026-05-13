"""Schemas for the history and details endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.analysis import SkinFeatures
from app.schemas.plan import BeautyPlan
from app.schemas.recommendation import RecommendationItem
from app.schemas.skin_analysis import AIMetrics


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

    `ai_metrics` is a new sidecar block that surfaces extended provider
    output (`provider`, `oiliness`, `acne`, `fine_lines`, `texture`,
    `recommendation_signals`).  It's `Optional` so old scans (which
    never had a provider stamp) still render, and the legacy `features`
    block is unchanged so the existing frontend keeps working without
    any redesign.
    """

    analysis_id: int
    created_at: datetime
    features: SkinFeatures
    ai_metrics: Optional[AIMetrics] = None
    quiz_answers: Optional[dict] = None
    recommendations: List[RecommendationItem]
    plan: Optional[BeautyPlan] = None
