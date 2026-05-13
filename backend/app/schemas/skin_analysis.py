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
from typing import Any, Dict, Mapping, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.analysis import SkinFeatures
from app.schemas.common import Level, SkinType


_LEGACY_PROVIDER_LABEL = "legacy"


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


class AIMetrics(BaseModel):
    """Extended AI signals exposed via `/analysis/{id}/details`.

    Distinct from `SkinFeatures` (legacy 6-field shape) and from
    `NormalizedSkinAnalysisResult` (full provider output): this is a
    *view* on what's in `features_json` that's safe to send over the
    wire for any scan — old or new.

    Every metric beyond `provider` + `confidence_score` is optional
    so a scan persisted *before* the provider abstraction landed
    (only the 6 legacy `SkinFeatures` keys in `features_json`) still
    round-trips through the details endpoint without errors.  The
    sentinel `provider == "legacy"` lets the frontend label such
    results clearly if it wants to.
    """

    model_config = ConfigDict()

    provider: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    oiliness: Optional[Level] = None
    acne: Optional[Level] = None
    fine_lines: Optional[Level] = None
    texture: Optional[Level] = None
    recommendation_signals: Optional[Dict[str, float]] = None
    analyzed_at: Optional[datetime] = None

    @classmethod
    def from_features_json(cls, features_json: Optional[Mapping[str, Any]]) -> "AIMetrics":
        """Build an `AIMetrics` view from a `SkinScan.features_json` dict.

        Tolerant by design: missing keys are emitted as `None`, no
        validation errors on the legacy shape.  `provider` defaults
        to the `"legacy"` sentinel when absent.
        """
        features = features_json or {}
        return cls(
            provider=str(features.get("provider") or _LEGACY_PROVIDER_LABEL),
            # `confidence_score` exists on both legacy and new shapes;
            # default 0.0 only fires if the column was hand-seeded
            # without it (defensive — should not happen in prod).
            confidence_score=float(features.get("confidence_score", 0.0)),
            oiliness=features.get("oiliness"),
            acne=features.get("acne"),
            fine_lines=features.get("fine_lines"),
            texture=features.get("texture"),
            recommendation_signals=features.get("recommendation_signals"),
            analyzed_at=features.get("analyzed_at"),
        )
