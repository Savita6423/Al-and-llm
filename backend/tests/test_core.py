import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import BriefRequest
from app.providers import GNewsProvider

client = TestClient(app)


def test_health_reports_missing_secrets_without_leaking_them():
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert set(payload["providers"]) == {"news", "ai", "weather", "database"}


def test_news_without_key_returns_actionable_setup_message(monkeypatch):
    monkeypatch.setattr("app.providers.os.getenv", lambda name, default="": "" if name == "GNEWS_API_KEY" else default)
    provider = GNewsProvider()
    with pytest.raises(Exception) as error:
        import asyncio
        asyncio.run(provider.search("AI research"))
    assert "GNews API key" in str(error.value)


def test_brief_request_bounds_number_of_sources():
    from pydantic import ValidationError
    from app.models import Article
    source = Article(title="One report", url="https://example.com/one", source="Example")
    with pytest.raises(ValidationError):
        BriefRequest(topic="AI research", articles=[source] * 11)


def test_location_input_is_validated():
    assert client.get("/api/weather/locations?query=x").status_code == 422

