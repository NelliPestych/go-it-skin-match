"""Tests for the `LocalHeuristicProvider` and the provider factory.

The provider is the new outermost extension point — these tests
guard that:

* it produces the normalized superset of `SkinFeatures` without
  changing the legacy values (no regression for downstream readers),
* the new metric fields (`oiliness`, `acne`, `fine_lines`, `texture`)
  have sensible defaults / derivations,
* `to_skin_features()` projects back to the legacy shape exactly,
* the factory routes `SKIN_ANALYSIS_PROVIDER=local` to the local
  provider and raises on unknown names.
"""
from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from app.ai.providers import LocalHeuristicProvider, get_skin_analysis_provider
from app.ai.providers.factory import get_skin_analysis_provider as factory_fn
from app.schemas.analysis import SkinFeatures
from app.schemas.common import Level, SkinType
from app.schemas.skin_analysis import NormalizedSkinAnalysisResult


def _synthetic_image(color=(180, 150, 140), size=256) -> bytes:
    """Noisy synthetic JPEG; keeps the heuristic in MEDIUM-ish territory."""
    arr = np.full((size, size, 3), color, dtype=np.uint8)
    noise = np.random.randint(-15, 15, arr.shape, dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ── LocalHeuristicProvider ──────────────────────────────────────────


def test_local_provider_returns_normalized_result():
    provider = LocalHeuristicProvider()
    result = provider.analyze(_synthetic_image())

    assert isinstance(result, NormalizedSkinAnalysisResult)
    assert result.provider == "local"
    assert result.skin_type in SkinType
    assert result.redness_level in Level
    assert result.hydration_level in Level
    assert result.pigmentation_level in Level
    assert 0.0 <= result.pores_score <= 1.0
    assert 0.0 <= result.confidence_score <= 1.0


def test_local_provider_populates_new_metrics():
    """Every normalized field emitted (even the ones the heuristic doesn't measure)."""
    provider = LocalHeuristicProvider()
    result = provider.analyze(_synthetic_image())

    assert result.oiliness in Level
    assert result.acne == Level.LOW
    assert result.fine_lines == Level.LOW
    assert result.texture in Level


def test_local_provider_oiliness_mirrors_skin_type():
    """Sanity-check the skin_type → oiliness derivation rule."""
    provider = LocalHeuristicProvider()
    result = provider.analyze(_synthetic_image())

    if result.skin_type == SkinType.OILY:
        assert result.oiliness == Level.HIGH
    elif result.skin_type == SkinType.DRY:
        assert result.oiliness == Level.LOW
    else:
        assert result.oiliness == Level.MEDIUM


def test_local_provider_ignores_side_poses():
    """Side images accepted but dropped — result identical with or without."""
    provider = LocalHeuristicProvider()
    front = _synthetic_image()
    left = _synthetic_image(color=(100, 90, 80))
    right = _synthetic_image(color=(200, 180, 170))

    only_front = provider.analyze(front)
    with_sides = provider.analyze(front, left=left, right=right)

    assert only_front.skin_type == with_sides.skin_type
    assert only_front.redness_level == with_sides.redness_level
    assert only_front.pores_score == with_sides.pores_score


def test_to_skin_features_preserves_legacy_shape():
    """Projection to SkinFeatures round-trips every legacy field bit-identical."""
    provider = LocalHeuristicProvider()
    result = provider.analyze(_synthetic_image())
    features = result.to_skin_features()

    assert isinstance(features, SkinFeatures)
    assert features.skin_type == result.skin_type
    assert features.redness_level == result.redness_level
    assert features.hydration_level == result.hydration_level
    assert features.pigmentation_level == result.pigmentation_level
    assert features.pores_score == result.pores_score
    assert features.confidence_score == result.confidence_score


def test_features_json_dump_contains_legacy_keys():
    """Top-level legacy keys preserved so rec / plan code keeps working unchanged."""
    provider = LocalHeuristicProvider()
    result = provider.analyze(_synthetic_image())
    dumped = result.model_dump(mode="json")

    for key in (
        "skin_type",
        "redness_level",
        "hydration_level",
        "pigmentation_level",
        "pores_score",
        "confidence_score",
    ):
        assert key in dumped, f"legacy key {key!r} missing from features_json dump"

    for key in ("oiliness", "acne", "fine_lines", "texture", "provider", "analyzed_at"):
        assert key in dumped


# ── Factory ─────────────────────────────────────────────────────────


def test_factory_returns_local_provider_by_default():
    # Clear lru_cache from prior tests.
    factory_fn.cache_clear()
    provider = get_skin_analysis_provider()
    assert isinstance(provider, LocalHeuristicProvider)
    assert provider.name == "local"


def test_factory_raises_on_unknown_provider(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "nope")
    with pytest.raises(ValueError, match="Unknown skin analysis provider"):
        get_skin_analysis_provider()
    factory_fn.cache_clear()
