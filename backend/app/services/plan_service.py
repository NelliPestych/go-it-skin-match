"""Beauty plan generator.

Combines AI features, quiz answers, and the top recommended products
into a structured daily/weekly skincare plan. The output is opinionated
but auditable — every step references a category from the catalogue and
the chosen product (if available).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.product import Product
from app.repositories.plan_repo import PlanRepository
from app.schemas.common import Level, SkinType
from app.schemas.plan import BeautyPlan, DailyRoutine, RoutineStep, WeeklyTip


_MORNING_SEQUENCE = [
    ("cleanser", "Gently cleanse with lukewarm water."),
    ("toner", "Apply toner to balance the skin barrier."),
    ("serum", "Massage serum into the face for active ingredient delivery."),
    ("moisturizer", "Lock in hydration with moisturizer."),
    ("sunscreen", "Finish with broad-spectrum SPF 30+."),
]

_EVENING_SEQUENCE = [
    ("cleanser", "Double-cleanse to remove sunscreen and impurities."),
    ("treatment", "Apply targeted treatment (retinol/acid) 2–3× per week."),
    ("serum", "Layer hydrating serum."),
    ("moisturizer", "Seal with a richer night moisturizer."),
]


def _pick_product(products: List[Product], category: str) -> Optional[Product]:
    for product in products:
        if product.category and product.category.lower() == category:
            return product
    return None


class PlanService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = PlanRepository(db)

    def _build_daily(self, products: List[Product]) -> DailyRoutine:
        morning_steps: List[RoutineStep] = []
        for idx, (category, instruction) in enumerate(_MORNING_SEQUENCE, start=1):
            product = _pick_product(products, category)
            morning_steps.append(
                RoutineStep(
                    order=idx,
                    category=category,
                    product_name=f"{product.brand} — {product.name}" if product else "(choose a product)",
                    instruction=instruction,
                )
            )
        evening_steps: List[RoutineStep] = []
        for idx, (category, instruction) in enumerate(_EVENING_SEQUENCE, start=1):
            product = _pick_product(products, category)
            evening_steps.append(
                RoutineStep(
                    order=idx,
                    category=category,
                    product_name=f"{product.brand} — {product.name}" if product else "(choose a product)",
                    instruction=instruction,
                )
            )
        return DailyRoutine(morning=morning_steps, evening=evening_steps)

    def _build_summary(self, features: Dict[str, Any]) -> str:
        skin_type = features.get("skin_type", SkinType.NORMAL.value)
        return (
            f"Personalized routine for {skin_type} skin. "
            f"Hydration: {features.get('hydration_level', 'unknown')}. "
            f"Redness: {features.get('redness_level', 'unknown')}. "
            f"Pigmentation: {features.get('pigmentation_level', 'unknown')}."
        )

    def _build_weekly_tips(self, features: Dict[str, Any]) -> List[WeeklyTip]:
        tips: List[WeeklyTip] = []
        tips.append(WeeklyTip(day="Monday", tip="Gentle exfoliation (AHA/BHA, 1×/week)."))
        if features.get("hydration_level") == Level.LOW.value:
            tips.append(WeeklyTip(day="Wednesday", tip="Apply a hydrating sheet mask."))
        if features.get("pigmentation_level") in (Level.MEDIUM.value, Level.HIGH.value):
            tips.append(WeeklyTip(day="Friday", tip="Vitamin C boost in the morning."))
        if float(features.get("pores_score", 0.0)) > 0.5:
            tips.append(WeeklyTip(day="Saturday", tip="Clay mask to refine pores."))
        tips.append(WeeklyTip(day="Sunday", tip="Skin rest day — focus on barrier care."))
        return tips

    def _build_lifestyle_tips(self, features: Dict[str, Any]) -> List[str]:
        tips = [
            "Drink at least 1.5–2L of water per day.",
            "Sleep 7–8 hours; the skin barrier rebuilds at night.",
            "Re-apply SPF every 2 hours when outdoors.",
        ]
        if features.get("skin_type") == SkinType.OILY.value:
            tips.append("Avoid heavy occlusive creams during the day.")
        if features.get("redness_level") == Level.HIGH.value:
            tips.append("Reduce hot showers and very spicy foods if redness flares.")
        return tips

    def generate(
        self,
        user_id: int,
        analysis_id: int,
        features: Dict[str, Any],
        recommended_products: List[Product],
    ) -> BeautyPlan:
        daily = self._build_daily(recommended_products)
        plan = BeautyPlan(
            analysis_id=analysis_id,
            summary=self._build_summary(features),
            daily=daily,
            weekly_tips=self._build_weekly_tips(features),
            lifestyle_tips=self._build_lifestyle_tips(features),
        )
        self.repo.upsert(
            user_id=user_id,
            analysis_id=analysis_id,
            plan=plan.model_dump(mode="json"),
        )
        return plan

    def get(self, analysis_id: int) -> Optional[BeautyPlan]:
        record = self.repo.get_by_analysis(analysis_id)
        if not record:
            return None
        return BeautyPlan.model_validate(record.plan_json)
