"""Auth primitives for the MVP — password hashing + JWT signing.

Two concerns, intentionally tiny:

1. **Passwords** are hashed with `hashlib.scrypt` from the standard
   library — no extra dependency, no install-time gotchas, salted per
   record.  Format on disk: ``scrypt$<salt_b64>$<hash_b64>``.

2. **Access tokens** are HS256 JWTs signed with `settings.secret_key`
   via PyJWT.  Payload: ``{ "sub": email, "iat": …, "exp": … }``.
   Default TTL 24 hours.  `decode_access_token` returns ``None`` for
   any invalid / expired / missing token — callers never see a PyJWT
   exception, which keeps the auth dependency boring.

Both helpers are pure functions; they take no `Session` and have no
side effects.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from app.core.config import settings


# ── Password hashing (hashlib.scrypt) ────────────────────────────────

# scrypt cost parameters — tuned for an interactive login at ~50 ms on
# a modern CPU.  These mirror the example in Python's own docs and the
# OpenSSL recommendation for password hashing as of 2024.
_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 64
_SCRYPT_SALT_BYTES = 16
_SCRYPT_PREFIX = "scrypt$"


def hash_password(plain: str) -> str:
    """Return a salted scrypt hash of `plain`.

    Format: ``scrypt$<salt_b64>$<hash_b64>``.  Decoded symmetrically
    in `verify_password`; nothing else parses this string.
    """
    salt = secrets.token_bytes(_SCRYPT_SALT_BYTES)
    digest = hashlib.scrypt(
        plain.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
    )
    return (
        _SCRYPT_PREFIX
        + base64.urlsafe_b64encode(salt).decode("ascii")
        + "$"
        + base64.urlsafe_b64encode(digest).decode("ascii")
    )


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    """Constant-time check `plain` against a stored hash.

    Returns False on any malformed / None / legacy-shaped hash so a
    user row with no password (eg. the historical demo account) can't
    accidentally be logged into.
    """
    if not hashed or not hashed.startswith(_SCRYPT_PREFIX):
        return False
    try:
        _, salt_b64, expected_b64 = hashed.split("$", 2)
        salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
        expected = base64.urlsafe_b64decode(expected_b64.encode("ascii"))
    except (ValueError, binascii.Error):
        return False
    candidate = hashlib.scrypt(
        plain.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=len(expected),
    )
    return hmac.compare_digest(candidate, expected)


# ── JWT access tokens (HS256 via PyJWT) ─────────────────────────────

_JWT_ALGORITHM = "HS256"
_TOKEN_TTL = timedelta(hours=24)

# The literal value declared as `secret_key`'s default in
# `core/config.py`.  Kept here as a constant so the production guard
# can refuse to start if the operator forgot to override it.
DEFAULT_INSECURE_SECRET = "change-me-in-production"


def assert_secret_safe_for_env(app_env: str, secret: str) -> None:
    """Refuse to run in production with the documented default secret.

    The default value is published in `.env.example` and the README,
    so leaving it in place would let anyone forge HS256 JWTs.  Raise
    on startup rather than silently accepting a forged-token-friendly
    config.  Non-production envs are allowed to use the default for
    local dev / CI convenience.
    """
    if (app_env or "").strip().lower() != "production":
        return
    if secret == DEFAULT_INSECURE_SECRET or not secret.strip():
        raise RuntimeError(
            "SECRET_KEY is unset or still the documented default while "
            "APP_ENV=production. Refusing to start — override SECRET_KEY "
            "with a strong random value before deploying."
        )


def _secret() -> str:
    """Return the symmetric secret used to sign / verify JWTs.

    Re-read every call so a settings override in tests applies
    immediately, and so that rotating the deployed secret invalidates
    every existing token without a service restart hop.
    """
    return settings.secret_key


def create_access_token(email: str, ttl: Optional[timedelta] = None) -> str:
    """Return a signed HS256 JWT carrying the user's email + expiry."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "iat": int(now.timestamp()),
        "exp": int((now + (ttl or _TOKEN_TTL)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    """Decode + verify a JWT.

    Returns the `sub` claim (email) on success, or ``None`` on any
    error — including expired tokens, bad signatures, and malformed
    inputs.  Callers don't need to know which: the auth dependency
    treats all failures identically (401).
    """
    if not token:
        return None
    try:
        payload = jwt.decode(token, _secret(), algorithms=[_JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) and sub else None
