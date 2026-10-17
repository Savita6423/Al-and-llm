import asyncio
import time
from typing import Any


class TTLCache:
    """Small process-local cache for external API responses; values are never user-specific."""

    def __init__(self, ttl_seconds: int = 300):
        self.ttl = ttl_seconds
        self._values: dict[str, tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str):
        async with self._lock:
            item = self._values.get(key)
            if not item:
                return None
            expires, value = item
            if expires <= time.monotonic():
                self._values.pop(key, None)
                return None
            return value

    async def set(self, key: str, value: Any):
        async with self._lock:
            self._values[key] = (time.monotonic() + self.ttl, value)

