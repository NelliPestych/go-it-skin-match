"""Normalized skin analysis result.

This is the **provider-agnostic** shape every `SkinAnalysisProvider`
returns.  It is a *superset* of the legacy `SkinFeatures` schema, so
the existing recommendation / plan / endpoint flow keeps working
without changes — those readers tug at `skin_type`, `redness_level`,
etc. by name; new fields are simply ignored downstream until they're
wired into the scoring engine in a later phase.

Design choices:

* `Level` enum everywhere for metrics that aren't naturally continuous
  — one shared vocabulary across the frontend, the rules engine and
  the persisted JSON.
* `pores_score` stays a `float` (0..1) for backward compat with the
  current `SkinFeatures.pores_score`; everything else in the new
  block is a `Level`.
* The four new metrics (`oiliness`, `acne`, `fine_lines`, `texture`)
  are non-optional with conservative defaults — providers that don't
  measure them set a sensible level rather than `None`, which avoids
  `None`-handling sprawl in downstream code.
* `recommendation_signals` is a small dict for provider-specific
  hints (e.g. `acne_severity_raw`, `uv_damage_score`) that don't map
  cleanly to the canonical metrics yet.
* `raw_summary` is intentionally tiny — just enough to debug a
  provider response, NOT a full raw dump.  We keep `features_json`
  lean so the column doesn't bloat per scan.
* `provider` + `analyzed_at` are persisted for auditability: which
  provider produced which result, and when.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.analysis import SkinFeatures
from app.schemas.common import Level, SkinType


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class NormalizedSkinAnalysisResult(BaseModel):
    """Provider-agnostic skin analysis output.

    All providers (local heuristic today, mock / real Haut.AI later)
    must return this shape.  The legacy `SkinFeatures` model is a
    strict subset, accessible via `to_skin_features()` for the public
    HTTP response.
    """

    model_config = ConfigDict()

    # ── Legacy fields (identical names + types as `SkinFeatures`) ────
    skin_type: SkinType
    redness_level: Level
    hydration_level: Level
    pigmentation_level: Level
    pores_score: float = Field(ge=0.0, le=1.0)
    confidence_score: float = Field(ge=0.0, le=1.0)

    # ── New provider-agnostic metrics ────────────────────────────────
    # Defaults are deliberately neutral / conservative so a provider
    # that *doesn't* measure a given metric doesn't accidentally bias
    # downstream scoring (e.g. fabricated "high acne" would push the
    # rec engine toward acne-safe products on every scan).
    oiliness: Level = Level.MEDIUM
    acne: Level = Level.LOW
    fine_lines: Level = Level.LOW
    texture: Level = Level.MEDIUM

    # ── Provider-specific extras (kept small on purpose) ─────────────
    recommendation_signals: Dict[str, float] = Field(default_factory=dict)
    raw_summary: Optional[Dict[str, Any]] = None

    # ── Auditability ─────────────────────────────────────────────────
    provider: str
    analyzed_at: datetime = Field(default_factory=_utcnow)

    def to_skin_features(self) -> SkinFeatures:
        """Project to the legacy `SkinFeatures` shape.

        The HTTP contract (`AnalysisCreateResponse.features`) stays
        on the legacy shape, so the frontend keeps working without
        any redesign.  The richer normalized result lives in
        `features_json` for the rec / plan engines to consume later.
        """
        return SkinFeatures(
            skin_type=self.skin_type,
            redness_level=self.redness_level,
            hydration_level=self.hydration_level,
            pigmentation_level=self.pigmentation_level,
            pores_score=self.pores_score,
            confidence_score=self.confidence_score,
        )
