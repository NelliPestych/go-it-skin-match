from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Concern, SkinType


class QuizSubmission(BaseModel):
    """Wire schema for `POST /quiz/submit`.

    Backward compatibility:
    Every field below is either keeping its pre-existing default or
    is `Optional[...] = None`.  Old clients posting only the legacy
    fields (`self_reported_skin_type`, `concerns`, `sensitivity`,
    `budget`) still produce a valid request — the existing
    `test_history`, `test_recommendations`, and integration tests
    that don't set the new fields keep passing without modification.

    The 6 new fields are typed as `Optional[str]` (not enums) for two
    reasons:
    1. The same loose-typing pattern is already used by the four
       legacy optional fields (`age_range`, `sun_exposure`,
       `current_routine_complexity`, `budget`).  Keeping the new
       fields homogeneous avoids special cases.
    2. A typo or unknown value from the UI returns a benign
       no-effect-on-scoring at runtime rather than a 422 that
       breaks the whole quiz submission.  Documented allowed values
       live next to each scoring rule in `recommendation_service.py`.
    """

    analysis_id: int

    # ── Legacy fields (unchanged) ────────────────────────────────────
    self_reported_skin_type: Optional[SkinType] = None
    concerns: List[Concern] = Field(default_factory=list)
    sensitivity: bool = False
    age_range: Optional[str] = None
    sun_exposure: Optional[str] = None
    current_routine_complexity: Optional[str] = None
    budget: Optional[str] = None

    # ── Step-4 additions (paired with frontend QuizPayload) ──────────
    # Allowed values are listed here for documentation but NOT enforced
    # at the schema layer (see class docstring).  Scoring rules in
    # `recommendation_service.py` ignore unknown values silently.
    #
    # routine_level:     "regularly" | "sometimes" | "no"
    # breakout_frequency:"often"     | "sometimes" | "rarely" | "never"
    # daily_environment: "urban_pollution" | "mostly_indoors" | "sunny_outdoor"
    # sunscreen_usage:   "daily"     | "sometimes" | "rarely_never"
    routine_level: Optional[str] = None
    breakout_frequency: Optional[str] = None
    daily_environment: Optional[str] = None
    sunscreen_usage: Optional[str] = None

    # ── Raw UI passthrough (preserved for analytics / future rules) ──
    # The frontend collapses these into legacy `concerns` / `sensitivity`
    # via the mappers in `services/quizMapping.ts`; the raw values are
    # kept alongside so the diploma defence + future scoring rules can
    # still reach the 7-way concern vocabulary and the 3-way sensitivity
    # level without re-mapping.
    raw_concerns: Optional[List[str]] = None
    raw_sensitivity: Optional[str] = None  # "very_sensitive" | "sometimes_reacts" | "not_sensitive"


class QuizRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    analysis_id: int
    answers_json: dict
    created_at: datetime
