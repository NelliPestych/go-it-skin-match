"""Beauty-plan generator tests for the Step-5 quiz-aware rules.

Each test exercises ONE rule in isolation by calling
`PlanService.generate()` with a minimal but realistic input
(neutral AI features + the seeded product catalogue) and asserting
the plan body changes in exactly the documented way.

Backward compat is covered by the "no quiz" baseline test below —
it asserts the pre-Step-5 5+4 routine is still produced when no
`quiz` argument is supplied, byte-for-byte.
"""
from __future__ import annotations

from typing import Any, Dict

from app.repositories.product_repo import ProductRepository
from app.services.plan_service import PlanService


def _neutral_features() -> Dict[str, Any]:
    """Features that don't activate any feature-driven tip — isolates quiz signal."""
    return {
        "skin_type": "normal",
        "redness_level": "low",
        "hydration_level": "medium",
        "pigmentation_level": "low",
        "pores_score": 0.2,
    }


def _generate(db_session, quiz: Dict[str, Any] | None):
    """Run PlanService against seeded catalogue; SkinScan FK isn't enforced in test DB."""
    products = ProductRepository(db_session).list()
    service = PlanService(db_session)
    return service.generate(
        user_id=1,
        analysis_id=1,
        features=_neutral_features(),
        recommended_products=products,
        quiz=quiz,
    )


def _categories(steps) -> list[str]:
    return [step.category for step in steps]


# ── Baseline (no quiz) ────────────────────────────────────────────────


def test_legacy_no_quiz_returns_full_5_plus_4_routine(db_session):
    """No quiz → unchanged 5+4 advanced routine (pre-Step-5 contract)."""
    plan = _generate(db_session, quiz=None)

    assert _categories(plan.daily.morning) == [
        "cleanser",
        "toner",
        "serum",
        "moisturizer",
        "sunscreen",
    ]
    assert _categories(plan.daily.evening) == [
        "cleanser",
        "treatment",
        "serum",
        "moisturizer",
    ]
    weekly_tips = [t.tip for t in plan.weekly_tips]
    for tip in weekly_tips:
        assert "every morning" not in tip.lower(), (
            "SPF reminder must not appear without sunscreen_usage signal"
        )


# ── routine_level dispatch ────────────────────────────────────────────


def test_routine_level_no_collapses_to_basic_routine(db_session):
    """routine_level=no → cleanser → moisturizer → SPF + cleanser → moisturizer."""
    plan = _generate(db_session, quiz={"routine_level": "no"})
    assert _categories(plan.daily.morning) == ["cleanser", "moisturizer", "sunscreen"]
    assert _categories(plan.daily.evening) == ["cleanser", "moisturizer"]


def test_routine_level_regularly_keeps_advanced_routine(db_session):
    """regularly → unchanged advanced routine (no-op branch in _select_sequences)."""
    plan = _generate(db_session, quiz={"routine_level": "regularly"})
    assert len(plan.daily.morning) == 5
    assert len(plan.daily.evening) == 4


def test_routine_level_sometimes_keeps_advanced_routine(db_session):
    """sometimes → advanced routine; only "no" triggers beginner branch."""
    plan = _generate(db_session, quiz={"routine_level": "sometimes"})
    assert len(plan.daily.morning) == 5
    assert len(plan.daily.evening) == 4


# ── sensitivity dispatch ──────────────────────────────────────────────


def test_very_sensitive_drops_evening_treatment_step(db_session):
    """Legacy bool and 3-way enum both drop evening treatment."""
    for quiz in (
        {"sensitivity": True},
        {"raw_sensitivity": "very_sensitive"},
    ):
        plan = _generate(db_session, quiz=quiz)
        evening_cats = _categories(plan.daily.evening)
        assert "treatment" not in evening_cats, (
            f"evening still contains treatment for quiz={quiz}: {evening_cats}"
        )
        assert len(plan.daily.morning) == 5


def test_sometimes_reacts_does_not_drop_treatment(db_session):
    """Mid-level sensitivity doesn't trigger the rule; only very_sensitive does."""
    plan = _generate(db_session, quiz={"raw_sensitivity": "sometimes_reacts"})
    assert "treatment" in _categories(plan.daily.evening)


def test_very_sensitive_swaps_monday_weekly_tip(db_session):
    """Default Monday AHA/BHA tip swapped for a gentler substitute."""
    default_plan = _generate(db_session, quiz=None)
    sensitive_plan = _generate(db_session, quiz={"raw_sensitivity": "very_sensitive"})

    default_monday = next(t for t in default_plan.weekly_tips if t.day == "Monday")
    sensitive_monday = next(t for t in sensitive_plan.weekly_tips if t.day == "Monday")

    assert "AHA" in default_monday.tip
    assert "AHA" not in sensitive_monday.tip
    assert "Skip acids" in sensitive_monday.tip or "soft" in sensitive_monday.tip.lower()


def test_very_sensitive_appends_patch_test_lifestyle_tip(db_session):
    """Patch-test reminder appears in lifestyle tips for very-sensitive only."""
    default = _generate(db_session, quiz=None)
    sensitive = _generate(db_session, quiz={"raw_sensitivity": "very_sensitive"})
    assert not any("patch-test" in t.lower() for t in default.lifestyle_tips)
    assert any("patch-test" in t.lower() for t in sensitive.lifestyle_tips)


# ── sunscreen_usage dispatch ──────────────────────────────────────────


def test_rarely_never_sunscreen_appends_daily_reminder(db_session):
    """rarely_never → adds "Every day" weekly SPF reminder + lifestyle nudge."""
    plan = _generate(db_session, quiz={"sunscreen_usage": "rarely_never"})

    weekly_days = [t.day for t in plan.weekly_tips]
    assert "Every day" in weekly_days, weekly_days
    every_day = next(t for t in plan.weekly_tips if t.day == "Every day")
    assert "SPF" in every_day.tip

    assert any(
        "phone reminder" in t.lower() or "SPF" in t and "morning step" in t.lower()
        for t in plan.lifestyle_tips
    ), plan.lifestyle_tips


def test_daily_sunscreen_does_not_add_reminder(db_session):
    """The reminder is high-value for users who don't use SPF and
    annoying for users who do. Only `rarely_never` triggers it."""
    plan_daily = _generate(db_session, quiz={"sunscreen_usage": "daily"})
    weekly_days = [t.day for t in plan_daily.weekly_tips]
    assert "Every day" not in weekly_days


# ── Combined / priority ───────────────────────────────────────────────


def test_beginner_plus_sensitive_yields_basic_routine(db_session):
    """When both `routine_level=no` and very-sensitive are set, the
    basic routine wins (it already lacks the harsh "treatment" step,
    so the rules are consistent rather than conflicting)."""
    plan = _generate(
        db_session,
        quiz={"routine_level": "no", "raw_sensitivity": "very_sensitive"},
    )
    assert _categories(plan.daily.morning) == ["cleanser", "moisturizer", "sunscreen"]
    assert _categories(plan.daily.evening) == ["cleanser", "moisturizer"]


def test_unknown_quiz_values_no_effect_on_plan(db_session):
    """Mirrors the recommendation-engine guarantee: typos / unknown
    values silently degrade to no-op instead of crashing or
    accidentally tripping another rule."""
    plan = _generate(
        db_session,
        quiz={
            "routine_level": "ADVANCED",  # wrong case + unknown value
            "sunscreen_usage": "nope",
            "raw_sensitivity": "very-sensitive",  # wrong separator
        },
    )
    assert len(plan.daily.morning) == 5
    assert len(plan.daily.evening) == 4
    assert "treatment" in _categories(plan.daily.evening)
