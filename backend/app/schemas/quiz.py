from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Concern, SkinType


class QuizSubmission(BaseModel):
    """Wire schema for POST /quiz/submit.

    New step-4 fields are Optional[str] (not enums) so unknown UI values become
    no-ops at scoring time instead of 422s. Allowed values live next to the
    scoring rules in recommendation_service.py.
    """

    analysis_id: int

    self_reported_skin_type: Optional[SkinType] = None
    concerns: List[Concern] = Field(default_factory=list)
    sensitivity: bool = False
    age_range: Optional[str] = None
    sun_exposure: Optional[str] = None
    current_routine_complexity: Optional[str] = None
    budget: Optional[str] = None

    # Documented vocabularies:
    #   routine_level:      regularly | sometimes | no
    #   breakout_frequency: often | sometimes | rarely | never
    #   daily_environment:  urban_pollution | mostly_indoors | sunny_outdoor
    #   sunscreen_usage:    daily | sometimes | rarely_never
    routine_level: Optional[str] = None
    breakout_frequency: Optional[str] = None
    daily_environment: Optional[str] = None
    sunscreen_usage: Optional[str] = None

    # Raw UI passthrough — preserves 7-way concerns + 3-way sensitivity for future rules.
    raw_concerns: Optional[List[str]] = None
    raw_sensitivity: Optional[str] = None  # very_sensitive | sometimes_reacts | not_sensitive


class QuizRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    analysis_id: int
    answers_json: dict
    created_at: datetime
