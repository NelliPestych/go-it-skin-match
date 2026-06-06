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


# Step-4 quiz bonus rules: each test pins one rule by comparing on/off engine runs.

def _baseline_features():
    """Neutral features; isolates the quiz signal under test."""
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
    """often → +BREAKOUT_BONUS on oiliness/pores-tagged products + matching reason."""
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

    acne_tagged = [
        p for p in products
        if {c.lower() for c in (p.concerns or [])} & {"oiliness", "pores"}
    ]
    assert acne_tagged, "seed catalogue must include products tagged oiliness/pores"

    boosted_count = 0
    for p in acne_tagged:
        if p.id not in boosted:
            continue
        boosted_count += 1
        assert "Helps with frequent breakouts" in boosted[p.id]["reasons"], (
            f"product {p.id} missing breakout reason: {boosted[p.id]['reasons']}"
        )
        # Delta = exact bonus when product was already scoring; ≥ bonus if rescued from 0.
        if p.id in base:
            assert (
                round(boosted[p.id]["score"] - base[p.id]["score"], 3)
                == BREAKOUT_BONUS
            ), f"product {p.id} delta != BREAKOUT_BONUS"
        else:
            assert boosted[p.id]["score"] >= BREAKOUT_BONUS
    assert boosted_count > 0, "no acne-tagged products were actually scored — fixture too narrow"


def test_sunscreen_usage_boosts_sunscreen_category(db_session):
    """rarely_never → SPF always surfaces (bonus rescues zero-scoring sunscreen)."""
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
        assert spf.id in scored_on, f"sunscreen {spf.id} missing in boosted run"
        assert "Supports daily sun protection" in scored_on[spf.id]["reasons"]
        if spf.id in scored_off:
            delta = scored_on[spf.id]["score"] - scored_off[spf.id]["score"]
            assert round(delta, 3) == SUNSCREEN_BONUS
        else:
            assert scored_on[spf.id]["score"] >= SUNSCREEN_BONUS


def test_daily_environment_boosts_pigmentation_tagged(db_session):
    """urban_pollution → +POLLUTION_BONUS on pigmentation-tagged products."""
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
    """Unknown/typo values silently no-op (don't 422, don't trigger other rules)."""
    products = ProductRepository(db_session).list()
    engine = RecommendationEngine(products)
    features = _baseline_features()
    baseline = engine.score(features, {"concerns": [], "sensitivity": False}, top_k=20)
    with_garbage = engine.score(
        features,
        {
            "concerns": [],
            "sensitivity": False,
            "breakout_frequency": "OFTEN",
            "sunscreen_usage": "nope",
            "daily_environment": "",
        },
        top_k=20,
    )
    assert [s["product_id"] for s in baseline] == [s["product_id"] for s in with_garbage]
    assert [s["score"] for s in baseline] == [s["score"] for s in with_garbage]


def test_legacy_quiz_payload_still_scores_identically_to_pre_step4(db_session):
    """Pre-Step-4 quiz dict still produces a stable non-empty ranking + no new bonuses."""
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
    for item in scored:
        for reason in item["reasons"]:
            assert reason not in (
                "Helps with frequent breakouts",
                "Supports daily sun protection",
                "Helps protect skin from pollution",
            )
