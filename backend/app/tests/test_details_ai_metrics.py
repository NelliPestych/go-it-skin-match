"""Tests for the extended AI metrics surfaced by /analysis/{id}/details.

Covers three scenarios:

1. **Legacy scan** — a row written *before* the provider abstraction
   landed (only the 6 `SkinFeatures` keys in `features_json`).  The
   endpoint must still respond, and `ai_metrics.provider` must equal
   the `"legacy"` sentinel with the extended fields all `None`.
2. **Fresh local scan** — running the normal upload flow with the
   default `local` provider.  `ai_metrics` carries `provider="local"`,
   confidence, and the extended levels populated by
   `LocalHeuristicProvider`.
3. **Fresh mock_haut scan** — same but with `SKIN_ANALYSIS_PROVIDER=
   mock_haut`.  Confirms the realistic Haut-AI-shaped signals are
   exposed through the details endpoint without crashing the schema.

Backward-compat guard: every test also asserts the legacy `features`
block on the response is unchanged in shape, so the existing frontend
keeps working.
"""
from __future__ import annotations

import io
from typing import Tuple

import numpy as np
import pytest
from PIL import Image

from app.ai.providers.factory import get_skin_analysis_provider as factory_fn
from app.models.skin_scan import SkinScan
from app.schemas.skin_analysis import AIMetrics


