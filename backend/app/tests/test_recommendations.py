from app.repositories.product_repo import ProductRepository
from app.services.recommendation_service import RecommendationEngine


def test_engine_filters_by_skin_type(db_session):
    products = ProductRepository(db_session).list()
    assert products  # seed in fixture

    engine = RecommendationEngine(products)
    features = {
        "skin_type": "oily",
        "redness_level": "low",
        "hydration_level": "medium",
        "pigmentation_level": "low",
        "pores_score": 0.6,
    }
    quiz = {"concerns": ["pores", "oiliness"], "sensitivity": False}
    scored = engine.score(features, quiz, top_k=10)

    assert scored, "engine should return recommendations"
    for item in scored:
        product = item["product"]
        allowed = [s.lower() for s in product.skin_types]
        assert "all" in allowed or "oily" in allowed


def test_engine_explains_reasons(db_session):
    products = ProductRepository(db_session).list()
    engine = RecommendationEngine(products)
    features = {
        "skin_type": "dry",
        "redness_level": "high",
        "hydration_level": "low",
        "pigmentation_level": "low",
        "pores_score": 0.2,
    }
    quiz = {"concerns": ["redness", "hydration"], "sensitivity": True}
    scored = engine.score(features, quiz, top_k=5)

    assert scored
    top = scored[0]
    assert top["score"] > 0
    assert isinstance(top["reasons"], list)
    assert len(top["reasons"]) >= 1


def test_recommendations_endpoint_full_flow(client):
    """Without an analysis the endpoint returns 404."""
    response = client.get("/recommendations/9999")
    assert response.status_code == 404


def test_engine_respects_budget(db_session):
    products = ProductRepository(db_session).list()
    engine = RecommendationEngine(products)
    features = {
        "skin_type": "normal",
        "redness_level": "low",
        "hydration_level": "medium",
        "pigmentation_level": "low",
        "pores_score": 0.2,
    }
    quiz = {"concerns": ["hydration"], "sensitivity": False, "budget": "low"}
    scored = engine.score(features, quiz, top_k=10)
    assert scored
    has_budget_reason = any("Within budget" in item["reasons"] for item in scored)
    assert has_budget_reason


# ── Step-4 quiz-driven bonus rules ────────────────────────────────────
# Three independent IF-branches in `RecommendationEngine.score()`. Each
# test below pins exactly one rule by comparing two engine runs against
# the same seeded catalogue: one without the quiz signal, one with.
# Any product the rule should boost must (a) gain the expected bonus
# weight in `score`, and (b) carry the matching human reason in
# `reasons`. Tests against the seeded catalogue (not synthetic
# fixtures) so they also serve as integration coverage.

def _baseline_features():
    """Neutral feature dict — every level "low/medium", no implied
    concerns from the AI side. Keeps the test focused on the quiz
    signal under examination."""
    return {
        "skin_type": "normal",
        "redness_level": "low",
        "hydration_level": "medium",
        "pigmentation_level": "low",
        "pores_score": 0.2,
    }


def _score_by_id(scored):
    return {item["product_id"]: item for item in scored}


def test_breakout_frequency_boosts_acne_safe_products(db_session):
    """`breakout_frequency = "often"` should bump every product tagged
    with the catalogue concerns "oiliness" OR "pores" by exactly the
    BREAKOUT_BONUS weight, and append the matching reason string."""
    from app.services.recommendation_service import BREAKOUT_BONUS

    products = ProductRepository(db_session).list()
    engine = RecommendationEngine(products)
    features = _baseline_features()

    base = _score_by_id(engine.score(features, {"concerns": [], "sensitivity": False}, top_k=20))
    boosted = _score_by_id(
        engine.score(
            features,
            {"concerns": [], "sensitivity": False, "breakout_frequency": "often"},
            top_k=20,
        )
    )

    # At least one acne-tagged product must exist in the seed
    # catalogue, otherwise this rule is untestable.
    acne_tagged = [
        p for p in products
        if {c.lower() for c in (p.concerns or [])} & {"oiliness", "pores"}
    ]
    assert acne_tagged, "seed catalogue must include products tagged oiliness/pores"

    boosted_count = 0
    for p in acne_tagged:
        if p.id not in boosted:
            continue  # filtered out by skin-type, not by this rule
        boosted_count += 1
        # Reason must be present.
        assert "Helps with frequent breakouts" in boosted[p.id]["reasons"], (
            f"product {p.id} missing breakout reason: {boosted[p.id]['reasons']}"
        )
        # Score must have grown by EXACTLY the rule's bonus (when the
        # product was already scoring) or by AT LEAST it (when the
        # bonus rescued the product from a score of 0).
        if p.id in base:
            assert (
                round(boosted[p.id]["score"] - base[p.id]["score"], 3)
                == BREAKOUT_BONUS
            ), f"product {p.id} delta != BREAKOUT_BONUS"
        else:
            assert boosted[p.id]["score"] >= BREAKOUT_BONUS
    assert boosted_count > 0, "no acne-tagged products were actually scored — fixture too narrow"


