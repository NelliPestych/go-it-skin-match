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
