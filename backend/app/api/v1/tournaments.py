from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import ensure_player, get_current_user_id, get_db
from app.models.course import Course
from app.models.player import Player
from app.models.round import HoleScore, Round, RoundParticipant
from app.models.tournament import Tournament
from app.models.tournament_invite import TournamentInvite
from app.models.tournament_member import TournamentMember

router = APIRouter()


def _player_label(p: Player) -> str:
    return p.name or p.username or p.email or p.external_id


def _tournament_access_clause(player_id: int) -> Select:
    # Public tournaments are visible to everyone. Private tournaments require membership.
    # Participating in any group round also grants access.
    return (
        select(Tournament.id)
        .outerjoin(TournamentMember, TournamentMember.tournament_id == Tournament.id)
        .outerjoin(Round, Round.tournament_id == Tournament.id)
        .outerjoin(RoundParticipant, RoundParticipant.round_id == Round.id)
        .where(
            or_(
                Tournament.is_public.is_(True),
                Tournament.owner_player_id == player_id,
                TournamentMember.player_id == player_id,
                RoundParticipant.player_id == player_id,
            )
        )
    )


class TournamentCreate(BaseModel):
    course_id: int
    name: str = Field(min_length=1, max_length=128)
    is_public: bool = False


class TournamentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    is_public: bool | None = None


class TournamentSummaryOut(BaseModel):
    id: int
    name: str
    is_public: bool
    course_id: int
    course_name: str
    owner_id: str
    owner_name: str
    created_at: datetime
    completed_at: datetime | None
    groups_count: int


class TournamentGroupOut(BaseModel):
    round_id: int
    owner_id: str
    owner_name: str
    players_count: int
    started_at: datetime
    completed_at: datetime | None


class LeaderboardEntryOut(BaseModel):
    player_id: str
    player_name: str
    group_round_id: int
    holes_completed: int
    current_hole: int | None
    strokes: int
    par: int
    score_to_par: int


class TournamentOut(BaseModel):
    id: int
    name: str
    is_public: bool
    course_id: int
    course_name: str
    owner_id: str
    owner_name: str
    created_at: datetime
    completed_at: datetime | None
    paused_at: datetime | None
    pause_message: str | None
    my_group_round_id: int | None
    active_groups_count: int
    groups: list[TournamentGroupOut]
    leaderboard: list[LeaderboardEntryOut]


@router.post("/tournaments", response_model=TournamentOut, status_code=201)
def create_tournament(
    payload: TournamentCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)

    course = db.execute(
        select(Course)
        .options(joinedload(Course.holes))
        .where(Course.id == payload.course_id, Course.archived_at.is_(None))
    ).scalars().unique().one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    t = Tournament(
        owner_player_id=owner.id,
        course_id=course.id,
        name=payload.name.strip(),
        is_public=payload.is_public,
    )
    db.add(t)
    db.commit()

    # Ensure owner is a member (important for test DBs created without migrations).
    try:
        db.add(TournamentMember(tournament_id=t.id, player_id=owner.id))
        db.commit()
    except IntegrityError:
        db.rollback()

    return get_tournament(t.id, db=db, user_id=user_id)


@router.get("/tournaments", response_model=list[TournamentSummaryOut])
def list_tournaments(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)

    owner = Player
    rows = db.execute(
        select(
            Tournament,
            Course.name.label("course_name"),
            owner.external_id.label("owner_id"),
            owner.name.label("owner_name"),
            owner.username.label("owner_username"),
            owner.email.label("owner_email"),
            Tournament.completed_at.label("completed_at"),
            func.count(func.distinct(Round.id)).label("groups_count"),
        )
        .join(Course, Course.id == Tournament.course_id)
        .join(owner, owner.id == Tournament.owner_player_id)
        .outerjoin(Round, Round.tournament_id == Tournament.id)
        .where(Tournament.id.in_(_tournament_access_clause(me.id)))
        .group_by(
            Tournament.id,
            Course.name,
            owner.external_id,
            owner.name,
            owner.username,
            owner.email,
            Tournament.completed_at,
        )
        .order_by(Tournament.created_at.desc(), Tournament.id.desc())
    ).all()

    out: list[TournamentSummaryOut] = []
    for (t, course_name, owner_id, owner_name, owner_username, owner_email, completed_at, groups_count) in rows:
        label = owner_name or owner_username or owner_email or owner_id
        out.append(
            TournamentSummaryOut(
                id=t.id,
                name=t.name,
                is_public=bool(t.is_public),
                course_id=t.course_id,
                course_name=course_name,
                owner_id=owner_id,
                owner_name=label,
                created_at=t.created_at,
                completed_at=completed_at,
                groups_count=int(groups_count or 0),
            )
        )
    return out


