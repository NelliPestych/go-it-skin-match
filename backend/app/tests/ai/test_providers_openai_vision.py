"""Tests for the OpenAI Vision provider.

The live OpenAI API is never called in the normal suite — every test
injects a fake `client` into the provider so the SDK round-trip is
mocked end-to-end.  The single live integration test is `skip`-guarded
on `OPENAI_API_KEY` so CI / contributor laptops without credentials
are unaffected.

What's pinned here:

* construction-time config errors (missing key, looping fallback),
* the request shape (sync `chat.completions.create` call with the
  system prompt, JSON response format, image_url part carrying the
  base64-encoded front bytes),
* the prompt's safety wording — no medical / disease language,
* normalization across categorical + numeric metric shapes,
* tolerance to missing optional metrics (no crash, conservative
  defaults),
* error classification (auth, request, server, timeout, rate limit),
* the fallback contract — request-time errors fall back; config
  errors propagate; the result is annotated with audit markers,
* `raw_summary` discipline — no base64, no image bytes, no full
  vendor response leak,
* factory routing.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import pytest

from app.ai.providers import (
    HautAIProvider,
    LocalHeuristicProvider,
    MockHautAIProvider,
    OpenAIVisionAuthError,
    OpenAIVisionConfigError,
    OpenAIVisionError,
    OpenAIVisionProvider,
    OpenAIVisionRequestError,
    OpenAIVisionServerError,
    get_skin_analysis_provider,
)
from app.ai.providers.factory import get_skin_analysis_provider as factory_fn
from app.ai.providers.openai_vision import (
    _SYSTEM_PROMPT,
    _b64,
    _bucket_score,
    _level_to_pores_score,
    _safe_confidence,
    _safe_summary,
)
from app.schemas.common import Level, SkinType


# ── Test helpers ─────────────────────────────────────────────────────


_DUMMY_FRONT = b"\x00\x01\x02fake-front-image\x03"


class _FakeUsage:
    def __init__(self, prompt: int, completion: int) -> None:
        self.prompt_tokens = prompt
        self.completion_tokens = completion


class _FakeMessage:
    def __init__(self, content: Any) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, message: _FakeMessage) -> None:
        self.message = message


class _FakeCompletion:
    def __init__(
        self,
        content: Any,
        *,
        completion_id: str = "chatcmpl-test-1",
        model: str = "gpt-4o-mini",
        usage: Optional[_FakeUsage] = None,
    ) -> None:
        self.id = completion_id
        self.model = model
        self.usage = usage or _FakeUsage(prompt=180, completion=80)
        self.choices = [_FakeChoice(_FakeMessage(content))]


class _FakeChatCompletions:
    """Captures the kwargs of `client.chat.completions.create(...)`."""

    def __init__(self, returns: Any = None, raises: Optional[Exception] = None) -> None:
        self._returns = returns
        self._raises = raises
        self.calls: list[Dict[str, Any]] = []

    def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self._raises is not None:
            raise self._raises
        return self._returns


class _FakeChat:
    def __init__(self, completions: _FakeChatCompletions) -> None:
        self.completions = completions


class _FakeClient:
    """Minimal `OpenAI(...)` stand-in compatible with the provider."""

    def __init__(self, completions: _FakeChatCompletions) -> None:
        self.chat = _FakeChat(completions)


def _provider(
    *,
    api_key: str = "sk-test",
    completions: Optional[_FakeChatCompletions] = None,
    fallback: Optional[Any] = None,
    model: str = "gpt-4o-mini",
    timeout: float = 5.0,
) -> tuple[OpenAIVisionProvider, _FakeChatCompletions]:
    """Build a provider with an injected fake client.

    Returns the provider plus the underlying `_FakeChatCompletions`
    instance so the test can read back its `.calls` log.
    """
    completions = completions or _FakeChatCompletions(returns=_success_completion())
    client = _FakeClient(completions)
    p = OpenAIVisionProvider(
        api_key=api_key,
        model=model,
        timeout_seconds=timeout,
        fallback=fallback,
        client=client,
    )
    return p, completions


# A representative happy-path JSON body the model is supposed to return.
def _success_payload(**overrides: Any) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "skin_type": "combination",
        "hydration": "low",
        "oiliness": "medium",
        "redness": "low",
        "pores_visibility": "medium",
        "texture": "medium",
        "acne": "low",
        "fine_lines": "low",
        "confidence_score": 0.82,
        "summary": "Visible dehydration and mild texture irregularities.",
    }
    body.update(overrides)
    return body


def _success_completion(**overrides: Any) -> _FakeCompletion:
    return _FakeCompletion(content=json.dumps(_success_payload(**overrides)))


# ── Pure helper unit tests ───────────────────────────────────────────


def test_bucket_score_categorical():
    assert _bucket_score("low") is Level.LOW
    assert _bucket_score(" Medium ") is Level.MEDIUM
    assert _bucket_score("HIGH") is Level.HIGH


def test_bucket_score_numeric_ranges():
    # 0..100 path
    assert _bucket_score(10) is Level.LOW
    assert _bucket_score(50) is Level.MEDIUM
    assert _bucket_score(80) is Level.HIGH
    # 0..1 path (rescaled internally)
    assert _bucket_score(0.1) is Level.LOW
    assert _bucket_score(0.5) is Level.MEDIUM
    assert _bucket_score(0.9) is Level.HIGH


def test_bucket_score_returns_none_for_garbage():
    assert _bucket_score(None) is None
    assert _bucket_score("unknown") is None
    assert _bucket_score(True) is None  # bool must not bucket as numeric
    assert _bucket_score([]) is None


def test_level_to_pores_score_uses_known_buckets():
    assert _level_to_pores_score(Level.LOW) == 0.2
    assert _level_to_pores_score(Level.MEDIUM) == 0.5
    assert _level_to_pores_score(Level.HIGH) == 0.8
    assert _level_to_pores_score(None) == 0.5


def test_safe_confidence_clamps_and_rescales():
    assert _safe_confidence(0.5) == 0.5
    assert _safe_confidence(50) == 0.5  # 0..100 → 0..1
    # 0..100 path with over-range clamping: 150 / 100 → 1.5 → clamp 1.0
    assert _safe_confidence(150) == 1.0
    assert _safe_confidence(-1) == 0.0
    assert _safe_confidence(True) is None  # refuse bool
    assert _safe_confidence("nope") is None


def test_safe_summary_trims_and_caps():
    assert _safe_summary(" hello ") == "hello"
    assert _safe_summary("") is None
    assert _safe_summary(None) is None
    long = "a" * 1000
    out = _safe_summary(long)
    assert out is not None
    assert len(out) <= 240


def test_bucket_score_rejects_nan_and_inf():
    """NaN / inf are floats but must never bucket — they'd poison
    the JSON column and downstream Pydantic validators alike."""
    import math

    assert _bucket_score(math.nan) is None
    assert _bucket_score(math.inf) is None
    assert _bucket_score(-math.inf) is None


def test_safe_confidence_rejects_nan_and_inf():
    import math

    assert _safe_confidence(math.nan) is None
    assert _safe_confidence(math.inf) is None
    assert _safe_confidence(-math.inf) is None


# ── Prompt safety ────────────────────────────────────────────────────


def test_system_prompt_forbids_medical_diagnosis():
    """The provider must never ask the model for a medical opinion.

    The exact wording can drift over time, but the safety markers
    pinned below must remain — anyone editing the prompt sees the
    test fail and is forced to confirm the safety guidance stays
    explicit.
    """
    prompt = _SYSTEM_PROMPT.lower()
    assert "do not provide medical" in prompt
    assert "dermatological diagnosis" in prompt
    assert "disease" in prompt
    # JSON-only output requirement.
    assert "return only" in prompt
    assert "json" in prompt


def test_system_prompt_hardening_guidance_present():
    """The hardening pass adds three production-grade nudges to the
    model: prefer 'medium' when unsure, don't exaggerate, don't infer
    hidden conditions.  These are the levers that keep the rec engine
    from over-correcting on noisy or compressed images."""
    prompt = _SYSTEM_PROMPT.lower()
    assert "prefer 'medium'" in prompt
    assert "do not exaggerate" in prompt
    assert "hidden internal conditions" in prompt
    # Common disease names explicitly mentioned as forbidden.
    assert "rosacea" in prompt
    assert "eczema" in prompt
    # Tone instruction.
    assert "wellness" in prompt
    assert "observational" in prompt


# ── Construction-time config ────────────────────────────────────────


def test_constructor_requires_api_key():
    with pytest.raises(OpenAIVisionConfigError, match="OPENAI_API_KEY"):
        OpenAIVisionProvider(api_key=None)
    with pytest.raises(OpenAIVisionConfigError):
        OpenAIVisionProvider(api_key="   ")


def test_constructor_rejects_recursive_openai_fallback():
    """`openai_vision → openai_vision` would loop on transient errors."""
    inner, _ = _provider()
    with pytest.raises(OpenAIVisionConfigError, match="recursive"):
        OpenAIVisionProvider(
            api_key="sk-test",
            fallback=inner,
            client=_FakeClient(_FakeChatCompletions()),
        )


# ── Successful end-to-end with mocked SDK ────────────────────────────


def test_analyze_calls_sdk_with_correct_shape():
    p, completions = _provider()
    p.analyze(_DUMMY_FRONT)

    assert len(completions.calls) == 1
    kwargs = completions.calls[0]

    assert kwargs["model"] == "gpt-4o-mini"
    assert kwargs["response_format"] == {"type": "json_object"}
    # Temperature kept low so the structured JSON stays stable.
    assert kwargs["temperature"] == 0.2

    messages = kwargs["messages"]
    assert messages[0]["role"] == "system"
    assert messages[0]["content"] == _SYSTEM_PROMPT
    user = messages[1]
    assert user["role"] == "user"
    # Content is a list of parts: text + image_url.
    parts = user["content"]
    types = [p["type"] for p in parts]
    assert "text" in types and "image_url" in types
    image_part = next(p for p in parts if p["type"] == "image_url")
    image_url = image_part["image_url"]["url"]
    assert image_url.startswith("data:image/jpeg;base64,")
    # Round-trip: the front bytes must land in the URL as base64.
    assert _b64(_DUMMY_FRONT) in image_url
    # Cost lever: `detail=low` keeps prompt tokens flat (~85) regardless
    # of source image size.  Pinned so anyone removing it gets a
    # visible warning in CI.
    assert image_part["image_url"].get("detail") == "low"


def test_analyze_normalizes_a_representative_response():
    p, _ = _provider()
    result = p.analyze(_DUMMY_FRONT)

    assert result.provider == "openai_vision"
    assert result.skin_type == SkinType.COMBINATION
    assert result.hydration_level == Level.LOW
    assert result.oiliness == Level.MEDIUM
    assert result.redness_level == Level.LOW
    assert result.pores_score == 0.5  # "medium" → 0.5
    assert result.texture == Level.MEDIUM
    assert result.acne == Level.LOW
    assert result.fine_lines == Level.LOW
    assert result.confidence_score == pytest.approx(0.82)

    # recommendation_signals derived from the metrics.
    assert "hydration_support" in result.recommendation_signals
    # No oiliness=high, no redness=high → no oil/redness/texture flag.
    assert "oil_balance" not in result.recommendation_signals
    assert "redness_support" not in result.recommendation_signals


def test_recommendation_signals_fire_on_concerning_metrics():
    """Combined high-oil + high-texture + dehydration trigger several
    signals at once.  The signals are the rec engine's tap into the
    OpenAI result without it needing to know the metric names."""
    payload = _success_payload(
        hydration="low",
        oiliness="high",
        redness="high",
        pores_visibility="high",
        texture="high",
    )
    p, _ = _provider(
        completions=_FakeChatCompletions(returns=_FakeCompletion(json.dumps(payload)))
    )
    result = p.analyze(_DUMMY_FRONT)

    signals = result.recommendation_signals
    assert signals.get("hydration_support") == 1.0
    assert signals.get("oil_balance") == 1.0
    assert signals.get("texture_support") == 1.0
    assert signals.get("redness_support") == 1.0
    assert signals.get("barrier_support") == 1.0


def test_partial_response_uses_schema_defaults():
    """A model that only sends a subset of metrics must not crash —
    missing fields fall back to the conservative schema defaults."""
    minimal = {
        "skin_type": "normal",
        "hydration": "medium",
        "confidence_score": 0.7,
        # everything else omitted
    }
    p, _ = _provider(
        completions=_FakeChatCompletions(returns=_FakeCompletion(json.dumps(minimal)))
    )
    result = p.analyze(_DUMMY_FRONT)

    assert result.skin_type == SkinType.NORMAL
    assert result.hydration_level == Level.MEDIUM
    # Conservative defaults
    assert result.oiliness == Level.MEDIUM
    assert result.redness_level == Level.LOW
    assert result.acne == Level.LOW
    assert result.fine_lines == Level.LOW
    assert result.texture == Level.MEDIUM
    assert result.pigmentation_level == Level.LOW
    # pores_visibility absent → default Level.MEDIUM → 0.5
    assert result.pores_score == 0.5


def test_unknown_skin_type_falls_back_to_normal():
    payload = _success_payload(skin_type="sensitive")  # not in the enum
    p, _ = _provider(
        completions=_FakeChatCompletions(returns=_FakeCompletion(json.dumps(payload)))
    )
    result = p.analyze(_DUMMY_FRONT)
    assert result.skin_type == SkinType.NORMAL


def test_numeric_confidence_path_works():
    """The prompt asks for a float, but the model occasionally emits
    a 0..100 integer.  The parser should rescale rather than clamp
    to 1.0."""
    payload = _success_payload(confidence_score=82)
    p, _ = _provider(
        completions=_FakeChatCompletions(returns=_FakeCompletion(json.dumps(payload)))
    )
    result = p.analyze(_DUMMY_FRONT)
    assert result.confidence_score == pytest.approx(0.82)


def test_missing_confidence_uses_neutral_default():
    payload = _success_payload()
    payload.pop("confidence_score")
    p, _ = _provider(
        completions=_FakeChatCompletions(returns=_FakeCompletion(json.dumps(payload)))
    )
    result = p.analyze(_DUMMY_FRONT)
    assert result.confidence_score == 0.75


# ── raw_summary discipline ───────────────────────────────────────────


def test_raw_summary_is_compact_and_safe():
    p, _ = _provider()
    result = p.analyze(_DUMMY_FRONT)
    summary = result.raw_summary or {}

    allowed = {
        "model",
        "response_id",
        "prompt_tokens",
        "completion_tokens",
        "received_metrics",
        "summary",
        "fallback_used",
        "original_provider",
        "original_provider_error",
    }
    assert set(summary.keys()).issubset(allowed)
    serialised = json.dumps(summary).lower()
    # No base64 image payload smuggled back into persistence.
    assert "base64" not in serialised
    assert "data:image" not in serialised
    assert "image_url" not in serialised
    # The audit fields we expect on a happy-path response.
    assert summary["model"] == "gpt-4o-mini"
    assert summary["response_id"] == "chatcmpl-test-1"
    assert summary["prompt_tokens"] == 180
    assert summary["completion_tokens"] == 80
    assert "skin_type" in summary["received_metrics"]
    assert summary["summary"].startswith("Visible dehydration")


def test_raw_summary_caps_summary_string_length():
    long_summary = "x" * 1000
    payload = _success_payload(summary=long_summary)
    p, _ = _provider(
        completions=_FakeChatCompletions(returns=_FakeCompletion(json.dumps(payload)))
    )
    result = p.analyze(_DUMMY_FRONT)
    summary = (result.raw_summary or {}).get("summary", "")
    assert len(summary) <= 240


# ── Error classification ─────────────────────────────────────────────


def _import_openai_errors():
    """Helper to grab the SDK's error classes for raising in mocks."""
    from openai import (
        APIConnectionError,
        APIError,
        APITimeoutError,
        AuthenticationError,
        BadRequestError,
        RateLimitError,
    )

    return {
        "APIConnectionError": APIConnectionError,
        "APIError": APIError,
        "APITimeoutError": APITimeoutError,
        "AuthenticationError": AuthenticationError,
        "BadRequestError": BadRequestError,
        "RateLimitError": RateLimitError,
    }


