import os
import sys

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Golf App API"
    API_V1_STR: str = "/api/v1"

    # Default is SQLite for local dev; override with DATABASE_URL in .env
    DATABASE_URL: str = "sqlite:///./golf.db"

    # Auth0
    AUTH0_DOMAIN: str | None = None  # e.g. "dev-abc123.eu.auth0.com"
    AUTH0_AUDIENCE: str | None = None  # e.g. "https://golf-api"
    AUTH0_REQUIRED: bool = False

    class Config:
        # Avoid picking up local .env during pytest runs (tests rely on dev fallback auth).
        env_file = None if ("pytest" in sys.modules or os.getenv("PYTEST_CURRENT_TEST")) else ".env"


settings = Settings()
