from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Golf App API"
    API_V1_STR: str = "/api/v1"

    # Default is SQLite for local dev; override with DATABASE_URL in .env
    DATABASE_URL: str = "sqlite:///./golf.db"

    class Config:
        env_file = ".env"


settings = Settings()