def _synthetic_image(color=(180, 150, 140), size=256, seed: int = 0) -> bytes:
    rng = np.random.default_rng(seed)
    arr = np.full((size, size, 3), color, dtype=np.uint8)
    noise = rng.integers(-15, 15, arr.shape, dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


_LEGACY_FEATURES_KEYS = {
    "skin_type",
    "redness_level",
    "hydration_level",
    "pigmentation_level",
    "pores_score",
    "confidence_score",
}


# ── AIMetrics.from_features_json (unit) ─────────────────────────────


def test_ai_metrics_from_legacy_features_json_marks_provider_legacy():
    """Old `features_json` (only legacy keys) must be tolerated and
    surface as `provider='legacy'` with extended fields null."""
    legacy = {
        "skin_type": "combination",
        "redness_level": "medium",
        "hydration_level": "low",
        "pigmentation_level": "low",
        "pores_score": 0.42,
        "confidence_score": 0.81,
    }
    metrics = AIMetrics.from_features_json(legacy)

    assert metrics.provider == "legacy"
    assert metrics.confidence_score == pytest.approx(0.81)
    assert metrics.oiliness is None
    assert metrics.acne is None
    assert metrics.fine_lines is None
    assert metrics.texture is None
    assert metrics.recommendation_signals is None
    assert metrics.analyzed_at is None


def test_ai_metrics_from_full_normalized_json_round_trips():
    """The richer shape produced by `mock_haut` (or future Haut.AI)
    must populate every extended field without dropping data."""
    payload = {
        "skin_type": "oily",
        "redness_level": "medium",
        "hydration_level": "low",
        "pigmentation_level": "medium",
        "pores_score": 0.62,
        "confidence_score": 0.89,
        "oiliness": "high",
        "acne": "medium",
        "fine_lines": "low",
        "texture": "medium",
        "recommendation_signals": {"acne_severity_raw": 0.41, "uv_damage_score": 0.22},
        "provider": "mock_haut",
        "analyzed_at": "2026-05-13T10:15:00+00:00",
    }
    metrics = AIMetrics.from_features_json(payload)

    assert metrics.provider == "mock_haut"
    assert metrics.confidence_score == pytest.approx(0.89)
    assert metrics.oiliness.value == "high"
    assert metrics.acne.value == "medium"
    assert metrics.fine_lines.value == "low"
    assert metrics.texture.value == "medium"
    assert metrics.recommendation_signals == {
        "acne_severity_raw": 0.41,
        "uv_damage_score": 0.22,
    }
    assert metrics.analyzed_at is not None


def test_ai_metrics_from_none_returns_legacy_sentinel():
    metrics = AIMetrics.from_features_json(None)
    assert metrics.provider == "legacy"
    assert metrics.confidence_score == pytest.approx(0.0)


# ── /details endpoint round-trip ────────────────────────────────────


def _seed_legacy_scan(client, db_session) -> int:
    """Upload normally, then rewrite the resulting `features_json` to
    the pre-provider 6-key shape — simulates a scan persisted *before*
    Phase 1 landed.  Returns the scan id."""
    upload = client.post(
        "/analysis/upload",
        files={"file": ("face.jpg", _synthetic_image(seed=1), "image/jpeg")},
    )
    assert upload.status_code == 200, upload.text
    analysis_id = upload.json()["analysis_id"]

    scan = db_session.query(SkinScan).get(analysis_id)
    scan.features_json = {
        "skin_type": "normal",
        "redness_level": "low",
        "hydration_level": "medium",
        "pigmentation_level": "low",
        "pores_score": 0.31,
        "confidence_score": 0.77,
    }
    db_session.add(scan)
    db_session.commit()
    return analysis_id


def test_details_handles_legacy_features_json(client, db_session):
    """A scan persisted under the pre-provider schema must still
    round-trip through `/details` without 500-ing, and `ai_metrics`
    must report it as `legacy`."""
    analysis_id = _seed_legacy_scan(client, db_session)

    response = client.get(f"/analysis/{analysis_id}/details")
    assert response.status_code == 200, response.text
    body = response.json()

    # Legacy block still works for the frontend.
    assert set(body["features"].keys()) == _LEGACY_FEATURES_KEYS
    assert body["features"]["skin_type"] == "normal"
    assert body["features"]["confidence_score"] == pytest.approx(0.77)

    # New sidecar surfaces the legacy sentinel.
    assert body["ai_metrics"] is not None
    assert body["ai_metrics"]["provider"] == "legacy"
    assert body["ai_metrics"]["confidence_score"] == pytest.approx(0.77)
    assert body["ai_metrics"]["oiliness"] is None
    assert body["ai_metrics"]["acne"] is None
    assert body["ai_metrics"]["fine_lines"] is None
    assert body["ai_metrics"]["texture"] is None
    assert body["ai_metrics"]["recommendation_signals"] is None


def test_details_exposes_local_provider_metrics(client):
    """Fresh scan under default `local` provider: `ai_metrics` carries
    provider='local', confidence > 0, oiliness/texture derived from
    the heuristic."""
    factory_fn.cache_clear()
    upload = client.post(
        "/analysis/upload",
        files={"file": ("face.jpg", _synthetic_image(seed=2), "image/jpeg")},
    )
    analysis_id = upload.json()["analysis_id"]

    body = client.get(f"/analysis/{analysis_id}/details").json()

    # Legacy block unchanged.
    assert set(body["features"].keys()) == _LEGACY_FEATURES_KEYS

    # Extended block populated.
    assert body["ai_metrics"]["provider"] == "local"
    assert 0.0 < body["ai_metrics"]["confidence_score"] <= 1.0
    assert body["ai_metrics"]["oiliness"] in {"low", "medium", "high"}
    assert body["ai_metrics"]["texture"] in {"low", "medium", "high"}
    # LocalHeuristic intentionally defaults these to LOW (see provider).
    assert body["ai_metrics"]["acne"] == "low"
    assert body["ai_metrics"]["fine_lines"] == "low"
    assert body["ai_metrics"]["analyzed_at"] is not None


def test_details_exposes_mock_haut_provider_metrics(client, monkeypatch):
    """Switching the provider via env routes the mock_haut output
    cleanly through the details endpoint, including the
    `recommendation_signals` dict."""
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "mock_haut")

    upload = client.post(
        "/analysis/upload",
        files={"file": ("face.jpg", _synthetic_image(seed=3), "image/jpeg")},
    )
    analysis_id = upload.json()["analysis_id"]

    body = client.get(f"/analysis/{analysis_id}/details").json()

    # Legacy block unchanged.
    assert set(body["features"].keys()) == _LEGACY_FEATURES_KEYS

    # Extended block reflects mock_haut.
    assert body["ai_metrics"]["provider"] == "mock_haut"
    assert 0.70 <= body["ai_metrics"]["confidence_score"] <= 0.99
    for key in ("oiliness", "acne", "fine_lines", "texture"):
        assert body["ai_metrics"][key] in {"low", "medium", "high"}

    signals = body["ai_metrics"]["recommendation_signals"]
    assert isinstance(signals, dict)
    assert set(signals.keys()) == {
        "acne_severity_raw",
        "uv_damage_score",
        "skin_age_estimate",
        "dark_circles_score",
        "skin_health_score",
    }

    factory_fn.cache_clear()
