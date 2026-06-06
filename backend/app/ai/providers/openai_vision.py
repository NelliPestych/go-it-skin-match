"""OpenAI Vision skin-analysis provider — defensive wrapper around the official SDK.

Invariants (easy to regress):
* Strict JSON output (response_format=json_object) + tolerant parser.
* No medical claims — prompt forbids diagnosis / disease language.
* raw_summary is allow-listed: model id, response id, token counts, short summary.
  No base64, no full response, no image bytes.
* API key never logged; error strings are short.
* Optional fallback is invoked on request-time errors only — config errors propagate.
* Front shot only (cost). Side bytes already persisted by the service layer.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Dict, List, Optional

from app.ai.providers.base import SkinAnalysisProvider
from app.schemas.common import Level, SkinType
from app.schemas.skin_analysis import NormalizedSkinAnalysisResult


logger = logging.getLogger(__name__)


_PROVIDER_NAME = "openai_vision"

# Belt-and-braces caps against drifted/long payloads bloating features_json.
_SUMMARY_MAX_CHARS = 240
_ERROR_MESSAGE_MAX_CHARS = 200

_ALLOWED_LEVELS = {"low", "medium", "high"}
_ALLOWED_SKIN_TYPES = {"dry", "oily", "combination", "normal"}

# Allow-list of raw_summary keys — enforced at runtime to prevent payload smuggling.
_RAW_SUMMARY_ALLOWED_KEYS = frozenset(
    {
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
)


# "low" downsamples to 512px, ~85 tokens regardless of source size — ~100× cheaper.
_IMAGE_DETAIL = "low"

# Pinned as a constant so tests can assert wording stays safe (no diagnosis language).

_SYSTEM_PROMPT = (
    "You are a cosmetic skin analysis assistant for a skincare "
    "product-recommendation app. Look at the provided face image and "
    "estimate visible skin characteristics in cosmetic, wellness-"
    "oriented language only.\n\n"
    "STRICT SAFETY RULES (must always hold):\n"
    "- Do not provide medical or dermatological diagnosis.\n"
    "- Do not mention specific diseases or skin conditions by name "
    "(no acne vulgaris, no rosacea, no eczema, no dermatitis, no "
    "psoriasis, no inflammatory or autoimmune disorders, etc.).\n"
    "- Do not use certainty language ('you have', 'this is', "
    "'diagnosed with', 'suffering from').\n"
    "- Do not infer hidden internal conditions, hormones, allergies, "
    "diet, sleep, or medications.\n"
    "- Describe only what is visually estimable on the surface of the "
    "skin in cosmetic terms.\n\n"
    "ESTIMATION RULES:\n"
    "- If a characteristic is unclear or borderline, prefer 'medium'.\n"
    "- Do not exaggerate. Single-pixel artifacts, JPEG compression, "
    "lighting, or makeup are NOT skin characteristics.\n"
    "- Treat the photo as a single observation, not a clinical record.\n"
    "- Stay observational; describe what is visible, never recommend "
    "or prescribe treatments.\n\n"
    "Return ONLY a strict JSON object with these keys (no prose, no "
    "comments, no Markdown, no extra keys):\n"
    "{\n"
    '  "skin_type": "dry" | "oily" | "combination" | "normal",\n'
    '  "hydration": "low" | "medium" | "high",\n'
    '  "oiliness": "low" | "medium" | "high",\n'
    '  "redness": "low" | "medium" | "high",\n'
    '  "pores_visibility": "low" | "medium" | "high",\n'
    '  "texture": "low" | "medium" | "high",\n'
    '  "acne": "low" | "medium" | "high",\n'
    '  "fine_lines": "low" | "medium" | "high",\n'
    '  "confidence_score": float between 0.0 and 1.0,\n'
    '  "summary": "brief cosmetic observation, under 120 characters, '
    'wellness-oriented, no diagnostic language"\n'
    "}\n"
    "Use only the literal values listed for the categorical fields. "
    "If a signal is not visible at all, choose 'low'."
)


# ── Errors ────────────────────────────────────────────────────────────


class OpenAIVisionError(Exception):
    """Base error for the OpenAI Vision provider."""


class OpenAIVisionConfigError(OpenAIVisionError):
    """Misconfiguration (missing API key, missing SDK, looping fallback).

    Distinct from request-time errors so the factory and the fallback
    wiring can refuse to swallow it — a config error indicates a
    deployment bug, never a transient failure.
    """


class OpenAIVisionAuthError(OpenAIVisionError):
    """401 / invalid-key returned by OpenAI."""


class OpenAIVisionRequestError(OpenAIVisionError):
    """4xx (non-auth), missing required fields, or invalid JSON content."""


class OpenAIVisionServerError(OpenAIVisionError):
    """5xx, rate limit, network / timeout."""


# Helpers intentionally duplicated from haut_ai — change isolation > DRY here.


def _bucket_score(value: Any) -> Optional[Level]:
    """Map model-returned categorical string or numeric 0..1/0..100 to Level."""
    if value is None:
        return None
    if isinstance(value, bool):
        # bool subclasses int — refuse explicitly.
        return None
    if isinstance(value, (int, float)):
        import math

        x = float(value)
        if math.isnan(x) or math.isinf(x):
            return None
        if 0.0 <= x <= 1.0:
            x *= 100.0
        if x < 33.0:
            return Level.LOW
        if x < 66.0:
            return Level.MEDIUM
        return Level.HIGH
    if isinstance(value, str):
        s = value.strip().lower()
        if s in ("low", "l"):
            return Level.LOW
        if s in ("medium", "med", "m"):
            return Level.MEDIUM
        if s in ("high", "h"):
            return Level.HIGH
    return None


def _parse_skin_type(value: Any) -> Optional[SkinType]:
    """Tolerant parse of the model's `skin_type` field."""
    if not isinstance(value, str):
        return None
    s = value.strip().lower()
    if s == "dry":
        return SkinType.DRY
    if s == "oily":
        return SkinType.OILY
    if s in ("combination", "combo"):
        return SkinType.COMBINATION
    if s == "normal":
        return SkinType.NORMAL
    return None