def _mock_request() -> Any:
    """Build the minimal `httpx.Request` openai SDK errors expect."""
    import httpx

    return httpx.Request("POST", "https://api.openai.com/v1/chat/completions")


def _mock_response(status: int = 500) -> Any:
    import httpx

    return httpx.Response(status, request=_mock_request())


def test_auth_error_classified():
    errors = _import_openai_errors()
    exc = errors["AuthenticationError"](
        message="bad key", response=_mock_response(401), body=None
    )
    p, _ = _provider(completions=_FakeChatCompletions(raises=exc))
    with pytest.raises(OpenAIVisionAuthError, match="auth"):
        p.analyze(_DUMMY_FRONT)


def test_rate_limit_classified_as_server_error():
    """Rate limits are transient and should follow the same fallback
    path as a 5xx — the rec engine doesn't care which sub-flavour of
    "try again later" the vendor returned."""
    errors = _import_openai_errors()
    exc = errors["RateLimitError"](
        message="429", response=_mock_response(429), body=None
    )
    p, _ = _provider(completions=_FakeChatCompletions(raises=exc))
    with pytest.raises(OpenAIVisionServerError, match="rate limit"):
        p.analyze(_DUMMY_FRONT)


def test_timeout_classified_as_server_error():
    errors = _import_openai_errors()
    exc = errors["APITimeoutError"](request=_mock_request())
    p, _ = _provider(completions=_FakeChatCompletions(raises=exc))
    with pytest.raises(OpenAIVisionServerError, match="timed out"):
        p.analyze(_DUMMY_FRONT)


