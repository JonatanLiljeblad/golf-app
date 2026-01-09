# Backend (FastAPI)

## Local development (uv)

Prereq: install `uv` (https://github.com/astral-sh/uv).

### Postgres (recommended)

```bash
cd backend

# Start Postgres
# (uses localhost:5433 to avoid clashing with local Postgres on 5432)
docker compose up -d

# Configure env
cp .env.example .env

uv venv
uv pip install -r requirements.txt -r requirements-dev.txt

# Apply migrations
uv run alembic upgrade head

uv run uvicorn app.main:app --reload
```

Postgres management (recommended to stop it when you’re done):

```bash
cd backend

# Stop Postgres (keep data)
docker compose down

# Reset Postgres (delete all data)
docker compose down -v
```

### SQLite fallback

```bash
cd backend

uv venv
uv pip install -r requirements.txt -r requirements-dev.txt

# Optional: keep using local sqlite file
# cp .env.example .env && sed -i '' 's|^DATABASE_URL=.*|DATABASE_URL=sqlite:///./golf.db|' .env

uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

### Migrations

If you change models (or pull a change that adds/updates tables), run:

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

```bash
curl -sS http://127.0.0.1:8000/api/v1/health
```
