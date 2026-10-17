# Signal Desk

Signal Desk is an evidence-first technology research workspace. Search recent reporting, inspect the original publisher links, and optionally ask an NVIDIA-hosted model to synthesize the articles into a short brief with explicit scope and uncertainty. Weather context is available by manually searching a city. Briefs can be saved to a signed-in user's Supabase account.

The workspace starts honestly when a provider is not configured: no sample articles, fabricated weather, or pretend AI output are shown.

## Architecture

```text
Browser (Next.js + TypeScript)
        │ same-origin /api proxy
        ▼
FastAPI (Python)
  ├── GNews adapter (search, normalize, deduplicate, cache)
  ├── NVIDIA adapter (structured research brief)
  ├── Open-Meteo adapter (geocoding + current conditions)
  └── Supabase REST storage (user JWT + RLS)
        │
        └── PostgreSQL / Supabase saved_briefs table
```

The Python API owns provider calls and the analysis workflow. Provider boundaries live in `backend/app/providers.py`; credentials never enter browser code. The Next.js API route is a same-origin transport proxy. Supabase browser settings use the publishable/anon key; the service-role key is not used.

## Requirements

- Node.js 20 or newer
- Python 3.10 or newer
- An NVIDIA API key for AI reading notes
- A GNews API key for live news search
- A Supabase project only if you want sign-in and saved briefs

Open-Meteo current weather and geocoding do not require a key. Its public endpoints are used for a personal/non-commercial development application; review Open-Meteo's terms before commercial deployment.

## Run locally

1. Copy `.env.example` to `.env` and add the keys you want to use. Do not commit `.env`.
2. Install frontend dependencies and start Next.js:

   ```powershell
   npm install
   npm run dev
   ```

3. In a second terminal, install the Python API and run it:

   ```powershell
   cd backend
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000 --env-file ../.env
   ```

4. Open [http://localhost:3000](http://localhost:3000). The backend health endpoint and interactive API docs are at `http://localhost:8000/api/health` and `http://localhost:8000/docs`.

If no keys are configured, the interface reports what needs setup. Weather continues to work without credentials.

## Environment variables

| Variable | Required for | Where used |
| --- | --- | --- |
| `BACKEND_API_URL` | Next-to-Python requests | Next.js server only; defaults to `http://127.0.0.1:8000` |
| `NVIDIA_API_KEY` | AI reading notes | Python API only |
| `NVIDIA_MODEL` | AI reading notes | Python API; defaults to `nvidia/nemotron-3.5-lightning-30b-a3b` |
| `GNEWS_API_KEY` | Live article search | Python API only |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser sign-in | Supabase project URL; public config |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser sign-in | Publishable/anon key; protected by database RLS |
| `SUPABASE_URL` | Saving briefs | Python API only |
| `SUPABASE_ANON_KEY` | Saving briefs | Python API only; user's JWT is forwarded and RLS is enforced |

Never put provider secrets in `NEXT_PUBLIC_*`, source files, or a committed environment file. Do not configure a Supabase service-role key in this application.

## Supabase setup

1. Configure the four Supabase environment variables in `.env` (the URL and anon key are used in both places).
2. Run `backend/migrations/001_saved_briefs.sql` in the Supabase SQL editor.
3. Enable email magic-link authentication in Supabase Auth and allow the local redirect URL `http://localhost:3000`.
4. Sign in from the app. Inserts and reads carry the user's access token; row-level security restricts each record to `auth.uid()`.

The migration uses a foreign key to `auth.users`, a per-user chronological index, constraints, and separate select/insert RLS policies. No user data is stored until the migration is applied and the user signs in.

## Provider behavior

- GNews search is bounded to 10 articles per request and cached in-process for 10 minutes. Duplicate URLs are removed. The API key never leaves the Python process.
- NVIDIA briefs are cached for 5 minutes per exact topic and source set to avoid duplicate model calls.
- NVIDIA requests use the OpenAI-compatible hosted chat completions endpoint. Source titles, publishers, URLs, descriptions, and publication times are compacted before prompt construction. The response is schema-validated; timeout, rate-limit, bad-key, and malformed-response conditions are surfaced.
- Open-Meteo geocoding is debounced in the browser and cached for 15 minutes in the API. Weather is requested only after a person selects a place; browser geolocation is never requested.
- Provider caches are process-local. For multi-instance production deployment, replace them with a shared cache and add per-user/IP rate limiting before exposing the service publicly.
- A brief reflects only the articles returned for its current query. It does not claim full-news coverage or source verification.

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
cd backend
py -m pytest
```

The backend unit suite checks health/setup reporting, credential-missing behavior, input bounds, and request validation without calling paid or credentialed services.

