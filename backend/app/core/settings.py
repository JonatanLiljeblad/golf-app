import os
import sys

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Golf App API"
    API_V1_STR: str = "/api/v1"

    # Default is Postgres for local dev; override with DATABASE_URL in .env
    # (docker-compose exposes Postgres on localhost:5433 to avoid clashing with local installs)
    DATABASE_URL: str = "postgresql://golf:golf@localhost:5433/golfdb"

    # Auth0
    AUTH0_DOMAIN: str | None = None  # e.g. "dev-abc123.eu.auth0.com"
    AUTH0_AUDIENCE: str | None = None  # e.g. "https://golf-api"
    AUTH0_REQUIRED: bool = False

    class Config:
        # Avoid picking up local .env during pytest runs (tests rely on dev fallback auth).
        env_file = None if ("pytest" in sys.modules or os.getenv("PYTEST_CURRENT_TEST")) else ".env"


settings = Settings()
