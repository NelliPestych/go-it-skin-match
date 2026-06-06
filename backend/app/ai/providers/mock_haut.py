"""Deterministic image-hash-seeded mock for Haut.AI — same bytes always produce same result."""
from __future__ import annotations

import hashlib
import random
from typing import Optional, Tuple

from app.ai.providers.base import SkinAnalysisProvider
from app.schemas.common import Level, SkinType
from app.schemas.skin_analysis import NormalizedSkinAnalysisResult


_SKIN_TYPE_PRIORS: Tuple[Tuple[SkinType, float], ...] = (
    (SkinType.NORMAL, 0.30),
    (SkinType.COMBINATION, 0.35),
    (SkinType.OILY, 0.20),
    (SkinType.DRY, 0.15),
)


def _seed_from_image(image_bytes: bytes) -> int:
    """Stable 64-bit seed from the image's SHA-256 digest."""
    digest = hashlib.sha256(image_bytes).hexdigest()
    return int(digest[:16], 16)


def _pick_level(rng: random.Random, weights: Tuple[float, float, float] = (0.25, 0.50, 0.25)) -> Level:
    return rng.choices(
        [Level.LOW, Level.MEDIUM, Level.HIGH],
        weights=list(weights),
    )[0]


def _pick_skin_type(rng: random.Random) -> SkinType:
    types, weights = zip(*_SKIN_TYPE_PRIORS)
    return rng.choices(list(types), weights=list(weights))[0]


class MockHautAIProvider(SkinAnalysisProvider):
    name = "mock_haut"
    PROVIDER_VERSION = "mock-haut-1.0"

    def analyze(
        self,
        front: bytes,
        left: Optional[bytes] = None,
        right: Optional[bytes] = None,
    ) -> NormalizedSkinAnalysisResult:
        seed = _seed_from_image(front)
        rng = random.Random(seed)

        skin_type = _pick_skin_type(rng)

        # Coupled distributions — mimic real-provider correlations.
        hydration_weights = (0.55, 0.35, 0.10) if skin_type == SkinType.DRY else (0.20, 0.50, 0.30)
        hydration_level = _pick_level(rng, weights=hydration_weights)

        pores_center = 0.55 if skin_type == SkinType.OILY else 0.35
        pores_score = round(
            max(0.0, min(1.0, rng.uniform(pores_center - 0.15, pores_center + 0.25))),
            3,
        )

        redness_level = _pick_level(rng)
        pigmentation_level = _pick_level(rng)
        texture_level = _pick_level(rng)
        acne_level = _pick_level(rng, weights=(0.60, 0.30, 0.10))
        fine_lines_level = _pick_level(rng, weights=(0.55, 0.35, 0.10))

        if skin_type == SkinType.OILY:
            oiliness_level = Level.HIGH
        elif skin_type == SkinType.DRY:
            oiliness_level = Level.LOW
        else:
            oiliness_level = _pick_level(rng)

        # Demo-credible confidence band.
        confidence_score = round(rng.uniform(0.78, 0.96), 3)

        signals = {
            "acne_severity_raw": round(
                rng.uniform(0.0, 0.7 if acne_level == Level.HIGH else 0.35),
                3,
            ),
            "uv_damage_score": round(rng.uniform(0.10, 0.55), 3),
            "skin_age_estimate": round(rng.uniform(22.0, 48.0), 1),
            "dark_circles_score": round(rng.uniform(0.10, 0.60), 3),
            "skin_health_score": round(rng.uniform(0.55, 0.92), 3),
        }

        raw_summary = {
            "mock_seed": f"{seed:016x}",
            "provider_version": self.PROVIDER_VERSION,
            "images_received": 1 + (left is not None) + (right is not None),
        }

        return NormalizedSkinAnalysisResult(
            skin_type=skin_type,
            redness_level=redness_level,
            hydration_level=hydration_level,
            pigmentation_level=pigmentation_level,
            pores_score=pores_score,
            confidence_score=confidence_score,
            oiliness=oiliness_level,
            acne=acne_level,
            fine_lines=fine_lines_level,
            texture=texture_level,
            recommendation_signals=signals,
            raw_summary=raw_summary,
            provider=self.name,
        )
