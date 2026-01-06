from fastapi import FastAPI

from app.api.v1.courses import router as courses_router
from app.api.v1.health import router as health_router
from app.core.settings import settings

app = FastAPI(title=settings.PROJECT_NAME)

app.include_router(
    health_router,
    prefix=settings.API_V1_STR,
    tags=["Health"],
)
app.include_router(
    courses_router,
    prefix=settings.API_V1_STR,
    tags=["Courses"],
)
