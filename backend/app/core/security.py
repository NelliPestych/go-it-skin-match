"""Password hashing (scrypt) and JWT access tokens (HS256)."""
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


_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 64
_SCRYPT_SALT_BYTES = 16
_SCRYPT_PREFIX = "scrypt$"


def hash_password(plain: str) -> str:
    """Return ``scrypt$<salt_b64>$<hash_b64>`` for the given plaintext."""
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
    """Constant-time check; returns False for malformed/None/legacy hashes."""
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


_JWT_ALGORITHM = "HS256"
_TOKEN_TTL = timedelta(hours=24)

DEFAULT_INSECURE_SECRET = "change-me-in-production"


def assert_secret_safe_for_env(app_env: str, secret: str) -> None:
    """Refuse to run in production with the default or blank SECRET_KEY."""
    if (app_env or "").strip().lower() != "production":
        return
    if secret == DEFAULT_INSECURE_SECRET or not secret.strip():
        raise RuntimeError(
            "SECRET_KEY is unset or still the documented default while "
            "APP_ENV=production. Refusing to start — override SECRET_KEY "
            "with a strong random value before deploying."
        )


def _secret() -> str:
    # Re-read every call so a rotated secret invalidates tokens without a restart.
    return settings.secret_key


def create_access_token(email: str, ttl: Optional[timedelta] = None) -> str:
    """Return a signed HS256 JWT with ``sub``, ``iat``, ``exp`` claims."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "iat": int(now.timestamp()),
        "exp": int((now + (ttl or _TOKEN_TTL)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    """Return the ``sub`` claim on success, ``None`` on any verification failure."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, _secret(), algorithms=[_JWT_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) and sub else None
