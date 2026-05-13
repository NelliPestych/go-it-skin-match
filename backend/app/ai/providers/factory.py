"""Provider factory.

Reads `SKIN_ANALYSIS_PROVIDER` from settings and returns the matching
provider instance.  Cached per-process — providers are stateless
after construction, so a single shared instance is cheaper than a
fresh one per request.

`mock_haut` and `haut_ai` are intentionally NOT registered yet — the
factory raises a loud `ValueError` for any unknown name so a typo in
the env doesn't silently fall back to `local`.
"""
from __future__ import annotations

from functools import lru_cache

from app.ai.providers.base import SkinAnalysisProvider
from app.ai.providers.local import LocalHeuristicProvider
from app.core.config import settings


@lru_cache
def get_skin_analysis_provider() -> SkinAnalysisProvider:
    """Return the configured `SkinAnalysisProvider` singleton."""
    name = (settings.skin_analysis_provider or "local").lower()
    if name == "local":
        return LocalHeuristicProvider()
    raise ValueError(
        f"Unknown skin analysis provider: {name!r}. Expected one of: local."
    )
