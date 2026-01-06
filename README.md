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
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Optional: copy env config
cp .env.example .env

PYTHONPATH=. python -m uvicorn app.main:app --reload

# test
curl -sS http://127.0.0.1:8000/api/v1/health
```

Notes:
- You only need one virtualenv (recommended: `backend/.venv/`); don’t commit `venv/` directories.
- `DATABASE_URL` defaults to SQLite (`sqlite:///./golf.db`) and can be overridden in `backend/.env`.
