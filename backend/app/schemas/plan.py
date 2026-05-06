from typing import List

from pydantic import BaseModel


class RoutineStep(BaseModel):
    order: int
    category: str
    product_name: str
    instruction: str


class DailyRoutine(BaseModel):
    morning: List[RoutineStep]
    evening: List[RoutineStep]


class WeeklyTip(BaseModel):
    day: str
    tip: str


class BeautyPlan(BaseModel):
    analysis_id: int
    summary: str
    daily: DailyRoutine
    weekly_tips: List[WeeklyTip]
    lifestyle_tips: List[str]
