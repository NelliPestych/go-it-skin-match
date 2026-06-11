"""Rule-based scoring engine combining AI features + quiz + product catalog.

Skin-type hard filter; per-product score accumulates concern matches, core-category
coverage, budget alignment, and Step-4 quiz bonuses. Each rule emits a reason.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.product import Product
from app.repositories.product_repo import ProductRepository
from app.repositories.recommendation_repo import RecommendationRepository
from app.schemas.common import Concern, Level, SkinType


CONCERN_TO_FEATURE = {
    Concern.REDNESS.value: ("redness_level", "Calms redness"),
    Concern.PIGMENTATION.value: ("pigmentation_level", "Targets pigmentation"),
    Concern.HYDRATION.value: ("hydration_level", "Boosts hydration"),
    Concern.PORES.value: ("pores_score", "Refines pores"),
    Concern.OILINESS.value: (None, "Controls oiliness"),
    Concern.SENSITIVITY.value: (None, "Suitable for sensitive skin"),
}


CORE_CATEGORIES = ("cleanser", "moisturizer", "serum", "sunscreen")


# Step-4 quiz bonuses — moderate so they nudge rather than dominate AI signal.
BREAKOUT_BONUS = 0.5
SUNSCREEN_BONUS = 0.6
POLLUTION_BONUS = 0.3

BREAKOUT_ACTIVE_VALUE = "often"
SUNSCREEN_ACTIVE_VALUE = "rarely_never"
POLLUTION_ACTIVE_VALUE = "urban_pollution"

# Seed catalogue tags — keep in sync if those labels change.
ACNE_TAG_CONCERNS = ("oiliness", "pores")
ANTIOXIDANT_TAG_CONCERN = "pigmentation"
SUNSCREEN_CATEGORY = "sunscreen"

# Confidence-aware fusion thresholds.
AI_CONF_HIGH = 0.75
AI_CONF_LOW = 0.50
AI_WEIGHT_FLOOR = 0.3
AI_WEIGHT_CEIL = 1.0
_VALID_QUIZ_SKIN_TYPES = {
    SkinType.DRY.value,
    SkinType.OILY.value,
    SkinType.COMBINATION.value,
    SkinType.NORMAL.value,
}


def ai_weight(confidence: float) -> float:
    """Linear ramp from AI_WEIGHT_FLOOR (at AI_CONF_LOW) to 1.0 (at AI_CONF_HIGH)."""
    if confidence >= AI_CONF_HIGH:
        return AI_WEIGHT_CEIL
    if confidence <= AI_CONF_LOW:
        return AI_WEIGHT_FLOOR
    span = AI_CONF_HIGH - AI_CONF_LOW
    return AI_WEIGHT_FLOOR + (AI_WEIGHT_CEIL - AI_WEIGHT_FLOOR) * (
        (confidence - AI_CONF_LOW) / span
    )


def resolve_skin_type(
    features: Dict[str, Any],
    quiz: Dict[str, Any],
) -> Tuple[str, str]:
    """Return (skin_type, resolution_tag); quiz overrides AI when AI confidence < AI_CONF_LOW."""
    ai_type = features.get("skin_type", SkinType.NORMAL.value)
    try:
        ai_conf = float(features.get("confidence_score", 0.7))
    except (TypeError, ValueError):
        ai_conf = 0.7

    quiz_type_raw = quiz.get("self_reported_skin_type")
    quiz_type = (
        quiz_type_raw
        if isinstance(quiz_type_raw, str) and quiz_type_raw in _VALID_QUIZ_SKIN_TYPES
        else None
    )

    if ai_conf >= AI_CONF_HIGH:
        return ai_type, "ai_high_confidence"
    if ai_conf < AI_CONF_LOW:
        if quiz_type is not None:
            return quiz_type, "low_confidence_quiz_override"
        return SkinType.NORMAL.value, "low_confidence_default"
    return ai_type, "ai_medium_confidence"


def _level_to_weight(level: str) -> float:
    return {Level.LOW.value: 0.3, Level.MEDIUM.value: 0.6, Level.HIGH.value: 1.0}.get(level, 0.5)


def _features_implied_concerns(features: Dict[str, Any]) -> List[Tuple[str, float]]:
    implied: List[Tuple[str, float]] = []
    if features.get("redness_level") in (Level.MEDIUM.value, Level.HIGH.value):
        implied.append((Concern.REDNESS.value, _level_to_weight(features["redness_level"])))
    if features.get("pigmentation_level") in (Level.MEDIUM.value, Level.HIGH.value):
        implied.append(
            (Concern.PIGMENTATION.value, _level_to_weight(features["pigmentation_level"]))
        )
    if features.get("hydration_level") in (Level.LOW.value, Level.MEDIUM.value):
        # low hydration = strong need
        weight = 1.0 if features["hydration_level"] == Level.LOW.value else 0.5
        implied.append((Concern.HYDRATION.value, weight))
    pores_score = float(features.get("pores_score", 0.0))
    if pores_score > 0.45:
        implied.append((Concern.PORES.value, min(pores_score, 1.0)))
    if features.get("skin_type") == SkinType.OILY.value:
        implied.append((Concern.OILINESS.value, 0.8))
    return implied


def _budget_to_max_price(budget: Optional[str]) -> Optional[float]:
    if not budget:
        return None
    return {"low": 20.0, "medium": 50.0, "high": 200.0}.get(budget.lower())


class RecommendationEngine:
    def __init__(self, products: Iterable[Product]):
        self.products = list(products)

    def score(
        self,
        features: Dict[str, Any],
        quiz: Dict[str, Any],
        top_k: int = 8,
    ) -> List[Dict[str, Any]]:
        skin_type, _resolution = resolve_skin_type(features, quiz)
        try:
            confidence = float(features.get("confidence_score", 0.7))
        except (TypeError, ValueError):
            confidence = 0.7
        ai_mult = ai_weight(confidence)

        sensitivity = bool(quiz.get("sensitivity"))
        user_concerns: List[str] = list(quiz.get("concerns") or [])
        budget_cap = _budget_to_max_price(quiz.get("budget"))

        # Any non-matching quiz value silently disables its bonus.
        boost_acne_safe = quiz.get("breakout_frequency") == BREAKOUT_ACTIVE_VALUE
        boost_sunscreen = quiz.get("sunscreen_usage") == SUNSCREEN_ACTIVE_VALUE
        boost_pollution = quiz.get("daily_environment") == POLLUTION_ACTIVE_VALUE

        # AI-implied concerns scaled by ai_mult; quiz concerns fixed at 0.7.
        weights: Dict[str, float] = {c: 0.7 for c in user_concerns}
        for concern, w in _features_implied_concerns(features):
            weighted = w * ai_mult
            weights[concern] = max(weights.get(concern, 0.0), weighted)
        if sensitivity:
            weights[Concern.SENSITIVITY.value] = 1.0

        scored: List[Dict[str, Any]] = []
        for product in self.products:
            allowed_skins = [s.lower() for s in (product.skin_types or [])]
            if allowed_skins and "all" not in allowed_skins and skin_type.lower() not in allowed_skins:
                continue

            reasons: List[str] = []
            score = 0.0

            product_concerns = {c.lower() for c in (product.concerns or [])}
            for concern, weight in weights.items():
                if concern in product_concerns:
                    label = CONCERN_TO_FEATURE.get(concern, (None, concern))[1]
                    score += 1.0 * weight
                    reasons.append(label)

            if product.category and product.category.lower() in CORE_CATEGORIES:
                score += 0.4
                reasons.append(f"Covers core step: {product.category}")

            if allowed_skins and skin_type.lower() in allowed_skins:
                score += 0.3
                reasons.append(f"Suited to {skin_type} skin")

            if budget_cap is not None and product.price and product.price <= budget_cap:
                score += 0.2
                reasons.append("Within budget")

            # Quiz bonuses may unlock otherwise zero-scoring products (e.g. SPF stays in ranking).
            product_category = (product.category or "").lower()

            if boost_acne_safe and product_concerns & set(ACNE_TAG_CONCERNS):
                score += BREAKOUT_BONUS
                reasons.append("Helps with frequent breakouts")

            if boost_sunscreen and product_category == SUNSCREEN_CATEGORY:
                score += SUNSCREEN_BONUS
                reasons.append("Supports daily sun protection")

            if boost_pollution and ANTIOXIDANT_TAG_CONCERN in product_concerns:
                score += POLLUTION_BONUS
                reasons.append("Helps protect skin from pollution")

            if score <= 0:
                continue

            scored.append(
                {
                    "product_id": product.id,
                    "product": product,
                    "score": round(score, 3),
                    "reasons": reasons,
                }
            )

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]


class RecommendationService:
    def __init__(self, db: Session):
        self.db = db
        self.product_repo = ProductRepository(db)
        self.repo = RecommendationRepository(db)

    def generate(
        self,
        user_id: int,
        analysis_id: int,
        features: Dict[str, Any],
        quiz: Dict[str, Any],
        top_k: int = 8,
    ) -> List[Dict[str, Any]]:
        engine = RecommendationEngine(self.product_repo.list())
        scored = engine.score(features, quiz, top_k=top_k)
        self.repo.replace_for_analysis(
            user_id=user_id,
            analysis_id=analysis_id,
            items=[
                {"product_id": s["product_id"], "score": s["score"], "reasons": s["reasons"]}
                for s in scored
            ],
        )
        return scored

    def list_for_analysis(self, analysis_id: int) -> List[Dict[str, Any]]:
        records = self.repo.list_for_analysis(analysis_id)
        return [
            {
                "product": r.product,
                "score": r.score,
                "reasons": (r.reason_json or {}).get("reasons", []),
            }
            for r in records
        ]
