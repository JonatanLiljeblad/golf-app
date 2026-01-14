from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import ensure_player, get_current_user_id, get_db
from app.models.course import Course
from app.models.player import Player
from app.models.round import HoleScore, Round, RoundParticipant
from app.models.tournament import Tournament

router = APIRouter()


def _player_label(p: Player) -> str:
    return p.name or p.username or p.email or p.external_id


def _tournament_access_clause(player_id: int) -> Select:
    # A user can access a tournament if they own it OR they participate in any round in it.
    return (
        select(Tournament.id)
        .outerjoin(Round, Round.tournament_id == Tournament.id)
        .outerjoin(RoundParticipant, RoundParticipant.round_id == Round.id)
        .where(or_(Tournament.owner_player_id == player_id, RoundParticipant.player_id == player_id))
    )


class TournamentCreate(BaseModel):
    course_id: int
    name: str = Field(min_length=1, max_length=128)


class TournamentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)


class TournamentSummaryOut(BaseModel):
    id: int
    name: str
    course_id: int
    course_name: str
    owner_id: str
    created_at: datetime
    groups_count: int


class TournamentGroupOut(BaseModel):
    round_id: int
    owner_id: str
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
    course_id: int
    course_name: str
    owner_id: str
    created_at: datetime
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

    t = Tournament(owner_player_id=owner.id, course_id=course.id, name=payload.name.strip())
    db.add(t)
    db.commit()

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
            func.count(func.distinct(Round.id)).label("groups_count"),
        )
        .join(Course, Course.id == Tournament.course_id)
        .join(owner, owner.id == Tournament.owner_player_id)
        .outerjoin(Round, Round.tournament_id == Tournament.id)
        .where(Tournament.id.in_(_tournament_access_clause(me.id)))
        .group_by(Tournament.id, Course.name, owner.external_id)
        .order_by(Tournament.created_at.desc(), Tournament.id.desc())
    ).all()

    out: list[TournamentSummaryOut] = []
    for (t, course_name, owner_id, groups_count) in rows:
        out.append(
            TournamentSummaryOut(
                id=t.id,
                name=t.name,
                course_id=t.course_id,
                course_name=course_name,
                owner_id=owner_id,
                created_at=t.created_at,
                groups_count=int(groups_count or 0),
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

    return TournamentOut(
        id=t.id,
        name=t.name,
        course_id=t.course_id,
        course_name=t.course.name,
        owner_id=t.owner.external_id,
        created_at=t.created_at,
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

    db.commit()
    return get_tournament(tournament_id, db=db, user_id=user_id)


class GuestPlayerIn(BaseModel):
    name: str
    handicap: float | None = None


class TournamentRoundCreate(BaseModel):
    # Players are added the same way as /rounds.
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

    # Prevent multiple active rounds per leader (reuse existing constraint from /rounds).
    active = db.execute(
        select(Round.id)
        .where(Round.owner_player_id == leader.id, Round.completed_at.is_(None))
        .limit(1)
    ).first()
    if active:
        raise HTTPException(status_code=409, detail="You already have an active round")

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

    rnd = Round(owner_player_id=leader.id, course_id=t.course_id, tournament_id=t.id)
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

    db.commit()
    return {"round_id": rnd.id}
