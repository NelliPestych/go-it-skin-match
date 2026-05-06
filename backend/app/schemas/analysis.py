from datetime import datetime

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
    image_path: str
