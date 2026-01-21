from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import ensure_player, get_current_user_id, get_db
from app.models.player import Player

router = APIRouter()


class PlayerPublicOut(BaseModel):
    id: int
    external_id: str
    email: str | None
    username: str | None
    name: str | None
    handicap: float | None

    class Config:
        from_attributes = True


class PlayerMeOut(PlayerPublicOut):
    pass


class PlayerMeUpdateIn(BaseModel):
    email: str | None = None
    username: str | None = None
    name: str | None = None
    handicap: float | None = None


class PlayerCreateIn(BaseModel):
    email: str
    username: str
    name: str | None = None
    handicap: float | None = None


@router.get("/players/me", response_model=PlayerMeOut)
def upsert_me(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    player = ensure_player(db, user_id)
    db.commit()
    db.refresh(player)
    return player


@router.patch("/players/me", response_model=PlayerMeOut)
def update_me(
    payload: PlayerMeUpdateIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    player = ensure_player(db, user_id)

    if payload.email is not None:
        v = (payload.email or "").strip().lower()
        player.email = v or None

    if payload.username is not None:
        v = (payload.username or "").strip()
        player.username = v or None

    if payload.name is not None:
        v = (payload.name or "").strip()
        player.name = v or None

    if payload.handicap is not None:
        player.handicap = payload.handicap

    if not player.email or not player.username:
        raise HTTPException(status_code=400, detail="email and username required")

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="email/username already in use")

    db.refresh(player)
    return player


@router.post("/players", response_model=PlayerPublicOut, status_code=201)
def create_player(
    payload: PlayerCreateIn,
    db: Session = Depends(get_db),
    _user_id: str = Depends(get_current_user_id),
):
    email = (payload.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email required")

    username = (payload.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username required")

    existing = db.execute(select(Player).where(Player.email == email)).scalars().one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="email already exists")

    p = Player(
        external_id=f"profile:{uuid4()}",
        email=email,
        username=username,
        name=(payload.name or "").strip() or None,
        handicap=payload.handicap,
    )
    db.add(p)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="email/username already in use")

    db.refresh(p)
    return p


@router.get("/players", response_model=list[PlayerPublicOut])
def search_players(
    q: str | None = None,
    db: Session = Depends(get_db),
    _user_id: str = Depends(get_current_user_id),
):
    # Allow searching real users by email/username/name, and also allow exact lookup by
    # Auth0 `sub` (external_id) even if they haven't filled profile fields yet.
    if not q:
        return []

    qv = q.strip()
    needle = f"%{qv}%"

    rows = db.execute(
        select(Player)
        .where(
            Player.external_id.notlike("guest:%"),
            Player.external_id.notlike("profile:%"),
            or_(
                Player.external_id == qv,
                (
                    or_(Player.email.isnot(None), Player.username.isnot(None), Player.name.isnot(None))
                    & or_(
                        Player.email.ilike(needle),
                        Player.username.ilike(needle),
                        Player.name.ilike(needle),
                    )
                ),
            ),
        )
        .order_by(Player.id.desc())
        .limit(20)
    ).scalars().all()
    return rows


@router.get("/players/{external_id}", response_model=PlayerPublicOut)
def get_player(
    external_id: str,
    db: Session = Depends(get_db),
    _user_id: str = Depends(get_current_user_id),
):
    if external_id.startswith("guest:") or external_id.startswith("profile:"):
        raise HTTPException(status_code=404, detail="Player not found")

    p = db.execute(select(Player).where(Player.external_id == external_id)).scalars().one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")

    out = PlayerPublicOut.model_validate(p)
    out.email = None
    return out
