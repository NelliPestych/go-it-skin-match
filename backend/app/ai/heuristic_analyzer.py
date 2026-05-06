"""Heuristic skin analyzer.

Implements the SkinAnalyzer interface using classical computer vision
features extracted with OpenCV/NumPy. It is intentionally NOT a trained
model — the goal is to provide deterministic, explainable signals while
the architecture (interface + pipeline) is ready to swap in a real CNN.

Heuristics:
- redness: mean of the red channel relative to green/blue in HSV-masked
  regions; high red & saturation suggests redness.
- hydration: inverted standard deviation in the L channel of LAB —
  more uniform brightness implies better hydration in this proxy.
- pigmentation: variance of the A* channel in LAB; uneven A* is a
  proxy for hyperpigmentation.
- pores_score: ratio of bright spots after Laplacian/blackhat morphology,
  approximating texture irregularity.
- skin_type: combines mean saturation/V channel + redness/hydration to
  bucket dry / oily / combination / normal.
- confidence_score: bounded by image quality (sharpness via Laplacian
  variance) and face-region detection success.
"""
from __future__ import annotations

import io
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


def _bucket(value: float, low: float, high: float) -> Level:
    if value < low:
        return Level.LOW
    if value < high:
        return Level.MEDIUM
    return Level.HIGH


class HeuristicSkinAnalyzer(SkinAnalyzer):
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

        # --- Redness (BGR + HSV) --------------------------------------------
        b, g, r = cv2.split(roi)
        redness_raw = float(np.mean(r.astype(np.float32) - 0.5 * (g + b).astype(np.float32)))
        redness_norm = float(np.clip(redness_raw / 40.0, 0.0, 1.0))
        redness_level = _bucket(redness_norm, 0.25, 0.55)

        # --- Hydration proxy: smoothness of L* channel ----------------------
        lab = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, _ = cv2.split(lab)
        l_std = float(np.std(l_channel))
        hydration_norm = float(np.clip(1.0 - (l_std / 60.0), 0.0, 1.0))
        hydration_level = _bucket(hydration_norm, 0.35, 0.65)

        # --- Pigmentation: variance of A* channel ---------------------------
        a_var = float(np.var(a_channel.astype(np.float32)))
        pigmentation_norm = float(np.clip(a_var / 250.0, 0.0, 1.0))
        pigmentation_level = _bucket(pigmentation_norm, 0.3, 0.6)

        # --- Pores: blackhat morphology + thresholding ----------------------
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
        blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel)
        pores_score = float(np.clip(np.mean(blackhat) / 12.0, 0.0, 1.0))

        # --- Skin type classification --------------------------------------
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        _, s_channel, v_channel = cv2.split(hsv)
        oiliness = float(np.clip(np.mean(v_channel) / 255.0, 0.0, 1.0))
        sat_mean = float(np.clip(np.mean(s_channel) / 255.0, 0.0, 1.0))

        if oiliness > 0.65 and hydration_norm < 0.5:
            skin_type = SkinType.OILY
        elif hydration_norm < 0.35:
            skin_type = SkinType.DRY
        elif 0.45 <= oiliness <= 0.7 and abs(sat_mean - 0.4) < 0.15:
            skin_type = SkinType.COMBINATION
        else:
            skin_type = SkinType.NORMAL

        # --- Confidence: sharpness + face detection ------------------------
        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        sharp_norm = float(np.clip(sharpness / 800.0, 0.0, 1.0))
        confidence = 0.6 * sharp_norm + (0.4 if face_found else 0.1)
        confidence = float(np.clip(confidence, 0.0, 1.0))

        return SkinFeatures(
            skin_type=skin_type,
            redness_level=redness_level,
            hydration_level=hydration_level,
            pigmentation_level=pigmentation_level,
            pores_score=round(pores_score, 3),
            confidence_score=round(confidence, 3),
        )
