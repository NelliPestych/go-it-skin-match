"""End-to-end tests for `POST /quiz/submit` covering both legacy
and Step-3..Step-5 extended payloads.

Each test posts an analysis first (so `analysis_id` is real), then
submits a quiz, then inspects:
- the HTTP response (status, body keys)
- the persisted `answers_json` blob via the test DB
- downstream artefacts (Recommendation + RoutinePlan rows) when the
  rule under test should have shaped them.
"""
from __future__ import annotations

import io
from typing import Any, Dict

import numpy as np
from PIL import Image

from app.models.quiz_answer import QuizAnswer
from app.models.routine_plan import RoutinePlan


def _synthetic_image(color=(180, 150, 140), size=256) -> bytes:
    arr = np.full((size, size, 3), color, dtype=np.uint8)
    noise = np.random.randint(-15, 15, arr.shape, dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _create_analysis(client) -> int:
    """Upload one image so we have a valid `analysis_id` to quiz against."""
    resp = client.post(
        "/analysis/upload",
        files={"file": ("face.jpg", _synthetic_image(), "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["analysis_id"]


def _fetch_quiz_row(db_engine, analysis_id: int) -> Dict[str, Any]:
    """Read the persisted answers_json blob via SQLAlchemy."""
    from sqlalchemy.orm import sessionmaker

    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)
    db = Session()
    try:
        row = db.query(QuizAnswer).filter(QuizAnswer.analysis_id == analysis_id).first()
        assert row is not None, f"no QuizAnswer for analysis_id={analysis_id}"
        return row.answers_json
    finally:
        db.close()


def _fetch_plan_row(db_engine, analysis_id: int) -> Dict[str, Any]:
    from sqlalchemy.orm import sessionmaker

    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)
    db = Session()
    try:
        row = db.query(RoutinePlan).filter(RoutinePlan.analysis_id == analysis_id).first()
        assert row is not None
        return row.plan_json
    finally:
        db.close()


# ── Backward compatibility ────────────────────────────────────────────


def test_legacy_payload_still_accepted(client):
    """The pre-Step-4 wire shape (only the 4 legacy fields) submits
    successfully and produces a 200. This is the canary that the
    new optional fields didn't accidentally become required."""
    analysis_id = _create_analysis(client)
    resp = client.post(
        "/quiz/submit",
        json={
            "analysis_id": analysis_id,
            "self_reported_skin_type": "combination",
            "concerns": ["hydration", "redness"],
            "sensitivity": True,
            "budget": "medium",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["analysis_id"] == analysis_id
    assert "answers_json" in body
    assert body["answers_json"]["sensitivity"] is True
    # No new keys leaked into a legacy answer_json — they should be
    # null/absent since the payload didn't set them.
    assert body["answers_json"].get("routine_level") is None
    assert body["answers_json"].get("sunscreen_usage") is None


def test_unknown_top_level_keys_are_ignored(client):
    """Pydantic's default `extra='ignore'` drops unknown keys silently
    instead of returning 422. This documents the FE→BE contract: the
    frontend may ship new fields before the backend learns about them
    (Step 3 was committed before Step 4) and the payload still works."""
    analysis_id = _create_analysis(client)
    resp = client.post(
        "/quiz/submit",
        json={
            "analysis_id": analysis_id,
            "concerns": ["hydration"],
            "sensitivity": False,
            "completely_made_up_field": "yes",
            "nested": {"also": "ignored"},
        },
    )
    assert resp.status_code == 200, resp.text
    assert "completely_made_up_field" not in resp.json()["answers_json"]


# ── Step-3+4 full payload ─────────────────────────────────────────────


def _full_extended_payload(analysis_id: int) -> Dict[str, Any]:
    return {
        "analysis_id": analysis_id,
        "self_reported_skin_type": "oily",
        "concerns": ["oiliness", "pores"],
        "sensitivity": False,
        "budget": "medium",
        # Step-4 additions:
        "routine_level": "no",
        "breakout_frequency": "often",
        "daily_environment": "urban_pollution",
        "sunscreen_usage": "rarely_never",
        "raw_concerns": ["acne_breakouts", "large_pores"],
        "raw_sensitivity": "not_sensitive",
    }


def test_extended_payload_round_trips_every_field(client, db_engine):
    """All 6 Step-3/4 fields land in `answers_json` unchanged."""
    analysis_id = _create_analysis(client)
    payload = _full_extended_payload(analysis_id)
    resp = client.post("/quiz/submit", json=payload)
    assert resp.status_code == 200, resp.text

    answers = _fetch_quiz_row(db_engine, analysis_id)
    assert answers["routine_level"] == "no"
    assert answers["breakout_frequency"] == "often"
    assert answers["daily_environment"] == "urban_pollution"
    assert answers["sunscreen_usage"] == "rarely_never"
    assert answers["raw_concerns"] == ["acne_breakouts", "large_pores"]
    assert answers["raw_sensitivity"] == "not_sensitive"


# ── End-to-end: plan reacts to quiz signals ───────────────────────────


def test_routine_level_no_produces_basic_plan_via_endpoint(client, db_engine):
    """Hit the real endpoint with `routine_level=no` and verify the
    persisted RoutinePlan row has the 3+2 basic schedule. This is the
    integration counterpart of `test_plan.test_routine_level_no_...`."""
    analysis_id = _create_analysis(client)
    payload = _full_extended_payload(analysis_id)
    payload["routine_level"] = "no"
    resp = client.post("/quiz/submit", json=payload)
    assert resp.status_code == 200, resp.text

    plan_json = _fetch_plan_row(db_engine, analysis_id)
    morning = [step["category"] for step in plan_json["daily"]["morning"]]
    evening = [step["category"] for step in plan_json["daily"]["evening"]]
    assert morning == ["cleanser", "moisturizer", "sunscreen"]
    assert evening == ["cleanser", "moisturizer"]


def test_sunscreen_rarely_never_adds_reminder_via_endpoint(client, db_engine):
    """End-to-end: `sunscreen_usage="rarely_never"` causes the
    persisted plan to carry the "Every day" SPF reminder."""
    analysis_id = _create_analysis(client)
    resp = client.post(
        "/quiz/submit",
        json={
            "analysis_id": analysis_id,
            "concerns": [],
            "sensitivity": False,
            "sunscreen_usage": "rarely_never",
        },
    )
    assert resp.status_code == 200, resp.text

    plan_json = _fetch_plan_row(db_engine, analysis_id)
    days = [tip["day"] for tip in plan_json["weekly_tips"]]
    assert "Every day" in days


def test_404_when_analysis_id_unknown(client):
    """Same negative-path coverage the pre-Step-4 endpoint had."""
    resp = client.post(
        "/quiz/submit",
        json={
            "analysis_id": 9999999,
            "concerns": ["hydration"],
            "sensitivity": False,
        },
    )
    assert resp.status_code == 404
