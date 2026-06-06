"""Tests for the history + details endpoints and full-flow persistence."""
from __future__ import annotations

import io

import numpy as np
from PIL import Image


def _synthetic_image(color=(180, 150, 140), size=256) -> bytes:
    arr = np.full((size, size, 3), color, dtype=np.uint8)
    noise = np.random.randint(-15, 15, arr.shape, dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _full_flow(client) -> int:
    upload = client.post(
        "/analysis/upload",
        files={"file": ("face.jpg", _synthetic_image(), "image/jpeg")},
    )
    assert upload.status_code == 200, upload.text
    analysis_id = upload.json()["analysis_id"]

    quiz = client.post(
        "/quiz/submit",
        json={
            "analysis_id": analysis_id,
            "self_reported_skin_type": "combination",
            "concerns": ["hydration", "redness"],
            "sensitivity": True,
            "budget": "medium",
        },
    )
    assert quiz.status_code == 200, quiz.text
    return analysis_id


def test_history_empty_initially(client):
    response = client.get("/analysis/history")
    assert response.status_code == 200
    assert response.json() == []


def test_history_lists_completed_flow(client):
    analysis_id = _full_flow(client)

    response = client.get("/analysis/history")
    assert response.status_code == 200
    history = response.json()
    assert len(history) == 1
    item = history[0]
    assert item["analysis_id"] == analysis_id
    assert item["skin_type"] in {"dry", "oily", "combination", "normal"}
    assert 0.0 <= item["confidence_score"] <= 1.0
    # /quiz/submit eagerly populates top_products.
    assert isinstance(item["top_products"], list)
    assert len(item["top_products"]) >= 1


def test_history_orders_newest_first(client):
    a1 = _full_flow(client)
    a2 = _full_flow(client)
    history = client.get("/analysis/history").json()
    assert [h["analysis_id"] for h in history[:2]] == [a2, a1]


def test_details_404_when_missing(client):
    response = client.get("/analysis/9999/details")
    assert response.status_code == 404


def test_details_returns_full_snapshot(client):
    analysis_id = _full_flow(client)
    response = client.get(f"/analysis/{analysis_id}/details")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["analysis_id"] == analysis_id
    assert body["features"]["skin_type"] in {"dry", "oily", "combination", "normal"}
    assert body["quiz_answers"]["concerns"] == ["hydration", "redness"]
    assert body["quiz_answers"]["sensitivity"] is True

    assert isinstance(body["recommendations"], list)
    assert len(body["recommendations"]) >= 1
    item = body["recommendations"][0]
    assert "product" in item
    assert "score" in item
    assert isinstance(item["reasons"], list)
    assert len(item["reasons"]) >= 1

    assert body["plan"] is not None
    assert "morning" in body["plan"]["daily"]
    assert "evening" in body["plan"]["daily"]


def test_recommendations_are_persisted_after_quiz(client):
    """Eager persistence in /quiz/submit; /recommendations/{id} mirrors /details."""
    analysis_id = _full_flow(client)
    response = client.get(f"/analysis/{analysis_id}/details")
    body = response.json()
    response2 = client.get(f"/recommendations/{analysis_id}")
    assert response2.status_code == 200
    assert len(response2.json()["items"]) == len(body["recommendations"])
