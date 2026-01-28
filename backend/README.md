# Backend (FastAPI)

FastAPI API for the Golf App.

## Prerequisites

- [`uv`](https://github.com/astral-sh/uv)
- Docker (recommended for running Postgres locally)

## Environment variables

Copy `backend/.env.example` to `backend/.env`.

Key settings:

- `DATABASE_URL`
  - Postgres (recommended): `postgresql://golf:golf@localhost:5433/golfdb` (matches `docker compose` port mapping)
  - SQLite fallback: `sqlite:///./golf.db`
- Auth0 (optional)
  - `AUTH0_DOMAIN`
  - `AUTH0_AUDIENCE`
  - `AUTH0_REQUIRED=true` to require a Bearer token

## Local development

### Postgres (recommended)

```bash
cd backend

# Start Postgres (uses localhost:5433 to avoid clashing with local Postgres on 5432)
docker compose up -d

cp .env.example .env

uv venv
uv pip install -r requirements.txt -r requirements-dev.txt

uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Postgres management:

```bash
cd backend

docker compose down    # stop (keep data)
docker compose down -v # stop + delete all local data
```

### SQLite (fallback)

```bash
cd backend

uv venv
uv pip install -r requirements.txt -r requirements-dev.txt

# Set DATABASE_URL=sqlite:///./golf.db in .env

uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

## Common tasks

### Migrations

```bash
cd backend
uv run alembic upgrade head
```

### Tests

```bash
cd backend
uv run pytest
```

### Health check

API base path: `/api/v1`

```bash
curl -sS http://127.0.0.1:8000/api/v1/health
```
