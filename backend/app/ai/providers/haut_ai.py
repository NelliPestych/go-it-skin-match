"""Haut.AI skin-analysis provider — defensive HTTP client behind SkinAnalysisProvider.

Wire shape is a placeholder until real Haut.AI docs land; swap is isolated to
the three constants below + three private methods (_build / _send / _normalize).

Invariants (easy to regress):
* Sync public analyze() uses asyncio.run() over httpx.AsyncClient inside.
* Tolerant parser — every metric optional, numeric or categorical, schema defaults.
* raw_summary budget: request id, model version, received metric names, image count,
  processing time. No base64, masks, thumbnails, or full vendor JSON.
* API key never logged. Error strings are short safe text.
* Fallback fires only on request-time errors; HautAIConfigError always propagates.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.ai.providers.base import SkinAnalysisProvider
from app.schemas.common import Level, SkinType
from app.schemas.skin_analysis import NormalizedSkinAnalysisResult


logger = logging.getLogger(__name__)


# Wire-shape placeholders — swap when real Haut.AI contract is available.
_ENDPOINT_PATH = "/v1/skin-analysis"
_IMAGES_FIELD = "images"
_PROVIDER_NAME = "haut_ai"

# Vendor metric names — missing keys are treated as "not measured".
_METRIC_KEY_MAP = {
    "skin_type": "skin_type",
    "oiliness": "oiliness",
    "hydration": "hydration",
    "redness": "redness",
    "pigmentation": "pigmentation",
    "pores": "pores",
    "acne": "acne",
    "fine_lines": "fine_lines",
    "texture": "texture",
}


# ── Errors ────────────────────────────────────────────────────────────


class HautAIError(Exception):
    """Base error for the Haut.AI provider."""


class HautAIConfigError(HautAIError):
    """Misconfiguration (missing API key, invalid fallback name).

    Distinct from request-time errors so the factory and the
    fallback wiring can refuse to swallow it — a config error
    indicates a deployment bug, never a transient failure.
    """


class HautAIAuthError(HautAIError):
    """401 / 403 from the provider."""


class HautAIRequestError(HautAIError):
    """4xx (non-auth), missing required fields, or invalid JSON."""


class HautAIServerError(HautAIError):
    """5xx or network / timeout."""


# ── Helpers ───────────────────────────────────────────────────────────


def _bucket_score(value: Any) -> Optional[Level]:
    """Map numeric (0–1 or 0–100) or categorical 'low|medium|high' to Level."""
    if value is None:
        return None
    if isinstance(value, bool):
        # bool subclasses int — refuse explicitly.
        return None
    if isinstance(value, (int, float)):
        x = float(value)
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
    return None


def _parse_skin_type(value: Any) -> Optional[SkinType]:
    """Tolerant parse; unknown strings → None so caller decides defaults."""
    if not isinstance(value, str):
        return None
    s = value.strip().lower()
    if s in ("dry",):
        return SkinType.DRY
    if s in ("oily",):
        return SkinType.OILY
    if s in ("combination", "combo"):
        return SkinType.COMBINATION
    if s in ("normal",):
        return SkinType.NORMAL
    return None


def _safe_pores_score(value: Any) -> Optional[float]:
    """Coerce 0..1 / 0..100 numeric or categorical to a 0..1 float."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        x = float(value)
        if x > 1.0:
            x = x / 100.0
        return max(0.0, min(1.0, x))
    level = _bucket_score(value)
    if level is Level.LOW:
        return 0.2
    if level is Level.MEDIUM:
        return 0.5
    if level is Level.HIGH:
        return 0.8
    return None


