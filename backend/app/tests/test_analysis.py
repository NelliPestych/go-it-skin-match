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


def test_multi_image_upload_stores_all_three_paths(client):
    """Smart Camera 3-shot path: every supplied frame is persisted
    and surfaced in the response, and `image_path` mirrors the front
    photo for backward compat with downstream readers."""
    front = _synthetic_image(color=(180, 150, 140))
    left = _synthetic_image(color=(170, 145, 135))
    right = _synthetic_image(color=(175, 148, 138))
    response = client.post(
        "/analysis/upload",
        files={
            "front": ("front.jpg", front, "image/jpeg"),
            "left": ("left.jpg", left, "image/jpeg"),
            "right": ("right.jpg", right, "image/jpeg"),
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["image_front_path"], "front path must be set"
    assert payload["image_left_path"], "left path must be set"
    assert payload["image_right_path"], "right path must be set"
    # All three paths must point to distinct files on disk.
    assert len({
        payload["image_front_path"],
        payload["image_left_path"],
        payload["image_right_path"],
    }) == 3
    # `image_path` mirrors the front frame for backward compat.
    assert payload["image_path"] == payload["image_front_path"]


def test_multi_image_upload_front_only(client):
    """Left / right are optional; sending only `front` still
    succeeds and leaves the side paths null."""
    front = _synthetic_image()
    response = client.post(
        "/analysis/upload",
        files={"front": ("front.jpg", front, "image/jpeg")},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["image_front_path"]
    assert payload["image_left_path"] is None
    assert payload["image_right_path"] is None
    assert payload["image_path"] == payload["image_front_path"]


def test_legacy_single_image_leaves_pose_paths_null(client):
    """Old `file=...` callers don't get pose-tagged columns set."""
    image = _synthetic_image()
    response = client.post(
        "/analysis/upload",
        files={"file": ("face.jpg", image, "image/jpeg")},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["image_path"]
    assert payload["image_front_path"] is None
    assert payload["image_left_path"] is None
    assert payload["image_right_path"] is None


def test_upload_without_any_image_is_rejected(client):
    """Posting neither `file` nor `front` returns 400 with a
    helpful message instead of an opaque 422."""
    response = client.post("/analysis/upload", files={})
    assert response.status_code == 400, response.text
    assert "front" in response.json()["detail"].lower()


def test_multi_image_upload_validates_each_frame(client):
    """A bad left frame poisons the whole request — we surface the
    415 from the per-frame validator instead of silently dropping
    the malformed photo."""
    front = _synthetic_image()
    response = client.post(
        "/analysis/upload",
        files={
            "front": ("front.jpg", front, "image/jpeg"),
            "left": ("left.txt", b"not an image", "text/plain"),
        },
    )
    assert response.status_code == 415


def test_multi_image_upload_persists_to_database(client, db_engine):
    """End-to-end check: the SkinScan row created by the multi-image
    upload actually carries the three pose paths in the database
    (not just in the response payload)."""
    from sqlalchemy.orm import sessionmaker

    front = _synthetic_image()
    left = _synthetic_image(color=(170, 145, 135))
    right = _synthetic_image(color=(175, 148, 138))
    response = client.post(
        "/analysis/upload",
        files={
            "front": ("front.jpg", front, "image/jpeg"),
            "left": ("left.jpg", left, "image/jpeg"),
            "right": ("right.jpg", right, "image/jpeg"),
        },
    )
    assert response.status_code == 200, response.text
    analysis_id = response.json()["analysis_id"]

    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)
    db = Session()
    try:
        from app.models.skin_scan import SkinScan

        scan = db.get(SkinScan, analysis_id)
        assert scan is not None
        assert scan.image_front_path is not None
        assert scan.image_left_path is not None
        assert scan.image_right_path is not None
        assert scan.image_path == scan.image_front_path
    finally:
        db.close()