def test_network_error_classified_as_server_error():
    errors = _import_openai_errors()
    exc = errors["APIConnectionError"](request=_mock_request())
    p, _ = _provider(completions=_FakeChatCompletions(raises=exc))
    with pytest.raises(OpenAIVisionServerError, match="network"):
        p.analyze(_DUMMY_FRONT)


def test_bad_request_classified_as_request_error():
    errors = _import_openai_errors()
    exc = errors["BadRequestError"](
        message="invalid image", response=_mock_response(400), body=None
    )
    p, _ = _provider(completions=_FakeChatCompletions(raises=exc))
    with pytest.raises(OpenAIVisionRequestError):
        p.analyze(_DUMMY_FRONT)


def test_generic_api_error_classified_as_server_error():
    errors = _import_openai_errors()
    exc = errors["APIError"](
        message="boom", request=_mock_request(), body=None
    )
    p, _ = _provider(completions=_FakeChatCompletions(raises=exc))
    with pytest.raises(OpenAIVisionServerError):
        p.analyze(_DUMMY_FRONT)


def test_invalid_json_response_raises_request_error():
    completion = _FakeCompletion(content="not json {{}")
    p, _ = _provider(completions=_FakeChatCompletions(returns=completion))
    with pytest.raises(OpenAIVisionRequestError, match="invalid JSON"):
        p.analyze(_DUMMY_FRONT)


