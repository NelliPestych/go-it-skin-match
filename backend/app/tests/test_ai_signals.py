"""Tests for the heuristic AI signals + feature mapping."""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

from app.ai.heuristic_analyzer import (
    HeuristicSkinAnalyzer,
    RawSignals,
    _bucket,
    _compute_signals,
    _map_confidence,
    _map_pores_score,
    _map_skin_type,
)
from app.schemas.common import Level, SkinType


def _img(color, size=128) -> np.ndarray:
    """Build a BGR ndarray of the given solid colour with a hint of noise."""
    bgr = np.full((size, size, 3), (color[2], color[1], color[0]), dtype=np.uint8)
    noise = np.random.randint(-5, 5, bgr.shape, dtype=np.int16)
    return np.clip(bgr.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def _img_bytes(color=(180, 150, 140), size=256) -> bytes:
    arr = np.full((size, size, 3), color, dtype=np.uint8)
    noise = np.random.randint(-15, 15, arr.shape, dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def test_compute_signals_returns_normalized_values():
    roi = _img((180, 150, 140), 256)
    signals = _compute_signals(roi, face_found=False)
    for value in [signals.brightness, signals.redness, signals.contrast, signals.saturation, signals.sharpness]:
        assert 0.0 <= value <= 1.0
    assert signals.face_found is False


def test_redness_signal_increases_with_red_channel():
    low = _compute_signals(_img((100, 100, 100)), face_found=False).redness
    mid = _compute_signals(_img((150, 100, 100)), face_found=False).redness
    high = _compute_signals(_img((220, 80, 80)), face_found=False).redness
    assert low <= mid <= high


def test_brightness_signal_increases_with_light_image():
    dark = _compute_signals(_img((30, 30, 30)), face_found=False).brightness
    bright = _compute_signals(_img((230, 230, 230)), face_found=False).brightness
    assert bright > dark


def test_contrast_signal_grows_with_texture():
    flat = _compute_signals(np.full((128, 128, 3), 128, dtype=np.uint8), face_found=False).contrast
    noisy = _compute_signals(
        np.random.randint(0, 256, (128, 128, 3), dtype=np.uint8), face_found=False
    ).contrast
    assert noisy > flat


def test_bucket_thresholds():
    assert _bucket(0.1, 0.3, 0.6) == Level.LOW
    assert _bucket(0.45, 0.3, 0.6) == Level.MEDIUM
    assert _bucket(0.8, 0.3, 0.6) == Level.HIGH


def test_map_skin_type_oily_when_bright_and_smooth():
    s = RawSignals(brightness=0.8, redness=0.2, contrast=0.3, saturation=0.4, sharpness=0.5, face_found=True)
    assert _map_skin_type(s) == SkinType.OILY


def test_map_skin_type_dry_when_dim_and_textured():
    s = RawSignals(brightness=0.4, redness=0.2, contrast=0.7, saturation=0.3, sharpness=0.5, face_found=True)
    assert _map_skin_type(s) == SkinType.DRY


def test_map_pores_and_confidence_in_unit_range():
    s = RawSignals(brightness=0.5, redness=0.5, contrast=0.5, saturation=0.5, sharpness=0.5, face_found=True)
    assert 0.0 <= _map_pores_score(s) <= 1.0
    assert 0.0 <= _map_confidence(s) <= 1.0


def test_analyzer_output_shape():
    """End-to-end: feeding a synthetic image returns a valid SkinFeatures."""
    analyzer = HeuristicSkinAnalyzer()
    features = analyzer.analyze(_img_bytes())
    assert features.skin_type in {SkinType.DRY, SkinType.OILY, SkinType.COMBINATION, SkinType.NORMAL}
    for level in (features.redness_level, features.hydration_level, features.pigmentation_level):
        assert level in {Level.LOW, Level.MEDIUM, Level.HIGH}
    assert 0.0 <= features.pores_score <= 1.0
    assert 0.0 <= features.confidence_score <= 1.0
