from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Concern, SkinType


class QuizSubmission(BaseModel):
    analysis_id: int
    self_reported_skin_type: Optional[SkinType] = None
    concerns: List[Concern] = Field(default_factory=list)
    sensitivity: bool = False
    age_range: Optional[str] = None
    sun_exposure: Optional[str] = None
    current_routine_complexity: Optional[str] = None
    budget: Optional[str] = None


class QuizRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    analysis_id: int
    answers_json: dict
    created_at: datetime
