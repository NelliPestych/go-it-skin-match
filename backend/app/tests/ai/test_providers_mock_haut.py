"""MockHautAIProvider contract tests + factory routing."""
from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from app.ai.providers import (
    LocalHeuristicProvider,
    MockHautAIProvider,
    get_skin_analysis_provider,
)
from app.ai.providers.factory import get_skin_analysis_provider as factory_fn
from app.schemas.common import Level, SkinType
from app.schemas.skin_analysis import NormalizedSkinAnalysisResult


def _synthetic_image(color=(180, 150, 140), size=256, seed: int = 0) -> bytes:
    """Reproducible JPEG bytes — mock is keyed off the byte hash."""
    rng = np.random.default_rng(seed)
    arr = np.full((size, size, 3), color, dtype=np.uint8)
    noise = rng.integers(-15, 15, arr.shape, dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ── Core contract ────────────────────────────────────────────────────


def test_mock_provider_returns_normalized_result():
    provider = MockHautAIProvider()
    result = provider.analyze(_synthetic_image(seed=1))

    assert isinstance(result, NormalizedSkinAnalysisResult)
    assert result.provider == "mock_haut"
    assert result.skin_type in SkinType
    for level in (
        result.redness_level,
        result.hydration_level,
        result.pigmentation_level,
        result.oiliness,
        result.acne,
        result.fine_lines,
        result.texture,
    ):
        assert level in Level
    assert 0.0 <= result.pores_score <= 1.0
    assert 0.0 <= result.confidence_score <= 1.0


def test_mock_provider_is_deterministic_per_image():
    """Same bytes → same result (except analyzed_at)."""
    provider = MockHautAIProvider()
    image = _synthetic_image(seed=42)

    a = provider.analyze(image)
    b = provider.analyze(image)

    assert a.model_dump(exclude={"analyzed_at"}) == b.model_dump(exclude={"analyzed_at"})


def test_mock_provider_varies_per_image():
    """Different images → different mock_seed (other fields may collide by chance)."""
    provider = MockHautAIProvider()
    image_a = _synthetic_image(color=(200, 180, 170), seed=1)
    image_b = _synthetic_image(color=(120, 100, 95), seed=2)

    a = provider.analyze(image_a)
    b = provider.analyze(image_b)

    assert a.raw_summary is not None and b.raw_summary is not None
    assert a.raw_summary["mock_seed"] != b.raw_summary["mock_seed"]


def test_mock_provider_confidence_in_credible_band():
    """Confidence stays in [0.70, 0.99] — demo-credible band."""
    provider = MockHautAIProvider()
    for seed in range(1, 11):
        result = provider.analyze(_synthetic_image(seed=seed))
        assert 0.70 <= result.confidence_score <= 0.99, (
            f"confidence {result.confidence_score} out of credible band on seed {seed}"
        )


# ── Coupled signals ──────────────────────────────────────────────────


def test_mock_provider_oily_skin_implies_high_oiliness():
    """oily skin_type → oiliness=HIGH; sample many seeds to hit at least one."""
    provider = MockHautAIProvider()
    oily_seen = False
    for seed in range(1, 60):
        result = provider.analyze(_synthetic_image(seed=seed))
        if result.skin_type == SkinType.OILY:
            assert result.oiliness == Level.HIGH
            oily_seen = True
    assert oily_seen, "expected at least one OILY skin_type across 59 seeds"


def test_mock_provider_dry_skin_implies_low_oiliness():
    provider = MockHautAIProvider()
    dry_seen = False
    for seed in range(1, 80):
        result = provider.analyze(_synthetic_image(seed=seed))
        if result.skin_type == SkinType.DRY:
            assert result.oiliness == Level.LOW
            dry_seen = True
    assert dry_seen, "expected at least one DRY skin_type across 79 seeds"


# ── recommendation_signals + raw_summary ────────────────────────────


def test_mock_provider_signals_have_expected_vocabulary():
    """Pin the recommendation_signals key set — changes should be intentional."""
    provider = MockHautAIProvider()
    result = provider.analyze(_synthetic_image(seed=7))

    expected_keys = {
        "acne_severity_raw",
        "uv_damage_score",
        "skin_age_estimate",
        "dark_circles_score",
        "skin_health_score",
    }
    assert set(result.recommendation_signals.keys()) == expected_keys
    for value in result.recommendation_signals.values():
        assert isinstance(value, (int, float))


def test_mock_provider_raw_summary_is_compact():
    """raw_summary stays tiny — no full vendor JSON in features_json."""
    provider = MockHautAIProvider()
    result = provider.analyze(_synthetic_image(seed=3))

    assert result.raw_summary is not None
    assert set(result.raw_summary.keys()) == {
        "mock_seed",
        "provider_version",
        "images_received",
    }
    assert result.raw_summary["provider_version"] == "mock-haut-1.0"
    assert result.raw_summary["images_received"] == 1


def test_mock_provider_counts_side_images():
    """images_received tracks count; metrics keyed off front-bytes only."""
    provider = MockHautAIProvider()
    image = _synthetic_image(seed=9)

    only_front = provider.analyze(image)
    with_one_side = provider.analyze(image, left=image)
    with_two_sides = provider.analyze(image, left=image, right=image)

    assert only_front.raw_summary["images_received"] == 1
    assert with_one_side.raw_summary["images_received"] == 2
    assert with_two_sides.raw_summary["images_received"] == 3

    keys = {"skin_type", "redness_level", "pores_score", "confidence_score"}
    a = only_front.model_dump(include=keys)
    b = with_two_sides.model_dump(include=keys)
    assert a == b


# ── Factory routing ─────────────────────────────────────────────────


def test_factory_routes_mock_haut(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "mock_haut")
    provider = get_skin_analysis_provider()
    assert isinstance(provider, MockHautAIProvider)
    assert provider.name == "mock_haut"
    factory_fn.cache_clear()


def test_factory_local_still_default(monkeypatch):
    """Regression — adding mock_haut didn't break the default local path."""
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "local")
    provider = get_skin_analysis_provider()
    assert isinstance(provider, LocalHeuristicProvider)
    factory_fn.cache_clear()


def test_factory_error_message_lists_known_providers(monkeypatch):
    """Error lists every supported name for actionable misconfigs."""
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "haut_ai_typo")
    with pytest.raises(ValueError, match="local, mock_haut"):
        get_skin_analysis_provider()
    factory_fn.cache_clear()