class TournamentInviteCreate(BaseModel):
    recipient: str = Field(min_length=1)


class TournamentInviteOut(BaseModel):
    id: int
    tournament_id: int
    tournament_name: str
    requester_id: str
    requester_name: str
    created_at: datetime


@router.get("/tournaments/invites", response_model=list[TournamentInviteOut])
def list_tournament_invites(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)

    requester = Player
    rows = db.execute(
        select(TournamentInvite, Tournament.name.label("tournament_name"), requester)
        .join(Tournament, Tournament.id == TournamentInvite.tournament_id)
        .join(requester, requester.id == TournamentInvite.requester_id)
        .where(TournamentInvite.recipient_id == me.id)
        .order_by(TournamentInvite.created_at.desc(), TournamentInvite.id.desc())
    ).all()

    out: list[TournamentInviteOut] = []
    for inv, t_name, req in rows:
        out.append(
            TournamentInviteOut(
                id=inv.id,
                tournament_id=inv.tournament_id,
                tournament_name=t_name,
                requester_id=req.external_id,
                requester_name=_player_label(req),
                created_at=inv.created_at,
            )
        )
    return out

@router.get("/tournaments/{tournament_id}", response_model=TournamentOut)
def get_tournament(
    tournament_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)

    t = db.execute(
        select(Tournament)
        .options(joinedload(Tournament.course).joinedload(Course.holes), joinedload(Tournament.owner))
        .where(Tournament.id == tournament_id)
    ).scalars().unique().one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    allowed = db.execute(_tournament_access_clause(me.id).where(Tournament.id == tournament_id)).first()
    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden")

    rounds = db.execute(
        select(Round)
        .options(
            joinedload(Round.owner),
            joinedload(Round.participants).joinedload(RoundParticipant.player),
            joinedload(Round.scores).joinedload(HoleScore.player),
        )
        .where(Round.tournament_id == t.id)
        .order_by(Round.started_at.asc(), Round.id.asc())
    ).scalars().unique().all()

    groups = [
        TournamentGroupOut(
            round_id=r.id,
            owner_id=r.owner.external_id,
            owner_name=_player_label(r.owner),
            players_count=len(r.participants),
            started_at=r.started_at,
            completed_at=r.completed_at,
        )
        for r in rounds
    ]

    hole_numbers = [h.number for h in (t.course.holes or [])]
    hole_par = {h.number: h.par for h in (t.course.holes or [])}

    leaderboard: list[LeaderboardEntryOut] = []
    for r in rounds:
        for part in r.participants:
            pid = part.player.external_id
            scores = [s for s in r.scores if s.player.external_id == pid]
            holes_done = {s.hole_number for s in scores}
            strokes = sum(s.strokes for s in scores)
            par = sum(hole_par.get(hn, 0) for hn in holes_done)
            score_to_par = strokes - par

            current_hole = None
            for hn in hole_numbers:
                if hn not in holes_done:
                    current_hole = hn
                    break

            leaderboard.append(
                LeaderboardEntryOut(
                    player_id=pid,
                    player_name=_player_label(part.player),
                    group_round_id=r.id,
                    holes_completed=len(holes_done),
                    current_hole=current_hole,
                    strokes=strokes,
                    par=par,
                    score_to_par=score_to_par,
                )
            )

    leaderboard.sort(key=lambda x: (x.score_to_par, -x.holes_completed, x.player_name.lower()))

    my_group_round_id = None
    for r in rounds:
        if any(p.player_id == me.id for p in r.participants):
            my_group_round_id = r.id
            break

    # If this is a private tournament, include invite-only visibility via is_public.
    return TournamentOut(
        id=t.id,
        name=t.name,
        is_public=bool(t.is_public),
        course_id=t.course_id,
        course_name=t.course.name,
        owner_id=t.owner.external_id,
        owner_name=_player_label(t.owner),
        created_at=t.created_at,
        completed_at=t.completed_at,
        paused_at=t.paused_at,
        pause_message=t.pause_message,
        my_group_round_id=my_group_round_id,
        active_groups_count=sum(1 for r in rounds if r.completed_at is None),
        groups=groups,
        leaderboard=leaderboard,
    )


