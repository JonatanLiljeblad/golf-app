# Backend (FastAPI)

## Local development (uv)

Prereq: install `uv` (https://github.com/astral-sh/uv).

```bash
cd backend

uv venv
uv pip install -r requirements.txt -r requirements-dev.txt

cp .env.example .env  # optional

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
