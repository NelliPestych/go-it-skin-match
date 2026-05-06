import io

import numpy as np
from PIL import Image

from app.ai.heuristic_analyzer import HeuristicSkinAnalyzer


def _synthetic_image(color=(180, 150, 140), size=256) -> bytes:
    arr = np.full((size, size, 3), color, dtype=np.uint8)
    # add a bit of noise so std-based heuristics produce non-trivial values
    noise = np.random.randint(-15, 15, arr.shape, dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def test_heuristic_analyzer_returns_features():
    analyzer = HeuristicSkinAnalyzer()
    features = analyzer.analyze(_synthetic_image())
    assert features.skin_type in {"dry", "oily", "combination", "normal"}
    assert features.redness_level in {"low", "medium", "high"}
    assert features.hydration_level in {"low", "medium", "high"}
    assert features.pigmentation_level in {"low", "medium", "high"}
    assert 0.0 <= features.pores_score <= 1.0
    assert 0.0 <= features.confidence_score <= 1.0


def test_heuristic_analyzer_rejects_tiny_image():
    arr = np.zeros((10, 10, 3), dtype=np.uint8)
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    try:
        HeuristicSkinAnalyzer().analyze(buf.getvalue())
    except ValueError as exc:
        assert "too small" in str(exc).lower()
    else:
        raise AssertionError("expected ValueError for tiny image")


def test_analysis_upload_endpoint(client):
    image_bytes = _synthetic_image()
    response = client.post(
        "/analysis/upload",
        files={"file": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "analysis_id" in payload
    assert "features" in payload
    feats = payload["features"]
    assert feats["skin_type"] in {"dry", "oily", "combination", "normal"}


def test_analysis_rejects_bad_content_type(client):
    response = client.post(
        "/analysis/upload",
        files={"file": ("file.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 415
