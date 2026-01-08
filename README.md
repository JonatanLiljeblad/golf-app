# Golf App 🏌️‍♂️

A web-based golf score tracking application designed to make starting and tracking rounds fast and simple.

## Tech Stack
- Frontend: React + TypeScript
- Backend: FastAPI + PostgreSQL
- CI/CD: GitHub Actions

## MVP Features
- Create and play golf rounds (9/18 holes)
- Add custom courses
- Track scores hole-by-hole
- View scorecards after rounds

## Roadmap
- Advanced statistics (putts, GIR, FIR)
- Mobile app (React Native)
- Handicap-adjusted scoring

## Backend (local dev)

This repo uses [`uv`](https://github.com/astral-sh/uv) for Python env + dependency management.

```bash
cd backend

# Start Postgres (recommended; exposed on localhost:5433)
docker compose up -d

# Create/manage a local venv
uv venv

# Install deps (kept in requirements files for now)
uv pip install -r requirements.txt -r requirements-dev.txt

# Copy env config (defaults to Postgres on localhost:5433)
cp .env.example .env

# Run migrations (needed after pulling schema changes)
uv run alembic upgrade head

# Run API
uv run uvicorn app.main:app --reload

# Smoke test
curl -sS http://127.0.0.1:8000/api/v1/health

# Run tests
uv run pytest
```

Notes:
- For local dev, Postgres is recommended (see `backend/docker-compose.yml`, exposed on `localhost:5433`).
- You can still use SQLite by setting `DATABASE_URL=sqlite:///./golf.db` in `backend/.env`.

## Frontend (local dev)

```bash
cd frontend

# Install deps
npm install

# Configure Auth0 + API URL
cp .env.example .env

# Run dev server
npm run dev

# Lint / test / build
npm run lint
npm test
npm run build
```

Notes:
- The frontend requires `VITE_AUTH0_DOMAIN` + `VITE_AUTH0_CLIENT_ID` to be set (see `frontend/.env.example`).
- In the Auth0 Dashboard (Application settings), set:
  - Allowed Callback URLs: `http://localhost:5173,http://127.0.0.1:5173`
  - Allowed Web Origins: `http://localhost:5173,http://127.0.0.1:5173`
- If you set `VITE_AUTH0_AUDIENCE`, the frontend will request an access token and send `Authorization: Bearer ...` to the backend.
