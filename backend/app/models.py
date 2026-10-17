from typing import Literal
from pydantic import BaseModel, Field, HttpUrl


class Article(BaseModel):
    title: str
    description: str = ""
    url: HttpUrl
    image: HttpUrl | None = None
    published_at: str | None = None
    source: str


class BriefRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=160)
    articles: list[Article] = Field(min_length=1, max_length=10)


class BriefResponse(BaseModel):
    headline: str = Field(min_length=3, max_length=140)
    overview: str = Field(min_length=20, max_length=1200)
    key_points: list[str] = Field(min_length=2, max_length=5)
    watch_for: list[str] = Field(min_length=1, max_length=4)
    confidence: Literal["low", "medium", "high"]
    scope_note: str = Field(min_length=3, max_length=300)


class SaveBriefRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=160)
    brief: BriefResponse
    sources: list[Article] = Field(max_length=10)

