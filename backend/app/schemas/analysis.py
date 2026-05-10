from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Level, SkinType


class SkinFeatures(BaseModel):
    skin_type: SkinType
    redness_level: Level
    hydration_level: Level
    pigmentation_level: Level
    pores_score: float = Field(ge=0.0, le=1.0)
    confidence_score: float = Field(ge=0.0, le=1.0)


class AnalysisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    image_path: str
    features_json: dict
    created_at: datetime


class AnalysisCreateResponse(BaseModel):
    analysis_id: int
    features: SkinFeatures
    # Mirrors the legacy single-image column.  For Smart Camera
    # uploads it equals `image_front_path`; for manual uploads it is
    # the only image we have.
    image_path: str
    # Smart Camera 3-shot paths.  Null on legacy / single-image
    # uploads.  MVP heuristic analysis uses only `image_front_path`;
    # left / right are stored for future multi-angle pipelines.
    image_front_path: Optional[str] = None
    image_left_path: Optional[str] = None
    image_right_path: Optional[str] = None
