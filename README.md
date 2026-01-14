# Golf App

A web-based golf score tracking application focused on making it quick to start a round and record scores hole-by-hole.

## Tech stack
- Frontend: React + TypeScript
- Backend: FastAPI + PostgreSQL
- CI/CD: GitHub Actions

## Features (MVP)
- Create and play rounds (9/18 holes)
- Add custom courses
- Track scores per hole
- View scorecards after a round

## Local development

### Backend

This repo uses [`uv`](https://github.com/astral-sh/uv) for Python environment and dependency management.

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

# Run migrations
uv run alembic upgrade head

# Run API
uv run uvicorn app.main:app --reload

# One-shot local smoke (Postgres + migrations)
../scripts/smoke-local.sh

# Smoke test
curl -sS http://127.0.0.1:8000/api/v1/health

# Run tests
uv run pytest
```

Notes:
- Postgres is recommended for local development (see `backend/docker-compose.yml`, exposed on `localhost:5433`).
- When finished, stop the local Postgres container:

  ```bash
  cd backend
  docker compose down      # stop (keep data)
  docker compose down -v   # stop + delete all local data
  ```

- SQLite can be used by setting `DATABASE_URL=sqlite:///./golf.db` in `backend/.env`.

### Frontend

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
- The frontend requires `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID` (see `frontend/.env.example`).
- In the Auth0 Dashboard (Application settings), configure:
  - Allowed Callback URLs: `http://localhost:5173,http://127.0.0.1:5173`
  - Allowed Web Origins: `http://localhost:5173,http://127.0.0.1:5173`
- If `VITE_AUTH0_AUDIENCE` is set, the frontend will request an access token and send `Authorization: Bearer ...` to the backend.

## Roadmap
- Advanced statistics (putts, GIR, FIR)
- Mobile app (React Native)
- Handicap-adjusted scoring

## License

This project is not open source. See [`LICENSE`](./LICENSE).