def test_empty_content_raises_request_error():
    completion = _FakeCompletion(content="")
    p, _ = _provider(completions=_FakeChatCompletions(returns=completion))
    with pytest.raises(OpenAIVisionRequestError, match="empty"):
        p.analyze(_DUMMY_FRONT)


def test_non_dict_json_raises_request_error():
    completion = _FakeCompletion(content=json.dumps([1, 2, 3]))
    p, _ = _provider(completions=_FakeChatCompletions(returns=completion))
    with pytest.raises(OpenAIVisionRequestError, match="unexpected response shape"):
        p.analyze(_DUMMY_FRONT)


# ── Fallback behaviour ───────────────────────────────────────────────


def test_fallback_runs_on_server_error():
    errors = _import_openai_errors()
    exc = errors["APIError"](message="boom", request=_mock_request(), body=None)
    p, _ = _provider(
        completions=_FakeChatCompletions(raises=exc),
        fallback=MockHautAIProvider(),
    )

    result = p.analyze(_DUMMY_FRONT)
    # Fallback's own provider name surfaces on the result …
    assert result.provider == "mock_haut"
    # … plus the audit markers stamped by `_run_fallback`.
    summary = result.raw_summary or {}
    assert summary.get("fallback_used") is True
    assert summary.get("original_provider") == "openai_vision"
    assert summary.get("original_provider_error")
    assert "OpenAI" in summary["original_provider_error"]


