import os
from typing import Annotated
from urllib.parse import quote

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .models import BriefRequest, SaveBriefRequest
from .providers import GNewsProvider, NvidiaProvider, OpenMeteoProvider
from .supabase_store import SupabaseStore

app = FastAPI(title="Signal Desk API", version="1.0.0", docs_url="/docs")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization", "Content-Type"])

news = GNewsProvider()
weather = OpenMeteoProvider()
llm = NvidiaProvider()
store = SupabaseStore()


@app.get("/api/health")
async def health():
    return {"status": "ok", "providers": {"news": bool(news.api_key), "ai": bool(llm.api_key), "weather": "open-meteo", "database": store.ready()}}


@app.get("/api/news")
async def search_news(query: Annotated[str, Query(min_length=2, max_length=160)]):
    articles = await news.search(query)
    return {"articles": [article.model_dump(mode="json") for article in articles], "count": len(articles), "query": query}


@app.post("/api/brief")
async def create_brief(payload: BriefRequest):
    brief = await llm.analyze(payload)
    return {"brief": brief.model_dump(), "sources": [article.model_dump(mode="json") for article in payload.articles], "model": llm.model}


@app.get("/api/weather/locations")
async def search_locations(query: Annotated[str, Query(min_length=2, max_length=100)]):
    return {"locations": await weather.locations(query)}


@app.get("/api/weather/current")
async def current_weather(latitude: Annotated[float, Query(ge=-90, le=90)], longitude: Annotated[float, Query(ge=-180, le=180)]):
    return await weather.current(latitude, longitude)


def user_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in to access saved briefs.")
    return authorization[7:].strip()


@app.get("/api/saved-briefs")
async def list_saved_briefs(token: str = Depends(user_token)):
    return await store.request("GET", "saved_briefs?select=id,topic,brief,sources,created_at&order=created_at.desc&limit=50", token)


@app.post("/api/saved-briefs")
async def save_brief(payload: SaveBriefRequest, token: str = Depends(user_token)):
    body = {"topic": payload.topic, "brief": payload.brief.model_dump(), "sources": [article.model_dump(mode="json") for article in payload.sources]}
    return await store.request("POST", "saved_briefs", token, body)

