"""Rule-based + scoring recommendation engine.

Inputs:
- skin features from the AI analyzer (skin_type, levels, scores)
- quiz answers (concerns, sensitivity, age, budget, ...)
- product catalog from the database

Strategy:
- Hard filter: products incompatible with the skin type are dropped.
- Score: each product accumulates points for matching concerns
  (weighted by user emphasis and AI severity), category coverage,
  and price-vs-budget alignment. Each contributing rule emits a
  human-readable reason — these reasons are persisted alongside
  the recommendation so the UI can explain *why*.
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


# ── Step-4 quiz-driven bonus weights ──────────────────────────────────
# Each constant is a small, fixed score bump applied per product when
# the user's Step-4 quiz answer indicates a relevant signal. Centralised
# at module scope so they're easy to find, tune, and reference in tests.
# Values are deliberately moderate (smaller than full concern matches)
# so they NUDGE the ranking without overwhelming the AI signal.
#
# Match the seed catalogue's existing concern / category tags exactly —
# no ingredient parsing or free-text heuristics.
BREAKOUT_BONUS = 0.5   # frequent breakouts → boost oiliness / pores tagged
SUNSCREEN_BONUS = 0.6  # rare-sunscreen users → boost sunscreen category
POLLUTION_BONUS = 0.3  # urban pollution     → boost pigmentation (antioxidant proxy)

# Quiz-answer values that activate each bonus. Listed here (not as
# enums on the schema) for explainability: any other value silently
# means "no bonus", which keeps the engine robust to UI evolution.
BREAKOUT_ACTIVE_VALUE = "often"
SUNSCREEN_ACTIVE_VALUE = "rarely_never"
POLLUTION_ACTIVE_VALUE = "urban_pollution"

# Catalogue tags the rules look for. Hard-coded by intent — the seed
# catalogue uses exactly these concern labels, and the rules' meaning
# would change if these were edited.
ACNE_TAG_CONCERNS = ("oiliness", "pores")
ANTIOXIDANT_TAG_CONCERN = "pigmentation"
SUNSCREEN_CATEGORY = "sunscreen"


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
        skin_type = features.get("skin_type", SkinType.NORMAL.value)
        sensitivity = bool(quiz.get("sensitivity"))
        user_concerns: List[str] = list(quiz.get("concerns") or [])
        budget_cap = _budget_to_max_price(quiz.get("budget"))

        # Step-4 quiz signals.  Each variable resolves to True iff the
        # user's answer is exactly the value documented in the matching
        # bonus constant above.  Any other value (None, typo, future
        # UI string) silently means "no bonus" — that's the
        # deterministic graceful-degradation policy.
        boost_acne_safe = quiz.get("breakout_frequency") == BREAKOUT_ACTIVE_VALUE
        boost_sunscreen = quiz.get("sunscreen_usage") == SUNSCREEN_ACTIVE_VALUE
        boost_pollution = quiz.get("daily_environment") == POLLUTION_ACTIVE_VALUE

        # combine user-declared concerns and AI-implied ones
        weights: Dict[str, float] = {c: 0.7 for c in user_concerns}
        for concern, w in _features_implied_concerns(features):
            weights[concern] = max(weights.get(concern, 0.0), w)
        if sensitivity:
            weights[Concern.SENSITIVITY.value] = 1.0

        scored: List[Dict[str, Any]] = []
        for product in self.products:
            allowed_skins = [s.lower() for s in (product.skin_types or [])]
            if allowed_skins and "all" not in allowed_skins and skin_type.lower() not in allowed_skins:
                continue

            reasons: List[str] = []
            score = 0.0

            # concern matches
            product_concerns = {c.lower() for c in (product.concerns or [])}
            for concern, weight in weights.items():
                if concern in product_concerns:
                    label = CONCERN_TO_FEATURE.get(concern, (None, concern))[1]
                    score += 1.0 * weight
                    reasons.append(label)

            # core category coverage
            if product.category and product.category.lower() in CORE_CATEGORIES:
                score += 0.4
                reasons.append(f"Covers core step: {product.category}")

            # skin-type fit
            if allowed_skins and skin_type.lower() in allowed_skins:
                score += 0.3
                reasons.append(f"Suited to {skin_type} skin")

            # budget alignment
            if budget_cap is not None and product.price and product.price <= budget_cap:
                score += 0.2
                reasons.append("Within budget")

            # ── Step-4 quiz-driven bonuses ─────────────────────────
            # Three small, fixed bumps. Each rule:
            #  - reads ONE quiz field
            #  - matches against a STATIC catalogue tag
            #  - adds a fixed weight + a single explanatory reason
            # No ingredient parsing, no thresholds, no compounding.
            # Bonuses also unlock otherwise-zero-scoring products
            # (e.g. an SPF stays in the ranking for a non-SPF user)
            # because the score check below runs AFTER these bumps.
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