def _level_to_pores_score(level: Optional[Level]) -> float:
    """Project Level → 0..1 pores_score (LOW=0.2, MEDIUM=0.5, HIGH=0.8)."""
    if level is Level.LOW:
        return 0.2
    if level is Level.HIGH:
        return 0.8
    return 0.5


def _safe_confidence(value: Any) -> Optional[float]:
    """Coerce the model's confidence into our 0..1 float.

    Rejects bool / NaN / infinity so a misbehaving model can't poison
    the JSON column with a non-numeric or out-of-range float.
    """
    import math

    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        x = float(value)
        if math.isnan(x) or math.isinf(x):
            return None
        if x > 1.0:
            x = x / 100.0
        return max(0.0, min(1.0, x))
    return None


def _safe_summary(value: Any) -> Optional[str]:
    """Trim the model's `summary` to a known-safe length."""
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    return s[:_SUMMARY_MAX_CHARS]


# ── Provider ──────────────────────────────────────────────────────────


class OpenAIVisionProvider(SkinAnalysisProvider):
    """OpenAI Vision provider with an optional fallback."""

    name = _PROVIDER_NAME

    def __init__(
        self,
        api_key: Optional[str],
        model: str = "gpt-4o-mini",
        timeout_seconds: float = 30.0,
        fallback: Optional[SkinAnalysisProvider] = None,
        client: Any = None,
    ) -> None:
        # Fail at construction so a misconfigured deploy can't silently degrade.
        if not api_key or not api_key.strip():
            raise OpenAIVisionConfigError(
                "OPENAI_API_KEY is required when SKIN_ANALYSIS_PROVIDER=openai_vision. "
                "Set the key or switch to SKIN_ANALYSIS_PROVIDER=mock_haut."
            )
        if fallback is not None and getattr(fallback, "name", None) == _PROVIDER_NAME:
            raise OpenAIVisionConfigError(
                "SKIN_ANALYSIS_FALLBACK_PROVIDER must be one of {local, mock_haut}; "
                "got 'openai_vision' which would create a recursive fallback loop."
            )

        self._api_key = api_key.strip()
        self._model = model
        self._timeout = timeout_seconds
        self._fallback = fallback

        if client is not None:
            self._client = client  # test injection
        else:
            # Lazy import so the project imports without the SDK installed.
            try:
                from openai import OpenAI  # type: ignore[import-not-found]
            except ImportError as exc:  # pragma: no cover - exercised via test
                raise OpenAIVisionConfigError(
                    "OpenAI Python SDK is not installed. "
                    "Run `pip install openai` or use a different provider."
                ) from exc
            self._client = OpenAI(api_key=self._api_key, timeout=timeout_seconds)

    def analyze(
        self,
        front: bytes,
        left: Optional[bytes] = None,
        right: Optional[bytes] = None,
    ) -> NormalizedSkinAnalysisResult:
        # Sides kept in the signature for forward-compat; persistence happens upstream.
        _ = (left, right)
        try:
            response = self._call_openai(front)
            return self._normalize_response(response)
        except OpenAIVisionError as exc:
            if isinstance(exc, OpenAIVisionConfigError) or self._fallback is None:
                raise
            return self._run_fallback(front, left, right, exc)

    def _build_messages(self, front: bytes) -> List[Dict[str, Any]]:
        """System + single user turn with inline base64 image at detail=low."""
        image_data_url = f"data:image/jpeg;base64,{_b64(front)}"
        return [
            {
                "role": "system",
                "content": _SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Analyze the cosmetic skin characteristics visible "
                            "in this face photo. Return ONLY the JSON object "
                            "described in the system message."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_data_url,
                            "detail": _IMAGE_DETAIL,
                        },
                    },
                ],
            },
        ]

    # ── Send ─────────────────────────────────────────────────────────

    def _call_openai(self, front: bytes) -> Dict[str, Any]:
        """Single touchpoint for the OpenAI SDK.

        Returns a dict with parsed JSON content plus the small set of
        metadata fields we persist in `raw_summary` (response id,
        model name, token usage).  Every failure mode is classified
        into a typed `OpenAIVisionError` subclass so `analyze()` can
        decide whether to fall back or propagate.
        """
        # Lazy import so the module imports without the SDK installed.
        try:
            from openai import (  # type: ignore[import-not-found]
                APIConnectionError,
                APIError,
                APITimeoutError,
                AuthenticationError,
                BadRequestError,
                RateLimitError,
            )
        except ImportError as exc:  # pragma: no cover
            raise OpenAIVisionConfigError(
                "OpenAI Python SDK is not installed."
            ) from exc

        messages = self._build_messages(front)

        try:
            completion = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.2,
            )
        except AuthenticationError as exc:
            raise OpenAIVisionAuthError("OpenAI auth failed") from exc
        except RateLimitError as exc:
            raise OpenAIVisionServerError("OpenAI rate limit exceeded") from exc
        except APITimeoutError as exc:
            raise OpenAIVisionServerError("OpenAI request timed out") from exc
        except APIConnectionError as exc:
            raise OpenAIVisionServerError("OpenAI network error") from exc
        except BadRequestError as exc:
            raise OpenAIVisionRequestError("OpenAI rejected the request") from exc
        except APIError as exc:
            # Catch-all (incl. 5xx); treated as server error so fallback applies.
            raise OpenAIVisionServerError("OpenAI API error") from exc

        try:
            content = completion.choices[0].message.content
        except (AttributeError, IndexError, TypeError) as exc:
            raise OpenAIVisionRequestError(
                "OpenAI response did not contain a message"
            ) from exc

        if not isinstance(content, str) or not content.strip():
            raise OpenAIVisionRequestError("OpenAI returned an empty message")

        try:
            parsed = json.loads(content)
        except ValueError as exc:
            raise OpenAIVisionRequestError(
                "OpenAI returned invalid JSON"
            ) from exc
        if not isinstance(parsed, dict):
            raise OpenAIVisionRequestError(
                "OpenAI returned an unexpected response shape"
            )

        usage = getattr(completion, "usage", None)
        return {
            "parsed": parsed,
            "response_id": getattr(completion, "id", None),
            "model": getattr(completion, "model", self._model),
            "prompt_tokens": getattr(usage, "prompt_tokens", None) if usage else None,
            "completion_tokens": (
                getattr(usage, "completion_tokens", None) if usage else None
            ),
        }

    def _normalize_response(
        self,
        raw: Dict[str, Any],
    ) -> NormalizedSkinAnalysisResult:
        """Project model JSON onto NormalizedSkinAnalysisResult; tolerant of missing keys."""
        body: Dict[str, Any] = raw.get("parsed") or {}

        # Track which metrics arrived so we can audit without storing the full body.
        received: List[str] = []

        def _read(metric: str) -> Any:
            if metric in body and body[metric] is not None:
                received.append(metric)
                return body[metric]
            return None

        skin_type = _parse_skin_type(_read("skin_type")) or SkinType.NORMAL
        hydration = _bucket_score(_read("hydration")) or Level.MEDIUM
        oiliness = _bucket_score(_read("oiliness")) or Level.MEDIUM
        redness = _bucket_score(_read("redness")) or Level.LOW
        pigmentation = _bucket_score(_read("pigmentation")) or Level.LOW
        texture = _bucket_score(_read("texture")) or Level.MEDIUM
        acne = _bucket_score(_read("acne")) or Level.LOW
        fine_lines = _bucket_score(_read("fine_lines")) or Level.LOW

        pores_level = _bucket_score(_read("pores_visibility"))
        pores_score = _level_to_pores_score(pores_level)

        confidence_score = _safe_confidence(_read("confidence_score"))
        if confidence_score is None:
            confidence_score = 0.75

        # Build a small recommendation_signals dict so downstream
        # rules can read provider-agnostic flags.  All numeric so the
        # rec engine can blend them later without per-key type guards.
        signals: Dict[str, float] = {}
        if hydration is Level.LOW:
            signals["hydration_support"] = 1.0
        if oiliness is Level.HIGH:
            signals["oil_balance"] = 1.0
        if texture is Level.HIGH or (pores_level is Level.HIGH):
            signals["texture_support"] = 1.0
        if redness is Level.HIGH:
            signals["redness_support"] = 1.0
        if hydration is Level.LOW and (texture is Level.HIGH or redness is Level.HIGH):
            signals["barrier_support"] = 1.0

        summary_text = _safe_summary(body.get("summary"))

        raw_summary: Dict[str, Any] = {
            "model": raw.get("model"),
            "response_id": raw.get("response_id"),
            "prompt_tokens": raw.get("prompt_tokens"),
            "completion_tokens": raw.get("completion_tokens"),
            "received_metrics": sorted(received),
            "summary": summary_text,
        }
        # Drop None + enforce allow-list as a final defence against payload smuggling.
        raw_summary = {
            k: v
            for k, v in raw_summary.items()
            if v is not None and k in _RAW_SUMMARY_ALLOWED_KEYS
        }

        return NormalizedSkinAnalysisResult(
            skin_type=skin_type,
            redness_level=redness,
            hydration_level=hydration,
            pigmentation_level=pigmentation,
            pores_score=pores_score,
            confidence_score=confidence_score,
            oiliness=oiliness,
            acne=acne,
            fine_lines=fine_lines,
            texture=texture,
            recommendation_signals=signals,
            raw_summary=raw_summary,
            provider=self.name,
        )

    def _run_fallback(
        self,
        front: bytes,
        left: Optional[bytes],
        right: Optional[bytes],
        original_error: OpenAIVisionError,
    ) -> NormalizedSkinAnalysisResult:
        """Run the configured fallback provider and tag the result.

        Char-capped typed-error string only — never the __cause__ chain.
        """
        safe_message = (str(original_error) or original_error.__class__.__name__)[
            :_ERROR_MESSAGE_MAX_CHARS
        ]
        logger.warning(
            "OpenAI Vision request failed, falling back to %s: %s",
            getattr(self._fallback, "name", "<unknown>"),
            safe_message,
        )
        assert self._fallback is not None
        result = self._fallback.analyze(front, left=left, right=right)
        annotated: Dict[str, Any] = dict(result.raw_summary or {})
        annotated["fallback_used"] = True
        annotated["original_provider"] = self.name
        annotated["original_provider_error"] = safe_message
        return result.model_copy(update={"raw_summary": annotated})


def _b64(image_bytes: bytes) -> str:
    """Encode image bytes to base64 ASCII text for the SDK image_url part."""
    return base64.b64encode(image_bytes).decode("ascii")
