"""Provider factory keyed off SKIN_ANALYSIS_PROVIDER; cached singleton.

Enforces: required key per provider, fallback restricted to local|mock_haut,
unknown provider name → ValueError (no silent degrade).
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
    """Resolve fallback or None. Refuses remote providers + unknown names."""
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
    name = (settings.skin_analysis_provider or "local").lower()
    if name == "local":
        return LocalHeuristicProvider()
    if name == "mock_haut":
        return MockHautAIProvider()
    if name == "haut_ai":
        return HautAIProvider(
            api_key=settings.haut_ai_api_key,
            base_url=settings.haut_ai_base_url,
            timeout_seconds=settings.haut_ai_timeout_seconds,
            fallback=_build_fallback(),
        )
    if name == "openai_vision":
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
