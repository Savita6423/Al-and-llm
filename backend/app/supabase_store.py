import os
import httpx
from fastapi import HTTPException


class SupabaseStore:
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.anon_key = os.getenv("SUPABASE_ANON_KEY", "")

    def ready(self) -> bool:
        return bool(self.url and self.anon_key)

    async def request(self, method: str, path: str, token: str, body=None):
        if not self.ready():
            raise HTTPException(503, "Saving briefs requires Supabase configuration. Set SUPABASE_URL and SUPABASE_ANON_KEY, then restart the API.")
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                response = await client.request(method, f"{self.url}/rest/v1/{path}", headers={"apikey": self.anon_key, "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Prefer": "return=representation"}, json=body)
            if response.status_code in (401, 403):
                raise HTTPException(401, "Sign in again to access saved briefs.")
            response.raise_for_status()
            return response.json() if response.content else []
        except HTTPException:
            raise
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Supabase could not complete the request.") from exc

