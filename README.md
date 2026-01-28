# Golf App

Web-based golf score tracking focused on being fast to start a round and record scores hole-by-hole.

## Features (MVP)

- Create and play rounds (9/18 holes)
- Add custom courses
- Track scores per hole
- View scorecards after a round

## Tech stack

- Frontend: React + TypeScript + Vite
- Backend: FastAPI + PostgreSQL
- CI/CD: GitHub Actions

## Project structure

- `frontend/` – React SPA (Vite)
- `backend/` – FastAPI API + database migrations (Alembic)
- `scripts/` – helper scripts (e.g., local smoke tests)
- `docs/` – project documentation

## Quick start (local)

### 1) Backend API (FastAPI)

This repo uses [`uv`](https://github.com/astral-sh/uv) for Python environment and dependency management.

```bash
cd backend

# Start Postgres (recommended; exposed on localhost:5433)
docker compose up -d

# Create/manage a local venv
uv venv

# Install deps
uv pip install -r requirements.txt -r requirements-dev.txt

# Configure environment
cp .env.example .env

# Run migrations
uv run alembic upgrade head

# Start API
uv run uvicorn app.main:app --reload
```

Health check (API base path: `/api/v1`):

```bash
curl -sS http://127.0.0.1:8000/api/v1/health
```

More details: see [`backend/README.md`](./backend/README.md).

### 2) Frontend app (React)

```bash
cd frontend

npm install
cp .env.example .env
npm run dev
```

More details: see [`frontend/README.md`](./frontend/README.md).

## Configuration

### Auth0 (optional)

- Frontend uses Auth0 when configured via `frontend/.env`.
- Backend requires a Bearer token when configured via `backend/.env`.

See:
- [`frontend/.env.example`](./frontend/.env.example)
- [`backend/.env.example`](./backend/.env.example)

## Roadmap

- Advanced statistics (putts, GIR, FIR)
- Mobile app (React Native)
- Handicap-adjusted scoring

## Contributing

Issues and pull requests are welcome. If you’re making a non-trivial change, please open an issue first to align on scope.

## License

See [`LICENSE`](./LICENSE).