def _safe_confidence(value: Any) -> Optional[float]:
    """Coerce the provider's confidence into our 0..1 float."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        x = float(value)
        if x > 1.0:
            x = x / 100.0
        return max(0.0, min(1.0, x))
    return None


def _safe_signals(value: Any) -> Dict[str, float]:
    """Numeric-only projection of provider recommendation_signals."""
    if not isinstance(value, dict):
        return {}
    out: Dict[str, float] = {}
    for key, raw in value.items():
        if isinstance(raw, bool):
            continue
        if isinstance(raw, (int, float)):
            out[str(key)] = float(raw)
    return out


# ── Provider ──────────────────────────────────────────────────────────


class HautAIProvider(SkinAnalysisProvider):
    """Real Haut.AI provider with an optional fallback."""

    name = _PROVIDER_NAME

    def __init__(
        self,
        api_key: Optional[str],
        base_url: str,
        timeout_seconds: float,
        fallback: Optional[SkinAnalysisProvider] = None,
    ) -> None:
        # Fail at construction so a misconfigured deploy can't silently degrade.
        if not api_key or not api_key.strip():
            raise HautAIConfigError(
                "HAUT_AI_API_KEY is required when SKIN_ANALYSIS_PROVIDER=haut_ai. "
                "Set the key or switch to SKIN_ANALYSIS_PROVIDER=mock_haut."
            )
        if fallback is not None and getattr(fallback, "name", None) == _PROVIDER_NAME:
            raise HautAIConfigError(
                "SKIN_ANALYSIS_FALLBACK_PROVIDER must be one of {local, mock_haut}; "
                "got 'haut_ai' which would create a recursive fallback loop."
            )
        self._api_key = api_key.strip()
        self._base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_seconds)
        self._fallback = fallback

    def analyze(
        self,
        front: bytes,
        left: Optional[bytes] = None,
        right: Optional[bytes] = None,
    ) -> NormalizedSkinAnalysisResult:
        payload = self._build_request_payload(front, left=left, right=right)
        images_received = len(payload[_IMAGES_FIELD])

        try:
            raw = asyncio.run(self._send_request(payload))
            return self._normalize_response(raw, images_received=images_received)
        except HautAIError as exc:
            # Config errors never fallback — that would hide deploy bugs.
            if isinstance(exc, HautAIConfigError) or self._fallback is None:
                raise
            return self._run_fallback(front, left, right, exc)

    def _build_request_payload(
        self,
        front: bytes,
        left: Optional[bytes] = None,
        right: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        """Compose {images: [{pose, content_base64}]}."""
        images: List[Dict[str, str]] = [
            {"pose": "front", "content_base64": _b64(front)}
        ]
        if left is not None:
            images.append({"pose": "left", "content_base64": _b64(left)})
        if right is not None:
            images.append({"pose": "right", "content_base64": _b64(right)})
        return {_IMAGES_FIELD: images}

    async def _send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Single network touchpoint; classifies every failure into HautAIError."""
        url = f"{self._base_url}{_ENDPOINT_PATH}"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(url, headers=headers, json=payload)
        except httpx.TimeoutException as exc:
            raise HautAIServerError("Haut.AI request timed out") from exc
        except httpx.RequestError as exc:
            # DNS / connection / TLS — anything transport-level.
            raise HautAIServerError("Haut.AI network error") from exc


        status = response.status_code
        if status == 401 or status == 403:
            raise HautAIAuthError(f"Haut.AI auth failed (HTTP {status})")
        if 400 <= status < 500:
            raise HautAIRequestError(f"Haut.AI rejected the request (HTTP {status})")
        if status >= 500:
            raise HautAIServerError(f"Haut.AI server error (HTTP {status})")

        try:
            data = response.json()
        except ValueError as exc:
            raise HautAIRequestError("Haut.AI returned invalid JSON") from exc
        if not isinstance(data, dict):
            raise HautAIRequestError("Haut.AI returned an unexpected response shape")
        return data

    def _normalize_response(
        self,
        raw: Dict[str, Any],
        images_received: int,
    ) -> NormalizedSkinAnalysisResult:
        """Tolerant projection onto NormalizedSkinAnalysisResult — defaults on unknown."""
        # Defensive against {"result": {...}} envelopes.
        if "result" in raw and isinstance(raw["result"], dict):
            metrics_source: Dict[str, Any] = dict(raw.get("result", {}))
        else:
            metrics_source = raw
        if "metrics" in metrics_source and isinstance(metrics_source["metrics"], dict):
            metrics: Dict[str, Any] = metrics_source["metrics"]
        else:
            metrics = metrics_source

        # Track received metric names so we can audit without storing the full body.
        received: List[str] = []

        def _read(metric_name: str) -> Any:
            key = _METRIC_KEY_MAP.get(metric_name, metric_name)
            if key in metrics and metrics[key] is not None:
                received.append(metric_name)
                return metrics[key]
            return None

        skin_type = _parse_skin_type(_read("skin_type")) or SkinType.NORMAL
        redness = _bucket_score(_read("redness")) or Level.LOW
        hydration = _bucket_score(_read("hydration")) or Level.MEDIUM
        pigmentation = _bucket_score(_read("pigmentation")) or Level.LOW
        oiliness = _bucket_score(_read("oiliness")) or Level.MEDIUM
        acne = _bucket_score(_read("acne")) or Level.LOW
        fine_lines = _bucket_score(_read("fine_lines")) or Level.LOW
        texture = _bucket_score(_read("texture")) or Level.MEDIUM

        pores_score = _safe_pores_score(_read("pores"))
        if pores_score is None:
            pores_score = 0.4  # neutral default

        confidence_score = _safe_confidence(
            metrics.get("confidence_score")
            or metrics.get("confidence")
            or metrics_source.get("confidence_score")
        )
        if confidence_score is None:
            confidence_score = 0.75

        signals = _safe_signals(
            metrics.get("recommendation_signals")
            or metrics_source.get("recommendation_signals")
        )

        raw_summary: Dict[str, Any] = {
            "provider_request_id": raw.get("request_id") or raw.get("id"),
            "model_version": raw.get("model_version") or raw.get("version"),
            "received_metrics": sorted(received),
            "images_received": images_received,
            "processing_time_ms": raw.get("processing_time_ms")
            or raw.get("processing_time"),
        }
        raw_summary = {k: v for k, v in raw_summary.items() if v is not None}

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
        original_error: HautAIError,
    ) -> NormalizedSkinAnalysisResult:
        """Run fallback; log + annotate raw_summary with the short safe error."""
        safe_message = str(original_error) or original_error.__class__.__name__
        logger.warning(
            "Haut.AI request failed, falling back to %s: %s",
            getattr(self._fallback, "name", "<unknown>"),
            safe_message,
        )
        result = self._fallback.analyze(front, left=left, right=right)  # type: ignore[union-attr]
        annotated_summary: Dict[str, Any] = dict(result.raw_summary or {})
        annotated_summary["fallback_used"] = True
        annotated_summary["original_provider"] = self.name
        annotated_summary["original_provider_error"] = safe_message
        return result.model_copy(update={"raw_summary": annotated_summary})


def _b64(image_bytes: bytes) -> str:
    """Encode image bytes to base64 ASCII text for JSON transport."""
    return base64.b64encode(image_bytes).decode("ascii")
