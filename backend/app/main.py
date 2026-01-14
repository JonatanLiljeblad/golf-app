from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.courses import router as courses_router
from app.api.v1.friends import router as friends_router
from app.api.v1.health import router as health_router
from app.api.v1.players import router as players_router
from app.api.v1.rounds import router as rounds_router
from app.api.v1.tournaments import router as tournaments_router
from app.core.settings import settings

app = FastAPI(title=settings.PROJECT_NAME)

# Local dev: allow Vite dev server to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(
    players_router,
    prefix=settings.API_V1_STR,
    tags=["Players"],
)
app.include_router(
    rounds_router,
    prefix=settings.API_V1_STR,
    tags=["Rounds"],
)
app.include_router(
    tournaments_router,
    prefix=settings.API_V1_STR,
    tags=["Tournaments"],
)
app.include_router(
    friends_router,
    prefix=settings.API_V1_STR,
    tags=["Friends"],
)
