"""Local heuristic provider.

Wraps the existing `HeuristicSkinAnalyzer` so the rest of the system
can speak the new `SkinAnalysisProvider` vocabulary without losing
the heuristic-pure code path.

The new normalized fields that the heuristic doesn't natively measure
(`acne`, `fine_lines`) get conservative defaults (`Level.LOW`) so the
recommendation engine doesn't over-correct on fabricated data.  They
become real signals only when a richer provider (Haut.AI) lands.

`oiliness` and `texture` are derived from existing heuristic outputs
(skin_type and pores_score, respectively) — both already encode the
information we need, just under different names.
"""
from __future__ import annotations

from typing import Optional

from app.ai.base import SkinAnalyzer
from app.ai.pipeline import get_analyzer
from app.ai.providers.base import SkinAnalysisProvider
from app.schemas.common import Level, SkinType
from app.schemas.skin_analysis import NormalizedSkinAnalysisResult


def _oiliness_from_skin_type(skin_type: SkinType) -> Level:
    """Derive an oiliness Level from the categorical skin type.

    The heuristic doesn't compute oiliness as a continuous metric, but
    `skin_type` is itself driven by brightness + low-contrast (i.e.
    "shiny + smooth") so the type → level mapping is informative
    enough for downstream consumers that prefer a uniform Level
    vocabulary.
    """
    if skin_type == SkinType.OILY:
        return Level.HIGH
    if skin_type == SkinType.DRY:
        return Level.LOW
    return Level.MEDIUM


def _texture_from_pores(pores_score: float) -> Level:
    """Reuse `pores_score` as a proxy for texture roughness.

    The same contrast signal that flags visible pores also flags
    uneven texture for the heuristic.  Tier thresholds picked to
    match the `_bucket` cutoffs used elsewhere in the heuristic
    mapping, so the result is consistent with `pigmentation_level`
    when contrast is high.
    """
    if pores_score < 0.35:
        return Level.LOW
    if pores_score < 0.65:
        return Level.MEDIUM
    return Level.HIGH


class LocalHeuristicProvider(SkinAnalysisProvider):
    """Wrap `HeuristicSkinAnalyzer` in the provider interface."""

    name = "local"

    def __init__(self, analyzer: Optional[SkinAnalyzer] = None) -> None:
        # Allow tests to inject a stub analyzer; default to the
        # configured one (heuristic today, ONNX-runtime later).
        self.analyzer = analyzer or get_analyzer()

    def analyze(
        self,
        front: bytes,
        left: Optional[bytes] = None,
        right: Optional[bytes] = None,
    ) -> NormalizedSkinAnalysisResult:
        # The heuristic only consumes the front shot.  Side images
        # are persisted by the service layer for future multi-angle
        # pipelines — this provider deliberately drops them.
        features = self.analyzer.analyze(front)

        return NormalizedSkinAnalysisResult(
            skin_type=features.skin_type,
            redness_level=features.redness_level,
            hydration_level=features.hydration_level,
            pigmentation_level=features.pigmentation_level,
            pores_score=features.pores_score,
            confidence_score=features.confidence_score,
            oiliness=_oiliness_from_skin_type(features.skin_type),
            # No heuristic signal for acne or fine lines yet —
            # default LOW so the rec engine doesn't push acne-safe
            # or anti-aging products based on a fabricated metric.
            acne=Level.LOW,
            fine_lines=Level.LOW,
            texture=_texture_from_pores(features.pores_score),
            provider=self.name,
        )
