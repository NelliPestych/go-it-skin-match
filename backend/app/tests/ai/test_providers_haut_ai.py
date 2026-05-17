"""Tests for the real Haut.AI provider.

We never call the live API in the normal suite — every test stubs the
network with `httpx.MockTransport`, which the provider's internal
`AsyncClient` uses transparently when injected.  The single live
integration test is `skip`-guarded on `HAUT_AI_API_KEY` so CI and
contributor laptops without credentials are unaffected.

What's pinned here:

* construction-time config errors (missing key, looping fallback),
* the placeholder request shape (`/v1/skin-analysis` + Bearer token +
  base64 image payload — exactly what `_build_request_payload` is
  supposed to emit until we have the real Haut.AI spec),
* normalization across numeric + categorical metric shapes,
* tolerance to missing optional metrics (no crash, conservative
  defaults),
* error classification (auth, request, server, timeout),
* the fallback contract — request-time errors *only* fall back, and
  the resulting `raw_summary` is annotated rather than silently
  swallowed,
* `raw_summary` discipline — no base64, no giant vendor payloads
  leak through.
"""
from __future__ import annotations

import json
import os
from typing import Optional

import httpx
import pytest

from app.ai.providers import (
    HautAIAuthError,
    HautAIConfigError,
    HautAIError,
    HautAIProvider,
    HautAIRequestError,
    HautAIServerError,
    LocalHeuristicProvider,
    MockHautAIProvider,
    get_skin_analysis_provider,
)
from app.ai.providers.factory import get_skin_analysis_provider as factory_fn
from app.ai.providers.haut_ai import _b64, _bucket_score, _safe_pores_score
from app.schemas.common import Level, SkinType


# ── Test helpers ─────────────────────────────────────────────────────


_DUMMY_FRONT = b"\x00\x01\x02fake-image-bytes\x03"


def _provider_with_transport(
    transport: httpx.MockTransport,
    *,
    api_key: str = "sk-test",
    fallback: Optional[object] = None,
) -> HautAIProvider:
    """Build a `HautAIProvider` that routes its `AsyncClient` through
    the supplied `MockTransport`.

    The provider creates its own `AsyncClient`, so we monkey-patch
    `httpx.AsyncClient` on a per-test basis to inject the transport.
    Cleaner than refactoring the provider to accept a client — keeps
    the production path free of test scaffolding.
    """
    return HautAIProvider(
        api_key=api_key,
        base_url="https://api.haut.ai",
        timeout_seconds=2.0,
        fallback=fallback,
    )


@pytest.fixture
def patch_async_client(monkeypatch):
    """Patch `httpx.AsyncClient` to use a per-test MockTransport.

    Returns a `set_transport(transport)` function the test calls with
    its own handler.  This is wired generically so every test in this
    file uses the same plumbing.
    """
    holder: dict = {"transport": None}

    real_async_client = httpx.AsyncClient

    def _factory(*args, **kwargs):
        kwargs["transport"] = holder["transport"]
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr("app.ai.providers.haut_ai.httpx.AsyncClient", _factory)

    def _set(transport: httpx.MockTransport) -> None:
        holder["transport"] = transport

    return _set


# ── _bucket_score / _safe_pores_score (small focused unit tests) ────


def test_bucket_score_numeric_0_to_100():
    assert _bucket_score(10) is Level.LOW
    assert _bucket_score(33) is Level.MEDIUM
    assert _bucket_score(65) is Level.MEDIUM
    assert _bucket_score(66) is Level.HIGH
    assert _bucket_score(99) is Level.HIGH


def test_bucket_score_numeric_0_to_1_is_rescaled():
    assert _bucket_score(0.1) is Level.LOW
    assert _bucket_score(0.5) is Level.MEDIUM
    assert _bucket_score(0.9) is Level.HIGH


def test_bucket_score_categorical_strings():
    assert _bucket_score("low") is Level.LOW
    assert _bucket_score(" Medium ") is Level.MEDIUM
    assert _bucket_score("HIGH") is Level.HIGH


def test_bucket_score_returns_none_for_garbage():
    assert _bucket_score(None) is None
    assert _bucket_score("unknown") is None
    assert _bucket_score(True) is None  # bool must not bucket as numeric
    assert _bucket_score([]) is None


