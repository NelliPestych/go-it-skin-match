"""Daily/weekly skincare plan from AI features + quiz + top products.

Quiz adjustments are independent IF-branches: routine_level="no" → 3+2 basic;
very-sensitive → drop evening treatment + patch-test tip; sunscreen=rarely_never
→ daily-SPF reminders.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.product import Product
from app.repositories.plan_repo import PlanRepository
from app.schemas.common import Level, SkinType
from app.schemas.plan import BeautyPlan, DailyRoutine, RoutineStep, WeeklyTip


# Default (advanced) routine — used when no quiz override applies.
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

# Beginner routine for routine_level == "no": foundational steps only.
_MORNING_BASIC = [
    ("cleanser", "Gently cleanse with lukewarm water."),
    ("moisturizer", "Lock in hydration with moisturizer."),
    ("sunscreen", "Finish with broad-spectrum SPF 30+."),
]

_EVENING_BASIC = [
    ("cleanser", "Cleanse to remove the day's build-up."),
    ("moisturizer", "Seal with a nourishing night moisturizer."),
]

ROUTINE_LEVEL_BEGINNER = "no"
SUNSCREEN_RARELY = "rarely_never"
SENSITIVITY_VERY = "very_sensitive"

_SENSITIVE_SKIP_CATEGORIES = {"treatment"}


def _pick_product(products: List[Product], category: str) -> Optional[Product]:
    for product in products:
        if product.category and product.category.lower() == category:
            return product
    return None


def _is_very_sensitive(quiz: Optional[Dict[str, Any]]) -> bool:
    """True if either the legacy boolean or raw_sensitivity flags very-sensitive."""
    if not quiz:
        return False
    return bool(quiz.get("sensitivity")) or quiz.get("raw_sensitivity") == SENSITIVITY_VERY


def _select_sequences(
    quiz: Optional[Dict[str, Any]],
) -> Tuple[List[Tuple[str, str]], List[Tuple[str, str]]]:
    """Pick the morning + evening (category, instruction) sequence pair."""
    quiz = quiz or {}

    if quiz.get("routine_level") == ROUTINE_LEVEL_BEGINNER:
        return list(_MORNING_BASIC), list(_EVENING_BASIC)

    morning = list(_MORNING_SEQUENCE)
    evening = list(_EVENING_SEQUENCE)

    if _is_very_sensitive(quiz):
        evening = [(cat, inst) for cat, inst in evening if cat not in _SENSITIVE_SKIP_CATEGORIES]

    return morning, evening


class PlanService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = PlanRepository(db)

    def _build_daily(
        self,
        products: List[Product],
        quiz: Optional[Dict[str, Any]] = None,
    ) -> DailyRoutine:
        morning_sequence, evening_sequence = _select_sequences(quiz)
        morning_steps: List[RoutineStep] = []
        for idx, (category, instruction) in enumerate(morning_sequence, start=1):
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
        for idx, (category, instruction) in enumerate(evening_sequence, start=1):
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

    def _build_weekly_tips(
        self,
        features: Dict[str, Any],
        quiz: Optional[Dict[str, Any]] = None,
    ) -> List[WeeklyTip]:
        tips: List[WeeklyTip] = []
        # Substitute the default AHA/BHA Monday tip with a gentler one for sensitive skin.
        if _is_very_sensitive(quiz):
            tips.append(
                WeeklyTip(day="Monday", tip="Skip acids — use a soft enzyme-based exfoliant or simply omit.")
            )
        else:
            tips.append(WeeklyTip(day="Monday", tip="Gentle exfoliation (AHA/BHA, 1×/week)."))
        if features.get("hydration_level") == Level.LOW.value:
            tips.append(WeeklyTip(day="Wednesday", tip="Apply a hydrating sheet mask."))
        if features.get("pigmentation_level") in (Level.MEDIUM.value, Level.HIGH.value):
            tips.append(WeeklyTip(day="Friday", tip="Vitamin C boost in the morning."))
        if float(features.get("pores_score", 0.0)) > 0.5:
            tips.append(WeeklyTip(day="Saturday", tip="Clay mask to refine pores."))
        tips.append(WeeklyTip(day="Sunday", tip="Skin rest day — focus on barrier care."))

        if quiz and quiz.get("sunscreen_usage") == SUNSCREEN_RARELY:
            tips.append(
                WeeklyTip(day="Every day", tip="Apply broad-spectrum SPF every morning — even indoors.")
            )

        return tips

    def _build_lifestyle_tips(
        self,
        features: Dict[str, Any],
        quiz: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        tips = [
            "Drink at least 1.5–2L of water per day.",
            "Sleep 7–8 hours; the skin barrier rebuilds at night.",
            "Re-apply SPF every 2 hours when outdoors.",
        ]
        if features.get("skin_type") == SkinType.OILY.value:
            tips.append("Avoid heavy occlusive creams during the day.")
        if features.get("redness_level") == Level.HIGH.value:
            tips.append("Reduce hot showers and very spicy foods if redness flares.")

        if _is_very_sensitive(quiz):
            tips.append(
                "Patch-test any new product on your inner arm for 24h before applying to your face."
            )
        if quiz and quiz.get("sunscreen_usage") == SUNSCREEN_RARELY:
            tips.append(
                "Make SPF the very last morning step — set a phone reminder for the first 2 weeks."
            )

        return tips

    def generate(
        self,
        user_id: int,
        analysis_id: int,
        features: Dict[str, Any],
        recommended_products: List[Product],
        quiz: Optional[Dict[str, Any]] = None,
    ) -> BeautyPlan:
        """Build and persist the beauty plan."""
        daily = self._build_daily(recommended_products, quiz=quiz)
        plan = BeautyPlan(
            analysis_id=analysis_id,
            summary=self._build_summary(features),
            daily=daily,
            weekly_tips=self._build_weekly_tips(features, quiz=quiz),
            lifestyle_tips=self._build_lifestyle_tips(features, quiz=quiz),
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
