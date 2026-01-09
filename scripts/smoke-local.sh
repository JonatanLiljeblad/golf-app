#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

echo "Starting local Postgres (Docker)..."
docker compose -f "$ROOT_DIR/backend/docker-compose.yml" up -d

echo "Waiting for Postgres to be ready..."
for i in {1..30}; do
  if docker compose -f "$ROOT_DIR/backend/docker-compose.yml" exec -T db pg_isready -U golf -d golfdb >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "Postgres did not become ready in time" >&2
    exit 1
  fi
done

echo "Running Alembic migrations (requires your Python env to have backend deps installed)..."
(
  cd "$ROOT_DIR/backend"
  if command -v alembic >/dev/null 2>&1; then
    alembic upgrade head
  else
    python3 -m alembic upgrade head
  fi
)

echo "Smoke OK."
