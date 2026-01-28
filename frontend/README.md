# Frontend (React + TypeScript)

The Golf App frontend is a React single-page app built with Vite.

## Prerequisites

- Node.js (18+) + npm

## Local development

```bash
cd frontend

npm install
cp .env.example .env
npm run dev
```

By default, the app expects the backend at `http://127.0.0.1:8000` (see `VITE_API_BASE_URL`).

Note: `VITE_API_BASE_URL` should be the backend host (do not include `/api/v1`).

## Environment variables

Copy `frontend/.env.example` to `frontend/.env` and fill in values.

- `VITE_API_BASE_URL` – backend base URL (default: `http://127.0.0.1:8000`)
- `VITE_AUTH0_DOMAIN` – Auth0 tenant domain (exclude the `https://` prefix)
- `VITE_AUTH0_CLIENT_ID` – Auth0 application (client) ID
- `VITE_AUTH0_AUDIENCE` – Auth0 API identifier (recommended)

## Auth0 dashboard configuration

In Auth0 → Application Settings:

- Allowed Callback URLs: `http://localhost:5173, http://127.0.0.1:5173`
- Allowed Web Origins: `http://localhost:5173, http://127.0.0.1:5173`

If `VITE_AUTH0_AUDIENCE` is set, the frontend will request an access token and send `Authorization: Bearer ...` to the backend.

## Useful commands

```bash
npm run dev
npm run lint
npm test
npm run build
npm run preview
```
