from fastapi import FastAPI
from app.core.settings import settings
from app.api.v1.health import router as health_router

app = FastAPI(title=settings.PROJECT_NAME)

app.include_router(
    health_router,
    prefix=settings.API_V1_STR,
    tags=["Health"],
)