def test_fallback_runs_on_request_error():
    """A 4xx is request-time too — fall back rather than 500 the caller."""
    completion = _FakeCompletion(content="not json")
    p, _ = _provider(
        completions=_FakeChatCompletions(returns=completion),
        fallback=MockHautAIProvider(),
    )
    result = p.analyze(_DUMMY_FRONT)
    assert result.provider == "mock_haut"
    assert (result.raw_summary or {}).get("fallback_used") is True


def test_config_error_never_triggers_fallback():
    """The constructor refuses missing key — proves there's no quiet
    fallback path on bad config."""
    with pytest.raises(OpenAIVisionConfigError):
        OpenAIVisionProvider(
            api_key=None,
            fallback=MockHautAIProvider(),
            client=_FakeClient(_FakeChatCompletions()),
        )


def test_no_fallback_propagates_error():
    errors = _import_openai_errors()
    exc = errors["APIError"](message="boom", request=_mock_request(), body=None)
    p, _ = _provider(completions=_FakeChatCompletions(raises=exc))  # no fallback
    with pytest.raises(OpenAIVisionServerError):
        p.analyze(_DUMMY_FRONT)


def test_fallback_clips_long_error_messages():
    """If the SDK's error chain carries a very long server-side body,
    `raw_summary.original_provider_error` is capped so the JSON column
    can't bloat per scan."""
    errors = _import_openai_errors()
    huge_body = "x" * 5000
    exc = errors["APIError"](
        message=huge_body, request=_mock_request(), body=None
    )
    p, _ = _provider(
        completions=_FakeChatCompletions(raises=exc),
        fallback=MockHautAIProvider(),
    )
    result = p.analyze(_DUMMY_FRONT)
    err = (result.raw_summary or {}).get("original_provider_error", "")
    assert err  # message present …
    assert len(err) <= 200  # … and capped.


