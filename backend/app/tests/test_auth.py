"""Auth round-trip + user-isolation tests."""
from __future__ import annotations

import io
from datetime import timedelta
from typing import Tuple

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.security import (
    DEFAULT_INSECURE_SECRET,
    assert_secret_safe_for_env,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


# ── Tiny helpers ─────────────────────────────────────────────────────


def _tiny_jpeg() -> bytes:
    """Decoder-friendly JPEG ≥ 1 KB to satisfy upload service minimums."""
    img = Image.new("RGB", (256, 256), (220, 180, 150))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _register(client: TestClient, email: str, password: str = "password123") -> Tuple[str, dict]:
    res = client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    assert res.status_code == 201, res.text
    body = res.json()
    return body["access_token"], body["user"]


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _submit_quiz_for_user(client: TestClient, token: str) -> int:
    """Run upload → quiz once for the token holder; return analysis_id."""
    res = client.post(
        "/analysis/upload",
        files={"file": ("face.jpg", _tiny_jpeg(), "image/jpeg")},
        headers=_auth_header(token),
    )
    assert res.status_code == 200, res.text
    analysis_id = res.json()["analysis_id"]

    payload = {
        "analysis_id": analysis_id,
        "self_reported_skin_type": "normal",
        "concerns": [],
        "sensitivity": False,
    }
    res = client.post(
        "/quiz/submit", json=payload, headers=_auth_header(token)
    )
    assert res.status_code == 200, res.text
    return analysis_id


# ── core.security round-trips ────────────────────────────────────────


def test_password_hash_roundtrips():
    h = hash_password("hunter2-secret")
    assert h.startswith("scrypt$")
    assert verify_password("hunter2-secret", h) is True
    assert verify_password("hunter2-secret!", h) is False
    assert verify_password("", h) is False


def test_verify_rejects_empty_or_legacy_hash():
    # Pre-auth user rows had no password_hash; verify must say no.
    assert verify_password("anything", None) is False
    assert verify_password("anything", "") is False
    assert verify_password("anything", "not-a-scrypt-string") is False


def test_password_hashes_are_salted_per_call():
    """Same plaintext → two distinct stored hashes that both verify."""
    h1 = hash_password("samepw12")
    h2 = hash_password("samepw12")
    assert h1 != h2
    assert verify_password("samepw12", h1) is True
    assert verify_password("samepw12", h2) is True


def test_access_token_roundtrip():
    token = create_access_token("a@b.com")
    assert decode_access_token(token) == "a@b.com"


def test_expired_token_decodes_to_none():
    token = create_access_token("a@b.com", ttl=timedelta(seconds=-1))
    assert decode_access_token(token) is None


def test_malformed_token_decodes_to_none():
    assert decode_access_token("not-a-jwt") is None
    assert decode_access_token("") is None


def test_secret_safety_guard_allows_non_production_defaults():
    assert_secret_safe_for_env("development", DEFAULT_INSECURE_SECRET) is None
    assert_secret_safe_for_env("staging", DEFAULT_INSECURE_SECRET) is None
    assert_secret_safe_for_env("test", DEFAULT_INSECURE_SECRET) is None
    assert_secret_safe_for_env("production", "a-real-strong-random-secret") is None


def test_secret_safety_guard_refuses_default_in_production():
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        assert_secret_safe_for_env("production", DEFAULT_INSECURE_SECRET)


def test_secret_safety_guard_refuses_empty_secret_in_production():
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        assert_secret_safe_for_env("production", "")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        assert_secret_safe_for_env("PRODUCTION", "   ")


# ── /auth/register ──────────────────────────────────────────────────


def test_register_happy_path(client):
    res = client.post(
        "/auth/register",
        json={"email": "Alice@example.com", "password": "password123"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == "alice@example.com"
    assert decode_access_token(body["access_token"]) == "alice@example.com"


def test_register_duplicate_email_returns_409(client):
    client.post(
        "/auth/register",
        json={"email": "dup@example.com", "password": "password123"},
    )
    res = client.post(
        "/auth/register",
        json={"email": "dup@example.com", "password": "another1234"},
    )
    assert res.status_code == 409


def test_register_rejects_short_password(client):
    res = client.post(
        "/auth/register",
        json={"email": "short@example.com", "password": "abc"},
    )
    assert res.status_code == 422


def test_register_rejects_invalid_email(client):
    res = client.post(
        "/auth/register",
        json={"email": "not-an-email", "password": "password123"},
    )
    assert res.status_code == 422


# ── /auth/login ─────────────────────────────────────────────────────


def test_login_happy_path(client):
    client.post(
        "/auth/register",
        json={"email": "login@example.com", "password": "password123"},
    )
    res = client.post(
        "/auth/login",
        json={"email": "login@example.com", "password": "password123"},
    )
    assert res.status_code == 200
    body = res.json()
    assert decode_access_token(body["access_token"]) == "login@example.com"


def test_login_wrong_password_is_401(client):
    client.post(
        "/auth/register",
        json={"email": "u@example.com", "password": "password123"},
    )
    res = client.post(
        "/auth/login",
        json={"email": "u@example.com", "password": "wrongPass1"},
    )
    assert res.status_code == 401


def test_login_unknown_email_is_401_with_same_message(client):
    """Identical 401 wording prevents email enumeration."""
    client.post(
        "/auth/register",
        json={"email": "u@example.com", "password": "password123"},
    )
    bad_pw = client.post(
        "/auth/login",
        json={"email": "u@example.com", "password": "wrongPass1"},
    )
    no_account = client.post(
        "/auth/login",
        json={"email": "ghost@example.com", "password": "password123"},
    )
    assert bad_pw.status_code == 401
    assert no_account.status_code == 401
    assert bad_pw.json()["detail"] == no_account.json()["detail"]


# ── get_current_user behaviour ──────────────────────────────────────


def test_demo_fallback_active_in_non_production(client):
    """No auth header in dev → demo user, not 401."""
    res = client.get("/analysis/history")
    assert res.status_code == 200


def test_production_requires_token(client, monkeypatch):
    """In production-mode missing/bad Authorization → 401."""
    monkeypatch.setattr("app.core.config.settings.app_env", "production")
    monkeypatch.setattr("app.api.deps.settings.app_env", "production")

    # No header at all
    assert client.get("/analysis/history").status_code == 401
    # Malformed token
    res = client.get(
        "/analysis/history",
        headers={"Authorization": "Bearer nonsense"},
    )
    assert res.status_code == 401
    expired = create_access_token("anyone@example.com", ttl=timedelta(seconds=-5))
    res = client.get(
        "/analysis/history",
        headers={"Authorization": f"Bearer {expired}"},
    )
    assert res.status_code == 401


def test_production_valid_token_resolves_user(client, monkeypatch):
    token, _ = _register(client, "prod@example.com")
    monkeypatch.setattr("app.core.config.settings.app_env", "production")
    monkeypatch.setattr("app.api.deps.settings.app_env", "production")
    res = client.get("/analysis/history", headers=_auth_header(token))
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_token_for_unknown_user_is_rejected(client, monkeypatch):
    """Token sub with no DB match must not auto-resurrect the account."""
    monkeypatch.setattr("app.core.config.settings.app_env", "production")
    monkeypatch.setattr("app.api.deps.settings.app_env", "production")
    token = create_access_token("ghost@example.com")
    res = client.get("/analysis/history", headers=_auth_header(token))
    assert res.status_code == 401


# ── User isolation ──────────────────────────────────────────────────


def test_history_is_scoped_to_the_authenticated_user(client):
    token_a, _ = _register(client, "alice@example.com")
    token_b, _ = _register(client, "bob@example.com")

    a_id = _submit_quiz_for_user(client, token_a)
    b_id = _submit_quiz_for_user(client, token_b)
    assert a_id != b_id

    res_a = client.get("/analysis/history", headers=_auth_header(token_a))
    res_b = client.get("/analysis/history", headers=_auth_header(token_b))
    ids_a = {item["analysis_id"] for item in res_a.json()}
    ids_b = {item["analysis_id"] for item in res_b.json()}

    assert a_id in ids_a and b_id not in ids_a
    assert b_id in ids_b and a_id not in ids_b


def test_user_cannot_read_another_users_details(client):
    token_a, _ = _register(client, "alice2@example.com")
    token_b, _ = _register(client, "bob2@example.com")
    a_id = _submit_quiz_for_user(client, token_a)

    res = client.get(
        f"/analysis/{a_id}/details", headers=_auth_header(token_b)
    )
    assert res.status_code == 404

    res = client.get(
        f"/analysis/{a_id}/details", headers=_auth_header(token_a)
    )
    assert res.status_code == 200


def test_user_cannot_read_another_users_raw_features(client):
    token_a, _ = _register(client, "alice3@example.com")
    token_b, _ = _register(client, "bob3@example.com")
    a_id = _submit_quiz_for_user(client, token_a)

    res = client.get(
        f"/analysis/{a_id}", headers=_auth_header(token_b)
    )
    assert res.status_code == 404


@pytest.mark.parametrize("path", ["recommendations", "plan"])
def test_user_cannot_read_another_users_recos_or_plan(client, path):
    token_a, _ = _register(client, f"alice_{path}@example.com")
    token_b, _ = _register(client, f"bob_{path}@example.com")
    a_id = _submit_quiz_for_user(client, token_a)

    res = client.get(
        f"/{path}/{a_id}", headers=_auth_header(token_b)
    )
    assert res.status_code == 404
