"""Provider factory.

Reads `SKIN_ANALYSIS_PROVIDER` from settings and returns the matching
provider instance.  Cached per-process — providers are stateless
after construction, so a single shared instance is cheaper than a
fresh one per request.

The factory enforces three safety properties shared by every primary
provider:

  * the provider-specific API key must be present when that provider
    is selected — a missing key raises the provider's `…ConfigError`
    at construction time so a Railway deploy without the secret
    fails loudly,
  * the optional `SKIN_ANALYSIS_FALLBACK_PROVIDER` is restricted to
    `local` or `mock_haut` — never a remote provider, never a
    recursive chain.  An invalid name raises `ValueError` at startup,
  * an unknown `SKIN_ANALYSIS_PROVIDER` value also raises `ValueError`
    rather than silently degrading to `local`.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from app.ai.providers.base import SkinAnalysisProvider
from app.ai.providers.haut_ai import HautAIProvider
from app.ai.providers.local import LocalHeuristicProvider
from app.ai.providers.mock_haut import MockHautAIProvider
from app.ai.providers.openai_vision import OpenAIVisionProvider
from app.core.config import settings


_SUPPORTED_PROVIDERS = ("local", "mock_haut", "haut_ai", "openai_vision")
_VALID_FALLBACKS = ("local", "mock_haut")


def _build_fallback() -> Optional[SkinAnalysisProvider]:
    """Resolve the configured fallback provider, or `None`.

    Refuses any remote provider as a fallback (would loop) and any
    unknown name (would mask a typo).  Both cases raise a clear
    `ValueError` so misconfiguration surfaces during startup.
    """
    name = (settings.skin_analysis_fallback_provider or "").strip().lower()
    if not name:
        return None
    if name not in _VALID_FALLBACKS:
        raise ValueError(
            f"Invalid SKIN_ANALYSIS_FALLBACK_PROVIDER={name!r}. "
            f"Expected one of: {', '.join(_VALID_FALLBACKS)} "
            "(haut_ai is not allowed to avoid recursive fallback; "
            "openai_vision is similarly rejected for the same reason)."
        )
    if name == "local":
        return LocalHeuristicProvider()
    return MockHautAIProvider()


@lru_cache
def get_skin_analysis_provider() -> SkinAnalysisProvider:
    """Return the configured `SkinAnalysisProvider` singleton."""
    name = (settings.skin_analysis_provider or "local").lower()
    if name == "local":
        return LocalHeuristicProvider()
    if name == "mock_haut":
        return MockHautAIProvider()
    if name == "haut_ai":
        # `HautAIProvider.__init__` raises `HautAIConfigError` if the
        # key is missing — re-raised here unchanged so a deploy-time
        # misconfig fails loudly at first call.
        return HautAIProvider(
            api_key=settings.haut_ai_api_key,
            base_url=settings.haut_ai_base_url,
            timeout_seconds=settings.haut_ai_timeout_seconds,
            fallback=_build_fallback(),
        )
    if name == "openai_vision":
        # `OpenAIVisionProvider.__init__` raises `OpenAIVisionConfigError`
        # if the key is missing or the SDK is not installed — re-raised
        # unchanged for the same loud-fail reasons.
        return OpenAIVisionProvider(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            timeout_seconds=settings.openai_timeout_seconds,
            fallback=_build_fallback(),
        )
    raise ValueError(
        f"Unknown skin analysis provider: {name!r}. "
        f"Expected one of: {', '.join(_SUPPORTED_PROVIDERS)}."
    )