def test_fallback_summary_contains_no_stack_trace():
    """Stack traces in `raw_summary` would balloon the JSON column AND
    leak path / filename detail to anything reading `features_json`."""
    errors = _import_openai_errors()
    exc = errors["APIError"](
        message="boom", request=_mock_request(), body=None
    )
    p, _ = _provider(
        completions=_FakeChatCompletions(raises=exc),
        fallback=MockHautAIProvider(),
    )
    result = p.analyze(_DUMMY_FRONT)
    summary_text = json.dumps(result.raw_summary or {})
    # Common stack-trace markers must never appear.
    for marker in ("Traceback", "File \"/", ".py\", line ", "site-packages"):
        assert marker not in summary_text


def test_unknown_keys_in_raw_summary_are_dropped():
    """Belt-and-braces: the runtime allow-list in `_normalize_response`
    must drop any future helper that tries to smuggle a key outside
    the documented set into `features_json`."""
    p, _ = _provider()
    result = p.analyze(_DUMMY_FRONT)
    summary = result.raw_summary or {}
    allowed = {
        "model",
        "response_id",
        "prompt_tokens",
        "completion_tokens",
        "received_metrics",
        "summary",
    }
    assert set(summary.keys()).issubset(allowed)


# ── Interface compatibility ──────────────────────────────────────────


def test_side_images_are_ignored_but_not_an_error():
    """The current OpenAI provider sends front only.  Side bytes are
    accepted and dropped to preserve interface compatibility for a
    future multi-angle version."""
    p, completions = _provider()
    p.analyze(_DUMMY_FRONT, left=b"left-bytes", right=b"right-bytes")
    # Only one part with type=image_url should appear in the user
    # message — the side bytes never travel to the model.
    kwargs = completions.calls[0]
    user_parts = kwargs["messages"][1]["content"]
    image_parts = [p for p in user_parts if p["type"] == "image_url"]
    assert len(image_parts) == 1


# ── Factory routing ──────────────────────────────────────────────────


