"""Skin analysis providers.

A `SkinAnalysisProvider` is the outermost extension point for the
analysis pipeline — local heuristic today, mock / real Haut.AI later.
The `services/analysis_service.py` layer should only ever know about
the abstract interface, never the concrete provider.
"""
from app.ai.providers.base import SkinAnalysisProvider
from app.ai.providers.factory import get_skin_analysis_provider
from app.ai.providers.local import LocalHeuristicProvider
from app.ai.providers.mock_haut import MockHautAIProvider

__all__ = [
    "SkinAnalysisProvider",
    "LocalHeuristicProvider",
    "MockHautAIProvider",
    "get_skin_analysis_provider",
]