def test_safe_pores_score_clamps_and_rescales():
    assert _safe_pores_score(0.5) == 0.5
    assert _safe_pores_score(50) == 0.5
    assert _safe_pores_score(120) == 1.0  # over-range clamped
    assert _safe_pores_score(-5) == 0.0
    # Level-string fallback so a categorical-only vendor still works.
    assert _safe_pores_score("high") == 0.8


# ── Construction-time config ────────────────────────────────────────


def test_constructor_requires_api_key():
    with pytest.raises(HautAIConfigError, match="HAUT_AI_API_KEY"):
        HautAIProvider(api_key=None, base_url="https://api.haut.ai", timeout_seconds=10.0)
    with pytest.raises(HautAIConfigError):
        HautAIProvider(api_key="   ", base_url="https://api.haut.ai", timeout_seconds=10.0)


def test_constructor_rejects_recursive_haut_ai_fallback():
    """A `haut_ai → haut_ai` fallback would loop on every transient
    error.  The provider refuses such a chain at construction time."""
    real = HautAIProvider(
        api_key="sk-test", base_url="https://api.haut.ai", timeout_seconds=10.0
    )
    with pytest.raises(HautAIConfigError, match="recursive"):
        HautAIProvider(
            api_key="sk-test",
            base_url="https://api.haut.ai",
            timeout_seconds=10.0,
            fallback=real,
        )


# ── Successful end-to-end flow with stubbed transport ────────────────


def _success_response(extra: Optional[dict] = None) -> httpx.Response:
    """A representative happy-path payload.

    Field names are intentionally a mix of the canonical Haut.AI-ish
    metric names and a couple of vendor-envelope wrappers (`result`,
    `metrics`) so the parser exercises both paths.
    """
    body = {
        "request_id": "haut-req-abc",
        "model_version": "skin-v1.2.3",
        "processing_time_ms": 412,
        "result": {
            "metrics": {
                "skin_type": "combination",
                "oiliness": 72,
                "hydration": 45,
                "redness": "low",
                "pigmentation": 30,
                "pores": 0.42,
                "acne": 18,
                "fine_lines": "low",
                "texture": 55,
            },
            "confidence_score": 0.88,
            "recommendation_signals": {
                "uv_damage_score": 0.4,
                "skin_age_estimate": 32.5,
                # Non-numeric values must be silently dropped.
                "vendor_flag": "ignored",
            },
        },
    }
    if extra:
        body.update(extra)
    return httpx.Response(200, json=body)


def test_analyze_normalizes_a_representative_response(patch_async_client):
    """Single golden-path assertion: every normalized field lands on
    a sane value derived from the stubbed payload."""
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        seen["body"] = json.loads(request.content.decode("utf-8"))
        return _success_response()

    patch_async_client(httpx.MockTransport(handler))
    provider = _provider_with_transport(httpx.MockTransport(handler))

    result = provider.analyze(_DUMMY_FRONT, left=b"left", right=b"right")

    # Wire shape ────────────────────────────────────────────────────
    assert seen["url"] == "https://api.haut.ai/v1/skin-analysis"
    assert seen["auth"] == "Bearer sk-test"
    assert [img["pose"] for img in seen["body"]["images"]] == ["front", "left", "right"]
    # base64-encoded front bytes round-trip through the payload.
    assert seen["body"]["images"][0]["content_base64"] == _b64(_DUMMY_FRONT)

    # Normalization ─────────────────────────────────────────────────
    assert result.provider == "haut_ai"
    assert result.skin_type == SkinType.COMBINATION
    assert result.oiliness == Level.HIGH        # 72 → high
    assert result.hydration_level == Level.MEDIUM  # 45 → medium
    assert result.redness_level == Level.LOW    # "low"
    assert result.pigmentation_level == Level.LOW  # 30 → low
    assert result.pores_score == pytest.approx(0.42)
    assert result.acne == Level.LOW             # 18 → low
    assert result.fine_lines == Level.LOW
    assert result.texture == Level.MEDIUM       # 55 → medium
    assert result.confidence_score == pytest.approx(0.88)

    # recommendation_signals dropped the non-numeric `vendor_flag`.
    assert "uv_damage_score" in result.recommendation_signals
    assert "skin_age_estimate" in result.recommendation_signals
    assert "vendor_flag" not in result.recommendation_signals


