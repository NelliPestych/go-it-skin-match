"""Local heuristic provider — wraps HeuristicSkinAnalyzer behind SkinAnalysisProvider."""
from __future__ import annotations

from typing import Optional

from app.ai.base import SkinAnalyzer
from app.ai.pipeline import get_analyzer
from app.ai.providers.base import SkinAnalysisProvider
from app.schemas.common import Level, SkinType
from app.schemas.skin_analysis import NormalizedSkinAnalysisResult


def _oiliness_from_skin_type(skin_type: SkinType) -> Level:
    """Derive an oiliness Level from the categorical skin type."""
    if skin_type == SkinType.OILY:
        return Level.HIGH
    if skin_type == SkinType.DRY:
        return Level.LOW
    return Level.MEDIUM


def _texture_from_pores(pores_score: float) -> Level:
    """Reuse pores_score as a proxy for texture roughness."""
    if pores_score < 0.35:
        return Level.LOW
    if pores_score < 0.65:
        return Level.MEDIUM
    return Level.HIGH


class LocalHeuristicProvider(SkinAnalysisProvider):
    name = "local"

    def __init__(self, analyzer: Optional[SkinAnalyzer] = None) -> None:
        self.analyzer = analyzer or get_analyzer()

    def analyze(
        self,
        front: bytes,
        left: Optional[bytes] = None,
        right: Optional[bytes] = None,
    ) -> NormalizedSkinAnalysisResult:
        # Heuristic consumes only the front shot; sides persisted upstream.
        features = self.analyzer.analyze(front)

        return NormalizedSkinAnalysisResult(
            skin_type=features.skin_type,
            redness_level=features.redness_level,
            hydration_level=features.hydration_level,
            pigmentation_level=features.pigmentation_level,
            pores_score=features.pores_score,
            confidence_score=features.confidence_score,
            oiliness=_oiliness_from_skin_type(features.skin_type),
            # No heuristic signal for acne or fine_lines — default LOW so the rec engine doesn't over-correct.
            acne=Level.LOW,
            fine_lines=Level.LOW,
            texture=_texture_from_pores(features.pores_score),
            provider=self.name,
        )