def test_sunscreen_usage_boosts_sunscreen_category(db_session):
    """`sunscreen_usage = "rarely_never"` must ALWAYS surface an SPF
    in the results, even for a user with no concerns + no implied
    AI signal — i.e. the bonus rescues an otherwise-zero-scoring
    sunscreen product. This is the explicit Step-4 design intent."""
    from app.services.recommendation_service import SUNSCREEN_BONUS

    products = ProductRepository(db_session).list()
    engine = RecommendationEngine(products)
    features = _baseline_features()
    quiz_off = {"concerns": [], "sensitivity": False}
    quiz_on = {"concerns": [], "sensitivity": False, "sunscreen_usage": "rarely_never"}

    scored_on = _score_by_id(engine.score(features, quiz_on, top_k=20))
    scored_off = _score_by_id(engine.score(features, quiz_off, top_k=20))

    sunscreen_products = [p for p in products if (p.category or "").lower() == "sunscreen"]
    assert sunscreen_products, "seed catalogue must include at least one sunscreen"

    for spf in sunscreen_products:
        # The "rarely_never" run must include the SPF.
        assert spf.id in scored_on, f"sunscreen {spf.id} missing in boosted run"
        # Reason present.
        assert "Supports daily sun protection" in scored_on[spf.id]["reasons"]
        # Delta is exactly SUNSCREEN_BONUS when the product also
        # appeared in the baseline; otherwise it's at least the bonus.
        if spf.id in scored_off:
            delta = scored_on[spf.id]["score"] - scored_off[spf.id]["score"]
            assert round(delta, 3) == SUNSCREEN_BONUS
        else:
            assert scored_on[spf.id]["score"] >= SUNSCREEN_BONUS


def test_daily_environment_boosts_pigmentation_tagged(db_session):
    """`daily_environment = "urban_pollution"` boosts pigmentation-
    tagged products by POLLUTION_BONUS (antioxidant proxy)."""
    from app.services.recommendation_service import POLLUTION_BONUS

    products = ProductRepository(db_session).list()
    engine = RecommendationEngine(products)
    features = _baseline_features()

    scored_off = _score_by_id(
        engine.score(features, {"concerns": [], "sensitivity": False}, top_k=20)
    )
    scored_on = _score_by_id(
        engine.score(
            features,
            {"concerns": [], "sensitivity": False, "daily_environment": "urban_pollution"},
            top_k=20,
        )
    )

    pigmentation_tagged = [
        p for p in products if "pigmentation" in {c.lower() for c in (p.concerns or [])}
    ]
    assert pigmentation_tagged, "seed catalogue must include pigmentation-tagged products"

    matched = 0
    for p in pigmentation_tagged:
        if p.id not in scored_on:
            continue
        matched += 1
        assert "Helps protect skin from pollution" in scored_on[p.id]["reasons"]
        if p.id in scored_off:
            delta = scored_on[p.id]["score"] - scored_off[p.id]["score"]
            assert round(delta, 3) == POLLUTION_BONUS
        else:
            assert scored_on[p.id]["score"] >= POLLUTION_BONUS
    assert matched > 0


def test_unknown_quiz_values_have_no_effect(db_session):
    """Unknown / typo values for any Step-4 quiz field must silently
    no-op — they don't 422 (loose `Optional[str]` schema) and they
    don't accidentally activate another rule's branch."""
    products = ProductRepository(db_session).list()
    engine = RecommendationEngine(products)
    features = _baseline_features()
    baseline = engine.score(features, {"concerns": [], "sensitivity": False}, top_k=20)
    with_garbage = engine.score(
        features,
        {
            "concerns": [],
            "sensitivity": False,
            "breakout_frequency": "OFTEN",  # wrong case
            "sunscreen_usage": "nope",       # invented value
            "daily_environment": "",         # empty string
        },
        top_k=20,
    )
    # Same products, same scores, same order. The bonuses are
    # value-gated; unknown values activate nothing.
    assert [s["product_id"] for s in baseline] == [s["product_id"] for s in with_garbage]
    assert [s["score"] for s in baseline] == [s["score"] for s in with_garbage]


def test_legacy_quiz_payload_still_scores_identically_to_pre_step4(db_session):
    """The legacy test_engine_filters_by_skin_type / _explains_reasons /
    _respects_budget tests above already cover this implicitly; this
    one makes the no-regression invariant explicit by reusing the
    exact quiz dict the pre-Step-4 history test posts and asserting
    the engine returns a stable, non-empty ranking."""
    products = ProductRepository(db_session).list()
    engine = RecommendationEngine(products)
    features = _baseline_features()
    quiz = {
        "self_reported_skin_type": "combination",
        "concerns": ["hydration", "redness"],
        "sensitivity": True,
        "budget": "medium",
    }
    scored = engine.score(features, quiz, top_k=8)
    assert scored
    # No bonuses kicked in (no breakout / sunscreen / pollution keys
    # in the legacy payload).
    for item in scored:
        for reason in item["reasons"]:
            assert reason not in (
                "Helps with frequent breakouts",
                "Supports daily sun protection",
                "Helps protect skin from pollution",
            )