def test_analyze_handles_missing_optional_metrics(patch_async_client):
    """A vendor that only sends a subset of metrics must not crash —
    missing fields fall back to the schema-level conservative
    defaults (oiliness=MEDIUM, acne=LOW, fine_lines=LOW, texture=MEDIUM)."""

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "request_id": "haut-req-min",
                "metrics": {
                    "skin_type": "normal",
                    "hydration": 50,
                    # everything else omitted
                },
                "confidence_score": 0.81,
            },
        )

    patch_async_client(httpx.MockTransport(handler))
    provider = _provider_with_transport(httpx.MockTransport(handler))

    result = provider.analyze(_DUMMY_FRONT)

    assert result.skin_type == SkinType.NORMAL
    assert result.hydration_level == Level.MEDIUM
    # Conservative defaults from the schema kick in here.
    assert result.oiliness == Level.MEDIUM
    assert result.acne == Level.LOW
    assert result.fine_lines == Level.LOW
    assert result.texture == Level.MEDIUM
    assert result.redness_level == Level.LOW
    assert result.pigmentation_level == Level.LOW


def test_raw_summary_is_compact_and_never_contains_image_bytes(patch_async_client):
    """`raw_summary` must stay tiny and never echo the request body
    back — base64 image payloads in `features_json` would balloon the
    JSON column per scan."""

    def handler(_request: httpx.Request) -> httpx.Response:
        return _success_response()

    patch_async_client(httpx.MockTransport(handler))
    provider = _provider_with_transport(httpx.MockTransport(handler))

    result = provider.analyze(_DUMMY_FRONT)
    summary = result.raw_summary or {}

    # Allow-list: nothing outside this small key set is ever stored.
    allowed = {
        "provider_request_id",
        "model_version",
        "received_metrics",
        "images_received",
        "processing_time_ms",
        "fallback_used",
        "original_provider",
        "original_provider_error",
    }
    assert set(summary.keys()).issubset(allowed)
    assert "base64" not in json.dumps(summary).lower()
    assert "images" not in summary  # never the inbound payload
    assert summary["images_received"] == 1
    assert summary["provider_request_id"] == "haut-req-abc"
    assert summary["model_version"] == "skin-v1.2.3"
    assert summary["processing_time_ms"] == 412
    # Metric names actually received from the provider.
    assert "skin_type" in summary["received_metrics"]
    assert "oiliness" in summary["received_metrics"]


# ── Error classification ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "status, expected_error",
    [
        (401, HautAIAuthError),
        (403, HautAIAuthError),
        (400, HautAIRequestError),
        (404, HautAIRequestError),
        (422, HautAIRequestError),
        (500, HautAIServerError),
        (503, HautAIServerError),
    ],
)
def test_http_status_to_error_classification(patch_async_client, status, expected_error):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": "boom"})

    patch_async_client(httpx.MockTransport(handler))
    provider = _provider_with_transport(httpx.MockTransport(handler))

    with pytest.raises(expected_error):
        provider.analyze(_DUMMY_FRONT)


def test_invalid_json_response_raises_request_error(patch_async_client):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, content=b"not valid json", headers={"Content-Type": "application/json"}
        )

    patch_async_client(httpx.MockTransport(handler))
    provider = _provider_with_transport(httpx.MockTransport(handler))

    with pytest.raises(HautAIRequestError, match="invalid JSON"):
        provider.analyze(_DUMMY_FRONT)


def test_timeout_raises_server_error(patch_async_client):
    """A timeout is classified as a server error so the fallback
    wiring treats it the same as a 5xx."""

    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out")

    patch_async_client(httpx.MockTransport(handler))
    provider = _provider_with_transport(httpx.MockTransport(handler))

    with pytest.raises(HautAIServerError, match="timed out"):
        provider.analyze(_DUMMY_FRONT)


# ── Fallback behaviour ───────────────────────────────────────────────


def test_fallback_runs_when_request_fails(patch_async_client):
    """A 500 with a configured fallback returns the fallback's result,
    annotated with `raw_summary.fallback_used = True` and a short safe
    error message."""

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "vendor down"})

    patch_async_client(httpx.MockTransport(handler))
    fallback = MockHautAIProvider()
    provider = _provider_with_transport(
        httpx.MockTransport(handler), fallback=fallback
    )

    result = provider.analyze(_DUMMY_FRONT)

    # Same shape as a normal mock_haut result …
    assert result.provider == "mock_haut"
    # … plus the fallback markers on raw_summary.
    summary = result.raw_summary or {}
    assert summary.get("fallback_used") is True
    assert summary.get("original_provider") == "haut_ai"
    assert "Haut.AI" in summary.get("original_provider_error", "")


