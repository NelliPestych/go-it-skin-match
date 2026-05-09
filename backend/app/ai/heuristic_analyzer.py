"""Heuristic skin analyzer.

Implements the SkinAnalyzer interface with classical OpenCV/NumPy
signals — no trained model. The pipeline is deliberately layered:

  1. Decode → optional face crop (Haar cascade)
  2. Compute named raw signals from the ROI:
       - brightness   mean of the V channel        (0..1)
       - redness      R lift vs G/B                 (0..1)
       - contrast     normalized std of grayscale  (0..1)
       - saturation   mean of S channel             (0..1)
       - sharpness    Laplacian variance (capped)  (0..1)
  3. Map signals → six output features documented in
     `SkinFeatures`. Each mapping rule is single-purpose so the
     pipeline can be unit-tested deterministically.

The interface contract (`SkinAnalyzer.analyze(bytes) -> SkinFeatures`)
stays unchanged so the rest of the system never sees the swap when a
real CNN replaces this heuristic.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Tuple

import cv2
import numpy as np
from PIL import Image

from app.ai.base import SkinAnalyzer
from app.schemas.analysis import SkinFeatures
from app.schemas.common import Level, SkinType


_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


@dataclass(frozen=True)
class RawSignals:
    """Named, normalized 0..1 image signals."""

    brightness: float
    redness: float
    contrast: float
    saturation: float
    sharpness: float
    face_found: bool


def _decode_image(image_bytes: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    array = np.array(image)
    return cv2.cvtColor(array, cv2.COLOR_RGB2BGR)


def _detect_face_region(bgr: np.ndarray) -> Tuple[np.ndarray, bool]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    faces = _FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=4)
    if len(faces) == 0:
        return bgr, False
    x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
    pad = int(0.1 * max(w, h))
    x0 = max(x - pad, 0)
    y0 = max(y - pad, 0)
    x1 = min(x + w + pad, bgr.shape[1])
    y1 = min(y + h + pad, bgr.shape[0])
    return bgr[y0:y1, x0:x1], True


def _compute_signals(roi: np.ndarray, face_found: bool) -> RawSignals:
    """Compute the five named signals from a region of interest."""
    # --- brightness + saturation: HSV --------------------------------
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    _, s_channel, v_channel = cv2.split(hsv)
    brightness = float(np.mean(v_channel) / 255.0)
    saturation = float(np.mean(s_channel) / 255.0)

    # --- redness: R lift vs the average of G,B -----------------------
    b, g, r = cv2.split(roi)
    red_lift = float(np.mean(r.astype(np.float32) - 0.5 * (g + b).astype(np.float32)))
    redness = float(np.clip(red_lift / 40.0, 0.0, 1.0))

    # --- contrast: std of grayscale (proxy for texture) --------------
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    contrast = float(np.clip(np.std(gray) / 80.0, 0.0, 1.0))

    # --- sharpness: Laplacian variance, capped to 0..1 ---------------
    sharpness = float(np.clip(cv2.Laplacian(gray, cv2.CV_64F).var() / 800.0, 0.0, 1.0))

    return RawSignals(
        brightness=round(brightness, 3),
        redness=round(redness, 3),
        contrast=round(contrast, 3),
        saturation=round(saturation, 3),
        sharpness=round(sharpness, 3),
        face_found=face_found,
    )


def _bucket(value: float, low: float, high: float) -> Level:
    if value < low:
        return Level.LOW
    if value < high:
        return Level.MEDIUM
    return Level.HIGH


def _map_skin_type(signals: RawSignals) -> SkinType:
    """Translate brightness + saturation + contrast into a skin type."""
    # Oily: bright (shiny), low-to-mid texture variance
    if signals.brightness >= 0.6 and signals.contrast < 0.55:
        return SkinType.OILY
    # Dry: high texture variance + dim
    if signals.contrast >= 0.55 and signals.brightness < 0.55:
        return SkinType.DRY
    # Combination: in-between brightness with moderate saturation
    if 0.45 <= signals.brightness < 0.65 and 0.3 <= signals.saturation <= 0.55:
        return SkinType.COMBINATION
    return SkinType.NORMAL


def _map_pores_score(signals: RawSignals) -> float:
    """Pores grow with raw texture variance, dampen on dim images."""
    base = signals.contrast
    dim_penalty = 1.0 if signals.brightness > 0.25 else 0.6
    return float(np.clip(base * dim_penalty, 0.0, 1.0))


def _map_confidence(signals: RawSignals) -> float:
    """Confidence is driven by sharpness and whether a face was found."""
    confidence = 0.6 * signals.sharpness + (0.4 if signals.face_found else 0.1)
    return float(np.clip(confidence, 0.0, 1.0))


class HeuristicSkinAnalyzer(SkinAnalyzer):
    """Pure-OpenCV heuristic analyzer (MVP placeholder for a future CNN)."""

    MIN_SIZE = 64
    MAX_DIM = 1024

    def analyze(self, image_bytes: bytes) -> SkinFeatures:
        bgr = _decode_image(image_bytes)
        h, w = bgr.shape[:2]
        if h < self.MIN_SIZE or w < self.MIN_SIZE:
            raise ValueError("Image is too small for analysis (min 64×64).")

        scale = self.MAX_DIM / max(h, w)
        if scale < 1.0:
            bgr = cv2.resize(bgr, (int(w * scale), int(h * scale)))

        roi, face_found = _detect_face_region(bgr)
        signals = _compute_signals(roi, face_found)

        skin_type = _map_skin_type(signals)
        redness_level = _bucket(signals.redness, 0.25, 0.55)
        # Hydration is the inverse of contrast — smoother reads as
        # better hydrated for our heuristic proxy.
        hydration_score = 1.0 - signals.contrast
        hydration_level = _bucket(hydration_score, 0.35, 0.65)
        # Pigmentation tracks contrast in mid-tones; threshold is a touch
        # higher than pores so only stronger variance flags it.
        pigmentation_level = _bucket(signals.contrast, 0.4, 0.65)
        pores_score = round(_map_pores_score(signals), 3)
        confidence_score = round(_map_confidence(signals), 3)

        return SkinFeatures(
            skin_type=skin_type,
            redness_level=redness_level,
            hydration_level=hydration_level,
            pigmentation_level=pigmentation_level,
            pores_score=pores_score,
            confidence_score=confidence_score,
        )