def test_factory_routes_openai_vision(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_provider", "openai_vision"
    )
    monkeypatch.setattr("app.core.config.settings.openai_api_key", "sk-from-env")
    monkeypatch.setattr("app.core.config.settings.openai_model", "gpt-4o-mini")
    monkeypatch.setattr("app.core.config.settings.openai_timeout_seconds", 5.0)
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", None
    )

    provider = get_skin_analysis_provider()
    assert isinstance(provider, OpenAIVisionProvider)
    assert provider.name == "openai_vision"
    factory_fn.cache_clear()


def test_factory_openai_missing_key_raises(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_provider", "openai_vision"
    )
    monkeypatch.setattr("app.core.config.settings.openai_api_key", None)
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", None
    )
    with pytest.raises(OpenAIVisionConfigError):
        get_skin_analysis_provider()
    factory_fn.cache_clear()


def test_factory_rejects_openai_vision_as_fallback(monkeypatch):
    """A `SKIN_ANALYSIS_FALLBACK_PROVIDER=openai_vision` config would
    loop on transient errors — the factory rejects it at startup."""
    factory_fn.cache_clear()
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_provider", "openai_vision"
    )
    monkeypatch.setattr("app.core.config.settings.openai_api_key", "sk-from-env")
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", "openai_vision"
    )
    with pytest.raises(ValueError, match="openai_vision is similarly rejected"):
        get_skin_analysis_provider()
    factory_fn.cache_clear()


def test_factory_resolves_local_fallback_for_openai(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_provider", "openai_vision"
    )
    monkeypatch.setattr("app.core.config.settings.openai_api_key", "sk-from-env")
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", "local"
    )
    provider = get_skin_analysis_provider()
    assert isinstance(provider, OpenAIVisionProvider)
    assert isinstance(provider._fallback, LocalHeuristicProvider)
    factory_fn.cache_clear()


def test_factory_resolves_mock_haut_fallback_for_openai(monkeypatch):
    factory_fn.cache_clear()
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_provider", "openai_vision"
    )
    monkeypatch.setattr("app.core.config.settings.openai_api_key", "sk-from-env")
    monkeypatch.setattr(
        "app.core.config.settings.skin_analysis_fallback_provider", "mock_haut"
    )
    provider = get_skin_analysis_provider()
    assert isinstance(provider, OpenAIVisionProvider)
    assert isinstance(provider._fallback, MockHautAIProvider)
    factory_fn.cache_clear()


# ── Live integration (opt-in) ────────────────────────────────────────


@pytest.mark.skipif(
    not os.environ.get("OPENAI_API_KEY"),
    reason="OPENAI_API_KEY not set; live integration test skipped",
)
def test_live_openai_vision_smoke():
    """Single round-trip against the real OpenAI Vision endpoint.

    Skipped unless the contributor explicitly opts in by exporting
    `OPENAI_API_KEY`.  The assertions are intentionally weak — we
    only want to know that the wire shape lines up and the response
    normalizes cleanly, not pin specific values that depend on the
    sample image.  Image is generated in-memory with Pillow so no
    fixture file needs to live in the repo.
    """
    import io

    try:
        from PIL import Image
    except ImportError:
        pytest.skip("Pillow not installed; cannot build a live test image")

    provider = OpenAIVisionProvider(
        api_key=os.environ["OPENAI_API_KEY"],
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        timeout_seconds=float(os.environ.get("OPENAI_TIMEOUT_SECONDS", "30")),
    )
    # A real, decoder-friendly JPEG so OpenAI's image parser accepts it.
    img = Image.new("RGB", (96, 96), (210, 175, 150))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    result = provider.analyze(buf.getvalue())

    assert result.provider == "openai_vision"
    assert 0.0 <= result.confidence_score <= 1.0
    # The model is asked for one of the four canonical skin types; any
    # other value would mean our parser silently fell back to
    # `Level.MEDIUM`/`SkinType.NORMAL` instead of catching drift.
    assert result.skin_type.value in {"dry", "oily", "combination", "normal"}
    # raw_summary stays compact — no image bytes leak through.
    summary_text = (result.raw_summary or {}).get("summary", "")
    assert "base64" not in summary_text.lower()
