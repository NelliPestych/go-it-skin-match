"""Redis cache service.

Wraps redis-py with a small JSON helper. The service degrades gracefully
when Redis is unavailable so the API remains functional in dev/test.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)


class CacheService:
    def __init__(self, url: Optional[str] = None):
        self._url = url or settings.redis_url
        try:
            self._client: Optional[redis.Redis] = redis.from_url(
                self._url, decode_responses=True, socket_connect_timeout=1.0
            )
            self._client.ping()
            self._available = True
        except Exception as exc:  # pragma: no cover - exercised in integration only
            logger.warning("Redis unavailable, cache disabled: %s", exc)
            self._client = None
            self._available = False

    @property
    def available(self) -> bool:
        return self._available

    def get_json(self, key: str) -> Optional[Any]:
        if not self._client:
            return None
        try:
            raw = self._client.get(key)
            return json.loads(raw) if raw else None
        except Exception as exc:
            logger.warning("Redis GET failed for %s: %s", key, exc)
            return None

    def set_json(self, key: str, value: Any, ttl_seconds: int = 600) -> None:
        if not self._client:
            return
        try:
            self._client.setex(key, ttl_seconds, json.dumps(value, default=str))
        except Exception as exc:
            logger.warning("Redis SET failed for %s: %s", key, exc)

    def invalidate(self, key: str) -> None:
        if not self._client:
            return
        try:
            self._client.delete(key)
        except Exception as exc:
            logger.warning("Redis DEL failed for %s: %s", key, exc)

    def health(self) -> bool:
        if not self._client:
            return False
        try:
            return bool(self._client.ping())
        except Exception:
            return False


_cache_singleton: Optional[CacheService] = None


def get_cache() -> CacheService:
    global _cache_singleton
    if _cache_singleton is None:
        _cache_singleton = CacheService()
    return _cache_singleton
