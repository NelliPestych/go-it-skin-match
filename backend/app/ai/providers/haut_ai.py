"""Real Haut.AI skin-analysis provider.

A thin, defensive HTTP client wrapped behind the project's
`SkinAnalysisProvider` interface.  This provider is what production
ultimately routes to via `SKIN_ANALYSIS_PROVIDER=haut_ai`; until we
hold real credentials and the official API contract, the request /
response shape used here is a **placeholder** intentionally isolated
in three swap-friendly methods:

  * `_build_request_payload(...)` — wire shape for the outbound JSON.
  * `_send_request(...)`          — single touchpoint for the network.
  * `_normalize_response(...)`    — vendor → `NormalizedSkinAnalysisResult`.

When the real Haut.AI spec lands, only the three constants at the top
of this file (endpoint path, image-list key, metric-name map) plus the
three private methods above should need to change.  The public
`analyze()` signature, error taxonomy, fallback wiring and tests all
stay put.

Design choices worth pinning here, because they're easy to regress:

1. **Public method stays synchronous.**  The rest of the system speaks
   sync (`analysis_service._run_provider`).  We deliberately use
   `httpx.AsyncClient` *inside* `_send_request`, called from a
   threadpool-safe `asyncio.run(...)` inside the sync `analyze()`.
   FastAPI runs the calling service methods in its threadpool, so
   there is no live event loop in the calling thread.

2. **Conservative, never diagnostic, normalization.**  Real provider
   payloads will drift; the response parser treats every metric as
   optional, accepts both numeric (0–100) and categorical strings
   (`"low"|"medium"|"high"`), and falls back to the
   `NormalizedSkinAnalysisResult` schema defaults rather than crashing.

3. **`raw_summary` budget.**  We persist a tiny audit blob — request
   id, model version, list of *metric names* received, image count,
   processing time.  No base64.  No masks.  No thumbnails.  No full
   vendor JSON.  `features_json` is a JSON column on `SkinScan` and
   we don't want to bloat it per scan.

4. **API key hygiene.**  The key is read in `__init__`, never logged
   anywhere (we don't log headers; error messages are the short safe
   text in `original_provider_error`).

5. **Fallback semantics.**  Optional `fallback` provider is invoked
   only on request-time errors (`HautAIAuthError`, `HautAIRequestError`,
   `HautAIServerError`).  `HautAIConfigError` always propagates — a
   silent fallback from a config error would mask a deployment bug.
   The fallback result is annotated with `raw_summary.fallback_used`
   and `raw_summary.original_provider_error` so operators can spot it
   in features_json without digging through logs.
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


# ── Wire-shape placeholders ──────────────────────────────────────────
# Swap these three to align with the real Haut.AI contract once we have
# credentials + docs.  Everything else stays the same.

_ENDPOINT_PATH = "/v1/skin-analysis"
_IMAGES_FIELD = "images"
_PROVIDER_NAME = "haut_ai"

# Vendor metric names we expect to find on a successful response.
# Anything missing is treated as "not measured" rather than crashing.
# Keeping the map keys as Haut.AI-ish names insulates the rest of the
# codebase from vendor terminology drift.
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
    """Map a vendor-side metric value to our `Level` enum.

    Accepts both shapes the real Haut.AI is plausible to return:

      * numeric 0–100 (or 0–1) — bucketed into thirds.
      * categorical strings — `"low" | "medium" | "high"`, case- and
        whitespace-insensitive.  Anything else returns `None` so the
        caller can fall back to the schema default rather than coerce
        garbage into a category.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        # bool is a subclass of int in Python; refuse it explicitly so
        # `True`/`False` don't accidentally bucket as "medium"/"low".
        return None
    if isinstance(value, (int, float)):
        x = float(value)
        # Tolerate both 0–1 and 0–100 ranges so the bucketing stays
        # correct regardless of how the provider chooses to scale.
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
    """Tolerant parse of the provider's `skin_type` field.

    Unknown strings (e.g. `"sensitive"` — not in our enum) collapse to
    `None` so the caller can decide on a default rather than 500.
    """
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
    """Coerce the vendor's `pores` reading into our 0..1 float.

    Accepts numeric 0–1 or 0–100.  Categorical strings are bucketed
    to a representative float so a level-only response still produces
    something useful.  Anything unparseable returns `None`.
    """
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
    """Coerce provider `recommendation_signals` into our numeric dict.

    Drops anything non-numeric — we keep the dict tight so downstream
    consumers can iterate without per-key type guards.
    """
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
        # Fail loudly at construction time so a Railway deploy without
        # the secret can't silently serve a degraded experience.
        if not api_key or not api_key.strip():
            raise HautAIConfigError(
                "HAUT_AI_API_KEY is required when SKIN_ANALYSIS_PROVIDER=haut_ai. "
                "Set the key or switch to SKIN_ANALYSIS_PROVIDER=mock_haut."
            )
        # Guard against trivial cycles: a haut_ai → haut_ai fallback
        # would loop on every request-time failure.
        if fallback is not None and getattr(fallback, "name", None) == _PROVIDER_NAME:
            raise HautAIConfigError(
                "SKIN_ANALYSIS_FALLBACK_PROVIDER must be one of {local, mock_haut}; "
                "got 'haut_ai' which would create a recursive fallback loop."
            )
        self._api_key = api_key.strip()
        self._base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_seconds)
        self._fallback = fallback

    # ── Public entry point ───────────────────────────────────────────

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
            # Config errors must never trigger a fallback — they are a
            # deployment bug, and silently rerouting to mock_haut here
            # would hide the misconfiguration.
            if isinstance(exc, HautAIConfigError) or self._fallback is None:
                raise
            return self._run_fallback(front, left, right, exc)

    # ── Build ────────────────────────────────────────────────────────

    def _build_request_payload(
        self,
        front: bytes,
        left: Optional[bytes] = None,
        right: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        """Compose the outbound JSON body.

        Today we send `front` plus any provided side photos under a
        generic `images: [{ pose, content_base64 }]` array — keeps the
        method ready for multi-image once the real endpoint supports
        it.  When the official Haut.AI contract lands, only the field
        names and the list shape change; the rest of the provider
        keeps working.
        """
        images: List[Dict[str, str]] = [
            {"pose": "front", "content_base64": _b64(front)}
        ]
        if left is not None:
            images.append({"pose": "left", "content_base64": _b64(left)})
        if right is not None:
            images.append({"pose": "right", "content_base64": _b64(right)})
        return {_IMAGES_FIELD: images}

    # ── Send ─────────────────────────────────────────────────────────

    async def _send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """The only place the network is touched.

        Classifies every failure mode into a `HautAIError` subclass so
        the public `analyze()` can decide whether to fall back or
        propagate.  `httpx.HTTPStatusError` / network errors are caught
        here on purpose — surfacing raw httpx exceptions to callers
        would leak provider internals.
        """
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

    # ── Normalize ────────────────────────────────────────────────────

    def _normalize_response(
        self,
        raw: Dict[str, Any],
        images_received: int,
    ) -> NormalizedSkinAnalysisResult:
        """Project the vendor payload onto `NormalizedSkinAnalysisResult`.

        Tolerant by design: every metric is treated as optional, and
        anything we can't parse falls back to the schema defaults.
        This is the second of the two methods we expect to revisit
        once we see real responses — the structure of the rest of the
        provider should stay stable.
        """
        # Defensive against vendors that wrap their actual payload in
        # a generic envelope (e.g. `{"result": {...}, ...}`).
        if "result" in raw and isinstance(raw["result"], dict):
            metrics_source: Dict[str, Any] = dict(raw.get("result", {}))
        else:
            metrics_source = raw
        if "metrics" in metrics_source and isinstance(metrics_source["metrics"], dict):
            metrics: Dict[str, Any] = metrics_source["metrics"]
        else:
            metrics = metrics_source

        # Pull each measured metric, recording which ones were actually
        # present so we can audit later without storing the full body.
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
            pores_score = 0.4  # neutral default — see schema rationale

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
        # Drop None entries so `raw_summary` stays compact — readers
        # treat missing keys and `None` keys identically anyway.
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

    # ── Fallback ─────────────────────────────────────────────────────

    def _run_fallback(
        self,
        front: bytes,
        left: Optional[bytes],
        right: Optional[bytes],
        original_error: HautAIError,
    ) -> NormalizedSkinAnalysisResult:
        """Run the configured fallback provider and tag the result.

        We log the short safe message (not the API key, not the raw
        provider payload) so operators see *why* the fallback kicked
        in, and we annotate `raw_summary` on the returned result so
        the persistence layer captures the same audit trail.
        """
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
