from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.orm import Session

from app.models.activity_event import ActivityEvent

from app.api.deps import ensure_player, get_current_user_id, get_db
from app.models.friend import Friend
from app.models.friend_request import FriendRequest
from app.models.player import Player

router = APIRouter()


class FriendAddIn(BaseModel):
    ref: str


class FriendRequestOut(BaseModel):
    id: int
    from_player: "FriendOut"


class FriendRequestActionOut(BaseModel):
    ok: bool
    accepted: bool | None = None


class FriendOut(BaseModel):
    id: int
    external_id: str
    email: str | None
    username: str | None
    name: str | None
    handicap: float | None

    class Config:
        from_attributes = True


class ActivityPlayerOut(BaseModel):
    external_id: str
    username: str | None
    name: str | None


class ActivityEventOut(BaseModel):
    id: int
    created_at: datetime
    kind: str
    hole_number: int
    strokes: int
    par: int
    player: ActivityPlayerOut

    class Config:
        from_attributes = True


def _resolve_player_ref(db: Session, ref: str) -> Player:
    ref = (ref or "").strip()
    if not ref:
        raise HTTPException(status_code=400, detail="Empty player reference")

    p = db.execute(select(Player).where(Player.external_id == ref)).scalars().one_or_none()
    if p:
        return p

    if "@" in ref:
        email = ref.lower()
        p = db.execute(select(Player).where(Player.email == email)).scalars().one_or_none()
    else:
        p = db.execute(select(Player).where(Player.username == ref)).scalars().one_or_none()

    if not p:
        raise HTTPException(status_code=404, detail="Player not found")
    return p


@router.get("/friends", response_model=list[FriendOut])
def list_friends(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    try:
        rows = db.execute(
            select(Player)
            .join(Friend, Friend.friend_player_id == Player.id)
            .where(Friend.player_id == me.id)
            .order_by(Player.id.desc())
        ).scalars().all()
    except ProgrammingError as e:
        # Usually means Alembic migrations haven't been applied yet.
        if "friends" in str(e).lower() and "does not exist" in str(e).lower():
            raise HTTPException(status_code=503, detail="DB not migrated (friends table missing). Run: alembic upgrade head")
        raise
    return rows


def _are_friends(db: Session, a_id: int, b_id: int) -> bool:
    return (
        db.execute(
            select(Friend.id).where(
                (Friend.player_id == a_id) & (Friend.friend_player_id == b_id)
                | ((Friend.player_id == b_id) & (Friend.friend_player_id == a_id))
            )
        ).first()
        is not None
    )


def _create_mutual_friendship(db: Session, a_id: int, b_id: int) -> None:
    db.add(Friend(player_id=a_id, friend_player_id=b_id))
    db.add(Friend(player_id=b_id, friend_player_id=a_id))


@router.get("/friends/requests", response_model=list[FriendRequestOut])
def list_incoming_requests(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    reqs = db.execute(
        select(FriendRequest, Player)
        .join(Player, Player.id == FriendRequest.requester_id)
        .where(FriendRequest.recipient_id == me.id)
        .order_by(FriendRequest.id.desc())
    ).all()

    return [
        FriendRequestOut(id=req.id, from_player=FriendOut.model_validate(p))
        for req, p in reqs
    ]


@router.post("/friends/requests", response_model=FriendRequestActionOut, status_code=201)
def send_friend_request(
    payload: FriendAddIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    other = _resolve_player_ref(db, payload.ref)

    if other.id == me.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")
    if other.external_id.startswith("guest:") or other.external_id.startswith("profile:"):
        raise HTTPException(status_code=400, detail="Cannot add this player as a friend")

    if _are_friends(db, me.id, other.id):
        raise HTTPException(status_code=409, detail="Already friends")

    # If they already requested you, accept immediately.
    reverse = db.execute(
        select(FriendRequest).where(
            FriendRequest.requester_id == other.id,
            FriendRequest.recipient_id == me.id,
        )
    ).scalars().one_or_none()

    if reverse:
        _create_mutual_friendship(db, me.id, other.id)
        db.delete(reverse)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=409, detail="Already friends")
        return FriendRequestActionOut(ok=True, accepted=True)

    db.add(FriendRequest(requester_id=me.id, recipient_id=other.id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Friend request already sent")

    return FriendRequestActionOut(ok=True, accepted=False)


@router.post("/friends/requests/{request_id}/accept", response_model=FriendRequestActionOut)
def accept_friend_request(
    request_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    req = db.execute(select(FriendRequest).where(FriendRequest.id == request_id)).scalars().one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if req.recipient_id != me.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    if not _are_friends(db, req.requester_id, req.recipient_id):
        _create_mutual_friendship(db, req.requester_id, req.recipient_id)

    db.delete(req)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Already friends")

    return FriendRequestActionOut(ok=True, accepted=True)


@router.post("/friends/requests/{request_id}/decline", response_model=FriendRequestActionOut)
def decline_friend_request(
    request_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    req = db.execute(select(FriendRequest).where(FriendRequest.id == request_id)).scalars().one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if req.recipient_id != me.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    db.delete(req)
    db.commit()
    return FriendRequestActionOut(ok=True)


# Backwards compatible alias: POST /friends now sends a friend request.
@router.post("/friends", response_model=FriendRequestActionOut, status_code=201)
def add_friend(payload: FriendAddIn, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return send_friend_request(payload, db, user_id)


@router.get("/friends/activity", response_model=list[ActivityEventOut])
def list_friend_activity(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    limit: int = Query(20, ge=1, le=100),
):
    me = ensure_player(db, user_id)
    try:
        friend_ids = db.execute(select(Friend.friend_player_id).where(Friend.player_id == me.id)).scalars().all()
        if not friend_ids:
            return []

        rows = db.execute(
            select(ActivityEvent, Player)
            .join(Player, Player.id == ActivityEvent.player_id)
            .where(ActivityEvent.player_id.in_(friend_ids))
            .order_by(ActivityEvent.created_at.desc(), ActivityEvent.id.desc())
            .limit(limit)
        ).all()
    except ProgrammingError as e:
        if "does not exist" in str(e).lower():
            raise HTTPException(status_code=503, detail="DB not migrated. Run: alembic upgrade head")
        raise

    out: list[ActivityEventOut] = []
    for ev, p in rows:
        out.append(
            ActivityEventOut(
                id=ev.id,
                created_at=ev.created_at,
                kind=ev.kind,
                hole_number=ev.hole_number,
                strokes=ev.strokes,
                par=ev.par,
                player=ActivityPlayerOut(external_id=p.external_id, username=p.username, name=p.name),
            )
        )
    return out


@router.delete("/friends/{friend_external_id}")
def remove_friend(
    friend_external_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    other = db.execute(select(Player).where(Player.external_id == friend_external_id)).scalars().one_or_none()
    if not other:
        raise HTTPException(status_code=404, detail="Player not found")

    rels = db.execute(
        select(Friend).where(
            ((Friend.player_id == me.id) & (Friend.friend_player_id == other.id))
            | ((Friend.player_id == other.id) & (Friend.friend_player_id == me.id))
        )
    ).scalars().all()

    if not rels:
        raise HTTPException(status_code=404, detail="Not friends")

    for r in rels:
        db.delete(r)
    db.commit()
    return {"ok": True}
