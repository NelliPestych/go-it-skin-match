"""Mock auth for the MVP.

For the diploma MVP we issue and verify a non-cryptographic token that simply
encodes the user's email. The shape of the API is identical to a real JWT
flow, so swapping in `python-jose` and signed tokens later is a 1-file change.
"""
from __future__ import annotations

import base64
import json
from typing import Optional


TOKEN_PREFIX = "skm."


def create_access_token(email: str) -> str:
    payload = json.dumps({"sub": email}).encode("utf-8")
    return TOKEN_PREFIX + base64.urlsafe_b64encode(payload).decode("utf-8")


def decode_access_token(token: str) -> Optional[str]:
    if not token or not token.startswith(TOKEN_PREFIX):
        return None
    try:
        payload = base64.urlsafe_b64decode(token[len(TOKEN_PREFIX):].encode("utf-8"))
        data = json.loads(payload)
        return data.get("sub")
    except (ValueError, json.JSONDecodeError):
        return None
