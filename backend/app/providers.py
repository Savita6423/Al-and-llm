import json
import hashlib
import os
from typing import Protocol
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from .cache import TTLCache
from .models import Article, BriefRequest, BriefResponse


class NewsProvider(Protocol):
    async def search(self, query: str) -> list[Article]: ...


class WeatherProvider(Protocol):
    async def locations(self, query: str) -> list[dict]: ...
    async def current(self, latitude: float, longitude: float) -> dict: ...


class LLMProvider(Protocol):
    async def analyze(self, request: BriefRequest) -> BriefResponse: ...


def _source_host(url: str) -> str:
    return (urlparse(url).hostname or "Source").removeprefix("www.")


class GNewsProvider:
    def __init__(self):
        self.api_key = os.getenv("GNEWS_API_KEY", "").strip()
        self.cache = TTLCache(600)

    async def search(self, query: str) -> list[Article]:
        if not self.api_key:
            raise HTTPException(503, "Live news needs a GNews API key. Add GNEWS_API_KEY to .env and restart the API.")
        clean = " ".join(query.split())[:160]
        cached = await self.cache.get(clean.casefold())
        if cached is not None:
            return cached
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                response = await client.get(
                    "https://gnews.io/api/v4/search",
                    params={"q": clean, "lang": "en", "max": 10, "apikey": self.api_key},
                )
            if response.status_code == 429:
                raise HTTPException(429, "GNews request limit reached. Wait before refreshing this topic.")
            response.raise_for_status()
            payload = response.json()
        except HTTPException:
            raise
        except httpx.TimeoutException as exc:
            raise HTTPException(504, "GNews took too long to respond. Try again shortly.") from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(502, "GNews could not return usable results right now.") from exc

        articles: list[Article] = []
        seen: set[str] = set()
        for raw in payload.get("articles", []):
            url = raw.get("url")
            title = raw.get("title")
            if not url or not title or url in seen:
                continue
            seen.add(url)
            articles.append(Article(
                title=title[:240], description=(raw.get("description") or "")[:600],
                url=url, image=raw.get("image") or None,
                published_at=raw.get("publishedAt"),
                source=(raw.get("source") or {}).get("name") or _source_host(url),
            ))
        await self.cache.set(clean.casefold(), articles)
        return articles


class OpenMeteoProvider:
    def __init__(self):
        self.cache = TTLCache(900)

    async def locations(self, query: str) -> list[dict]:
        clean = " ".join(query.split())[:100]
        if len(clean) < 2:
            return []
        cache_key = f"geo:{clean.casefold()}"
        if (cached := await self.cache.get(cache_key)) is not None:
            return cached
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get("https://geocoding-api.open-meteo.com/v1/search", params={"name": clean, "count": 5, "language": "en", "format": "json"})
            response.raise_for_status()
            items = response.json().get("results", [])
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(502, "Location search is unavailable right now.") from exc
        result = [{"name": item["name"], "country": item.get("country", ""), "admin1": item.get("admin1", ""), "latitude": item["latitude"], "longitude": item["longitude"], "timezone": item.get("timezone", "UTC")} for item in items]
        await self.cache.set(cache_key, result)
        return result

    async def current(self, latitude: float, longitude: float) -> dict:
        key = f"weather:{latitude:.2f}:{longitude:.2f}"
        if (cached := await self.cache.get(key)) is not None:
            return cached
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get("https://api.open-meteo.com/v1/forecast", params={"latitude": latitude, "longitude": longitude, "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m", "timezone": "auto", "forecast_days": 1})
            response.raise_for_status()
            payload = response.json()
            current = payload["current"]
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise HTTPException(502, "Weather data is unavailable right now.") from exc
        result = {"current": current, "timezone": payload.get("timezone", "UTC"), "units": payload.get("current_units", {})}
        await self.cache.set(key, result)
        return result


class NvidiaProvider:
    def __init__(self):
        self.api_key = os.getenv("NVIDIA_API_KEY", "").strip()
        self.model = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b").strip()
        self.cache = TTLCache(300)

    async def analyze(self, request: BriefRequest) -> BriefResponse:
        if not self.api_key:
            raise HTTPException(503, "AI analysis needs an NVIDIA API key. Add NVIDIA_API_KEY to .env and restart the API.")
        source_material = [{"title": a.title, "description": a.description, "source": a.source, "url": str(a.url), "published_at": a.published_at} for a in request.articles]
        task = {"topic": request.topic, "sources": source_material}
        cache_key = hashlib.sha256(json.dumps(task, sort_keys=True).encode()).hexdigest()
        if (cached := await self.cache.get(cache_key)) is not None:
            return BriefResponse.model_validate(cached)
        system = (
            "You are an evidence-first technology research analyst. Only treat the supplied articles as evidence. "
            "Separate reported facts from inference, name uncertainty, and never invent details or imply these sources represent all coverage. Return the JSON object directly without markdown fences. "
            "Return only valid JSON with keys: headline, overview, key_points (2-5 strings), watch_for (1-4 strings), "
            "confidence (low|medium|high), scope_note. Include source titles or publishers in key points where possible."
        )
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"},
                    json={"model": self.model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(task, ensure_ascii=False)}], "temperature": 0.2, "max_tokens": 1000, "stream": False},
                )
            if response.status_code == 429:
                raise HTTPException(429, "NVIDIA rate limit reached. Wait a moment before requesting another brief.")
            if response.status_code in (401, 403):
                raise HTTPException(502, "NVIDIA rejected the configured key. Check NVIDIA_API_KEY in .env.")
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"]
            result = BriefResponse.model_validate_json(text)
            await self.cache.set(cache_key, result.model_dump())
            return result
        except HTTPException:
            raise
        except httpx.TimeoutException as exc:
            raise HTTPException(504, "NVIDIA analysis timed out. Try again shortly.") from exc
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
            raise HTTPException(502, "NVIDIA could not produce a valid research brief. Try again or check the configured model.") from exc

