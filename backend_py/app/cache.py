from __future__ import annotations

import redis.asyncio as aioredis

from typing import Any

import time

class DummyRedis:
    def __init__(self) -> None:
        self._cache: dict[str, tuple[str, float | None]] = {}

    async def get(self, name: str) -> str | None:
        if name in self._cache:
            val, expiry = self._cache[name]
            if expiry is None or expiry > time.time():
                return val
            else:
                del self._cache[name]
        return None

    async def setex(self, name: str, time_to_live: int, value: str) -> bool:
        self._cache[name] = (value, time.time() + time_to_live)
        return True

    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        pass

redis_client: aioredis.Redis | DummyRedis | None = None

async def get_redis() -> Any:
    """Return the global Redis client (available after startup)."""
    global redis_client
    if redis_client is None:
        redis_client = DummyRedis()
    return redis_client