@router.patch("/tournaments/{tournament_id}", response_model=TournamentOut)
def update_tournament(
    tournament_id: int,
    payload: TournamentPatch,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    t = db.execute(select(Tournament).where(Tournament.id == tournament_id)).scalars().one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if t.owner_player_id != me.id:
        raise HTTPException(status_code=403, detail="Only owner can update tournament")

    if payload.name is not None:
        t.name = payload.name.strip()

    if payload.is_public is not None:
        t.is_public = payload.is_public

    db.commit()
    return get_tournament(tournament_id, db=db, user_id=user_id)


@router.post("/tournaments/{tournament_id}/finish", response_model=TournamentOut)
def finish_tournament(
    tournament_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    t = db.execute(select(Tournament).where(Tournament.id == tournament_id)).scalars().one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if t.owner_player_id != me.id:
        raise HTTPException(status_code=403, detail="Only owner can finish tournament")

    if t.completed_at is None:
        now = datetime.now(timezone.utc)
        t.completed_at = now
        t.paused_at = None
        t.pause_message = None
        # Finishing a tournament also finishes all its active group rounds.
        db.execute(
            update(Round)
            .where(Round.tournament_id == t.id, Round.completed_at.is_(None))
            .values(completed_at=now)
        )
        db.commit()

    return get_tournament(tournament_id, db=db, user_id=user_id)


class TournamentPauseIn(BaseModel):
    message: str | None = Field(default=None, max_length=280)


@router.post("/tournaments/{tournament_id}/pause", response_model=TournamentOut)
def pause_tournament(
    tournament_id: int,
    payload: TournamentPauseIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    t = db.execute(select(Tournament).where(Tournament.id == tournament_id)).scalars().one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if t.owner_player_id != me.id:
        raise HTTPException(status_code=403, detail="Only owner can pause tournament")
    if t.completed_at is not None:
        raise HTTPException(status_code=409, detail="Tournament is finished")

    t.paused_at = datetime.now(timezone.utc)
    t.pause_message = (payload.message or "").strip() or None
    db.commit()
    return get_tournament(tournament_id, db=db, user_id=user_id)


@router.post("/tournaments/{tournament_id}/resume", response_model=TournamentOut)
def resume_tournament(
    tournament_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    t = db.execute(select(Tournament).where(Tournament.id == tournament_id)).scalars().one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if t.owner_player_id != me.id:
        raise HTTPException(status_code=403, detail="Only owner can resume tournament")

    if t.paused_at is not None:
        t.paused_at = None
        t.pause_message = None
        db.commit()

    return get_tournament(tournament_id, db=db, user_id=user_id)


@router.delete("/tournaments/{tournament_id}", response_model=dict)
def delete_tournament(
    tournament_id: int,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)
    t = db.execute(select(Tournament).where(Tournament.id == tournament_id)).scalars().one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if t.owner_player_id != me.id:
        raise HTTPException(status_code=403, detail="Only owner can delete tournament")

    active = db.execute(
        select(Round.id).where(Round.tournament_id == t.id, Round.completed_at.is_(None)).limit(1)
    ).first()
    if active and not force:
        raise HTTPException(status_code=409, detail="Tournament has active group rounds")

    db.execute(update(Round).where(Round.tournament_id == t.id).values(tournament_id=None))
    db.delete(t)
    db.commit()
    return {"ok": True}


class GuestPlayerIn(BaseModel):
    name: str
    handicap: float | None = None


class TournamentRoundCreate(BaseModel):
    # Players are added the same way as /rounds.
    stats_enabled: bool = False
    player_ids: list[str] | None = None
    guest_players: list[GuestPlayerIn] | None = None


@router.post("/tournaments/{tournament_id}/rounds", response_model=dict, status_code=201)
def create_group_round(
    tournament_id: int,
    payload: TournamentRoundCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    leader = ensure_player(db, user_id)

    t = db.execute(select(Tournament).where(Tournament.id == tournament_id)).scalars().one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    if t.completed_at is not None:
        raise HTTPException(status_code=409, detail="Tournament is finished")

    allowed = bool(t.is_public) or t.owner_player_id == leader.id or bool(
        db.execute(
            select(TournamentMember.id)
            .where(TournamentMember.tournament_id == t.id, TournamentMember.player_id == leader.id)
            .limit(1)
        ).first()
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Prevent multiple active rounds per leader (reuse existing constraint from /rounds).
    active = db.execute(
        select(Round.id)
        .where(Round.owner_player_id == leader.id, Round.completed_at.is_(None))
        .limit(1)
    ).first()
    if active:
        raise HTTPException(status_code=409, detail="You already have an active round")

    already_in_tournament = db.execute(
        select(RoundParticipant.id)
        .join(Round, RoundParticipant.round_id == Round.id)
        .where(Round.tournament_id == t.id, RoundParticipant.player_id == leader.id)
        .limit(1)
    ).first()
    if already_in_tournament:
        raise HTTPException(status_code=409, detail="You are already in a group in this tournament")

    course = db.execute(
        select(Course)
        .options(joinedload(Course.holes))
        .where(Course.id == t.course_id, Course.archived_at.is_(None))
    ).scalars().unique().one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Resolve players by external id / username / email using the same logic as rounds.
    from app.api.v1.rounds import _resolve_player_ref  # local import to avoid cycles

    players: list[Player] = [leader]
    if payload.player_ids:
        for ref in payload.player_ids:
            ref = (ref or "").strip()
            if not ref:
                continue
            p = _resolve_player_ref(db, ref)
            if p.id == leader.id:
                raise HTTPException(status_code=400, detail="You are already in the round")
            if p.id not in {x.id for x in players}:
                players.append(p)

    guest_payloads = payload.guest_players or []
    if len(players) + len(guest_payloads) > 4:
        raise HTTPException(status_code=400, detail="max 4 players")

    rnd = Round(
        owner_player_id=leader.id,
        course_id=t.course_id,
        tournament_id=t.id,
        stats_enabled=bool(payload.stats_enabled),
    )
    db.add(rnd)
    db.flush()

    for gp in guest_payloads:
        n = (gp.name or "").strip()
        if not n:
            raise HTTPException(status_code=400, detail="Guest name required")
        guest = Player(external_id=f"guest:{uuid4()}", name=n, handicap=gp.handicap)
        db.add(guest)
        db.flush()
        players.append(guest)

    for p in players:
        db.add(RoundParticipant(round_id=rnd.id, player_id=p.id))

        # Add registered players as members (guests are round-only).
        if not (p.external_id or "").startswith("guest:"):
            try:
                with db.begin_nested():
                    db.add(TournamentMember(tournament_id=t.id, player_id=p.id))
            except IntegrityError:
                # Membership already exists.
                pass

    db.commit()
    return {"round_id": rnd.id}




@router.post("/tournaments/{tournament_id}/invites", response_model=dict, status_code=201)
def invite_to_tournament(
    tournament_id: int,
    payload: TournamentInviteCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)

    t = db.execute(select(Tournament).where(Tournament.id == tournament_id)).scalars().one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if t.owner_player_id != me.id:
        raise HTTPException(status_code=403, detail="Only owner can invite")
    if t.completed_at is not None:
        raise HTTPException(status_code=409, detail="Tournament is finished")
    if t.is_public:
        raise HTTPException(status_code=400, detail="Public tournaments do not use invites")

    from app.api.v1.rounds import _resolve_player_ref  # local import to avoid cycles

    recipient = _resolve_player_ref(db, payload.recipient.strip())
    if (recipient.external_id or "").startswith("guest:"):
        raise HTTPException(status_code=400, detail="Cannot invite guest players")
    if recipient.id == me.id:
        raise HTTPException(status_code=400, detail="Cannot invite yourself")

    already_member = db.execute(
        select(TournamentMember.id)
        .where(TournamentMember.tournament_id == t.id, TournamentMember.player_id == recipient.id)
        .limit(1)
    ).first()
    if already_member:
        raise HTTPException(status_code=409, detail="Player is already a member")

    inv = TournamentInvite(tournament_id=t.id, requester_id=me.id, recipient_id=recipient.id)
    db.add(inv)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Invite already exists")

    return {"invite_id": inv.id}


@router.post("/tournaments/invites/{invite_id}/accept", response_model=dict)
def accept_tournament_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)

    inv = db.execute(select(TournamentInvite).where(TournamentInvite.id == invite_id)).scalars().one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    if inv.recipient_id != me.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        with db.begin_nested():
            db.add(TournamentMember(tournament_id=inv.tournament_id, player_id=me.id))
    except IntegrityError:
        pass

    db.delete(inv)
    db.commit()
    return {"ok": True}


@router.post("/tournaments/invites/{invite_id}/decline", response_model=dict)
def decline_tournament_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)

    inv = db.execute(select(TournamentInvite).where(TournamentInvite.id == invite_id)).scalars().one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    if inv.recipient_id != me.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    db.delete(inv)
    db.commit()
    return {"ok": True}


@router.post("/tournaments/{tournament_id}/rounds/{round_id}/join", response_model=dict)
def join_group_round(
    tournament_id: int,
    round_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    me = ensure_player(db, user_id)

    t = db.execute(select(Tournament).where(Tournament.id == tournament_id)).scalars().one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    if t.completed_at is not None:
        raise HTTPException(status_code=409, detail="Tournament is finished")

    allowed = bool(t.is_public) or t.owner_player_id == me.id or bool(
        db.execute(
            select(TournamentMember.id)
            .where(TournamentMember.tournament_id == t.id, TournamentMember.player_id == me.id)
            .limit(1)
        ).first()
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden")

    rnd = db.execute(select(Round).where(Round.id == round_id, Round.tournament_id == t.id)).scalars().one_or_none()
    if not rnd:
        raise HTTPException(status_code=404, detail="Group not found")
    if rnd.completed_at is not None:
        raise HTTPException(status_code=400, detail="Group is completed")

    active_any = db.execute(
        select(RoundParticipant.id)
        .join(Round, RoundParticipant.round_id == Round.id)
        .where(RoundParticipant.player_id == me.id, Round.completed_at.is_(None))
        .limit(1)
    ).first()
    if active_any:
        raise HTTPException(status_code=409, detail="You already have an active round")

    already_in_tournament = db.execute(
        select(RoundParticipant.id)
        .join(Round, RoundParticipant.round_id == Round.id)
        .where(Round.tournament_id == t.id, RoundParticipant.player_id == me.id)
        .limit(1)
    ).first()
    if already_in_tournament:
        raise HTTPException(status_code=409, detail="You are already in a group in this tournament")

    players_count = db.execute(
        select(func.count(RoundParticipant.id)).where(RoundParticipant.round_id == rnd.id)
    ).scalar_one()
    if int(players_count) >= 4:
        raise HTTPException(status_code=409, detail="Group is full")

    db.add(RoundParticipant(round_id=rnd.id, player_id=me.id))
    try:
        with db.begin_nested():
            db.add(TournamentMember(tournament_id=t.id, player_id=me.id))
    except IntegrityError:
        pass

    db.commit()
    return {"round_id": rnd.id}