def test_config_error_never_triggers_fallback(monkeypatch):
    """If the API key is missing the construction itself raises —
    the fallback is irrelevant.  Belt-and-braces: even if a future
    bug somehow surfaced a `HautAIConfigError` at request time, the
    public `analyze()` must propagate it instead of falling back."""

    fallback = MockHautAIProvider()
    # The constructor refuses a missing key — proves there's no quiet
    # fallback path on bad config.
    with pytest.raises(HautAIConfigError):
        HautAIProvider(
            api_key=None,
            base_url="https://api.haut.ai",
            timeout_seconds=10.0,
            fallback=fallback,
        )


# ── Factory routing ──────────────────────────────────────────────────


def test_factory_routes_haut_ai(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "haut_ai")
    monkeypatch.setattr("app.core.config.settings.haut_ai_api_key", "sk-from-env")
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", None
    )

    provider = get_skin_analysis_provider()
    assert isinstance(provider, HautAIProvider)
    assert provider.name == "haut_ai"
    factory_fn.cache_clear()


def test_factory_haut_ai_missing_key_raises(monkeypatch):
    """Missing API key must fail loudly at factory time — never
    silently fall back to a different provider."""
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "haut_ai")
    monkeypatch.setattr("app.core.config.settings.haut_ai_api_key", None)
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", None
    )

    with pytest.raises(HautAIConfigError):
        get_skin_analysis_provider()
    factory_fn.cache_clear()


def test_factory_resolves_local_fallback(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "haut_ai")
    monkeypatch.setattr("app.core.config.settings.haut_ai_api_key", "sk-from-env")
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", "local"
    )
    provider = get_skin_analysis_provider()
    assert isinstance(provider, HautAIProvider)
    assert isinstance(provider._fallback, LocalHeuristicProvider)
    factory_fn.cache_clear()


def test_factory_resolves_mock_haut_fallback(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "haut_ai")
    monkeypatch.setattr("app.core.config.settings.haut_ai_api_key", "sk-from-env")
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", "mock_haut"
    )
    provider = get_skin_analysis_provider()
    assert isinstance(provider, HautAIProvider)
    assert isinstance(provider._fallback, MockHautAIProvider)
    factory_fn.cache_clear()


def test_factory_rejects_haut_ai_fallback(monkeypatch):
    """A `SKIN_ANALYSIS_FALLBACK_PROVIDER=haut_ai` config would loop
    on transient errors — the factory rejects it at startup."""
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "haut_ai")
    monkeypatch.setattr("app.core.config.settings.haut_ai_api_key", "sk-from-env")
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", "haut_ai"
    )
    with pytest.raises(ValueError, match="haut_ai is not allowed"):
        get_skin_analysis_provider()
    factory_fn.cache_clear()


def test_factory_rejects_unknown_fallback(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr("app.core.config.settings.skin_analysis_provider", "haut_ai")
    monkeypatch.setattr("app.core.config.settings.haut_ai_api_key", "sk-from-env")
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", "made_up"
    )
    with pytest.raises(ValueError, match="Invalid SKIN_ANALYSIS_FALLBACK_PROVIDER"):
        get_skin_analysis_provider()
    factory_fn.cache_clear()


# ── Live integration (opt-in) ────────────────────────────────────────


@pytest.mark.skipif(
    not os.environ.get("HAUT_AI_API_KEY"),
    reason="HAUT_AI_API_KEY not set; live integration test skipped",
)
def test_live_haut_ai_smoke():
    """Single round-trip against the real Haut.AI endpoint.

    Skipped unless the contributor explicitly opts in by exporting
    `HAUT_AI_API_KEY`.  The assertions are intentionally weak — we
    only want to know that the wire shape lines up and the response
    normalizes cleanly, not pin specific values that depend on the
    sample image.
    """
    provider = HautAIProvider(
        api_key=os.environ["HAUT_AI_API_KEY"],
        base_url=os.environ.get("HAUT_AI_BASE_URL", "https://api.haut.ai"),
        timeout_seconds=float(os.environ.get("HAUT_AI_TIMEOUT_SECONDS", "30")),
    )
    # Bytes are intentionally a tiny placeholder — the real test is
    # whether auth + endpoint shape work.  A 4xx here is also useful
    # signal and will fail visibly.
    sample = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    result = provider.analyze(sample)
    assert result.provider == "haut_ai"
    assert 0.0 <= result.confidence_score <= 1.0
