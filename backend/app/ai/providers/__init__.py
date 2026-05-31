"""Skin analysis providers.

A `SkinAnalysisProvider` is the outermost extension point for the
analysis pipeline — local heuristic, the deterministic mock, or the
real Haut.AI HTTP provider.  The `services/analysis_service.py` layer
should only ever know about the abstract interface, never the
concrete provider.
"""
from app.ai.providers.base import SkinAnalysisProvider
from app.ai.providers.factory import get_skin_analysis_provider
from app.ai.providers.haut_ai import (
    HautAIAuthError,
    HautAIConfigError,
    HautAIError,
    HautAIProvider,
    HautAIRequestError,
    HautAIServerError,
)
from app.ai.providers.local import LocalHeuristicProvider
from app.ai.providers.mock_haut import MockHautAIProvider
from app.ai.providers.openai_vision import (
    OpenAIVisionAuthError,
    OpenAIVisionConfigError,
    OpenAIVisionError,
    OpenAIVisionProvider,
    OpenAIVisionRequestError,
    OpenAIVisionServerError,
)

__all__ = [
    "SkinAnalysisProvider",
    "LocalHeuristicProvider",
    "MockHautAIProvider",
    "HautAIProvider",
    "HautAIError",
    "HautAIConfigError",
    "HautAIAuthError",
    "HautAIRequestError",
    "HautAIServerError",
    "OpenAIVisionProvider",
    "OpenAIVisionError",
    "OpenAIVisionConfigError",
    "OpenAIVisionAuthError",
    "OpenAIVisionRequestError",
    "OpenAIVisionServerError",
    "get_skin_analysis_provider",
]
