from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import ensure_player, get_current_user_id, get_db
from app.models.course import Course
from app.models.player import Player
from app.models.round import HoleScore, Round, RoundParticipant

router = APIRouter()


class GuestPlayerIn(BaseModel):
    name: str
    handicap: float | None = None


class RoundCreate(BaseModel):
    course_id: int
    player_ids: list[str] | None = None
    guest_players: list[GuestPlayerIn] | None = None


class RoundAddParticipants(BaseModel):
    player_ids: list[str]


class ScoreIn(BaseModel):
    hole_number: int = Field(ge=1, le=18)
    strokes: int = Field(ge=1, le=30)
    player_id: str | None = None


class HoleScoreOut(BaseModel):
    hole_number: int
    player_id: str
    strokes: int

    class Config:
        from_attributes = True


class ScorecardHole(BaseModel):
    number: int
    par: int
    distance: int | None = None
    hcp: int | None = None
    strokes: dict[str, int | None]


class RoundPlayerOut(BaseModel):
    id: int
    external_id: str
    email: str | None
    username: str | None
    name: str | None
    handicap: float | None


class RoundOut(BaseModel):
    id: int
    course_id: int
    course_name: str
    tournament_id: int | None
    owner_id: str
    player_ids: list[str]
    players: list[RoundPlayerOut]
    started_at: datetime
    completed_at: datetime | None
    holes: list[ScorecardHole]
    total_par: int
    total_strokes: int | None
    total_strokes_by_player: dict[str, int | None]


class RoundSummaryOut(BaseModel):
    id: int
    course_id: int
    course_name: str
    tournament_id: int | None
    started_at: datetime
    completed_at: datetime | None
    total_par: int
    total_strokes: int | None
    players_count: int


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
        raise HTTPException(
            status_code=404,
            detail="Player not found. Ask them to set username/email in Profile, or add as a Guest player.",
        )
    return p


@router.post("/rounds", response_model=RoundOut, status_code=201)
def create_round(
    payload: RoundCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)

    active = db.execute(
        select(Round.id)
        .where(Round.owner_player_id == owner.id, Round.completed_at.is_(None))
        .limit(1)
    ).first()
    if active:
        raise HTTPException(status_code=409, detail="You already have an active round")

    course = db.execute(
        select(Course)
        .options(joinedload(Course.holes))
        .where(Course.id == payload.course_id, Course.archived_at.is_(None))
    ).scalars().unique().one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    players: list[Player] = [owner]

    if payload.player_ids:
        for ref in payload.player_ids:
            ref = (ref or "").strip()
            if not ref:
                continue
            p = _resolve_player_ref(db, ref)
            if p.id == owner.id:
                raise HTTPException(status_code=400, detail="You are already in the round")
            if p.id not in {x.id for x in players}:
                players.append(p)

    guest_payloads = payload.guest_players or []

    if len(players) + len(guest_payloads) > 4:
        raise HTTPException(status_code=400, detail="max 4 players")

    rnd = Round(owner_player_id=owner.id, course_id=payload.course_id)
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

    return _round_to_out(db, rnd.id, owner.id)


@router.post("/rounds/{round_id}/participants")
def add_round_participants(
    round_id: int,
    payload: RoundAddParticipants,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)
    rnd = db.execute(
        select(Round)
        .options(joinedload(Round.participants).joinedload(RoundParticipant.player))
        .where(Round.id == round_id, Round.owner_player_id == owner.id)
    ).scalars().unique().one_or_none()
    if not rnd:
        raise HTTPException(status_code=404, detail="Round not found")
    if rnd.completed_at is not None:
        raise HTTPException(status_code=409, detail="Round already completed")

    existing_player_ids = {p.player_id for p in rnd.participants}

    to_add: list[Player] = []
    for ref in payload.player_ids:
        ref = (ref or "").strip()
        if not ref:
            continue
        p = _resolve_player_ref(db, ref)
        if p.id in existing_player_ids:
            raise HTTPException(status_code=409, detail="Player already in round")
        if p.id not in {x.id for x in to_add}:
            to_add.append(p)

    if not to_add:
        raise HTTPException(status_code=400, detail="No new players to add")

    if len(existing_player_ids) + len(to_add) > 4:
        raise HTTPException(status_code=400, detail="max 4 players")

    for p in to_add:
        db.add(RoundParticipant(round_id=rnd.id, player_id=p.id))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Player already in round")

    return {"ok": True}


@router.delete("/rounds/{round_id}")
def delete_round(
    round_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)
    rnd = db.execute(
        select(Round).where(Round.id == round_id, Round.owner_player_id == owner.id)
    ).scalars().one_or_none()
    if not rnd:
        raise HTTPException(status_code=404, detail="Round not found")
    if rnd.completed_at is not None:
        raise HTTPException(status_code=409, detail="Cannot delete a completed round")

    db.delete(rnd)
    db.commit()
    return {"ok": True}


@router.post("/rounds/{round_id}/scores", response_model=HoleScoreOut)
def submit_score(
    round_id: int,
    payload: ScoreIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    current_player = ensure_player(db, user_id)

    rnd = db.execute(
        select(Round)
        .outerjoin(RoundParticipant, RoundParticipant.round_id == Round.id)
        .options(
            joinedload(Round.course).joinedload(Course.holes),
            joinedload(Round.participants).joinedload(RoundParticipant.player),
        )
        .where(
            Round.id == round_id,
            or_(
                Round.owner_player_id == current_player.id,
                RoundParticipant.player_id == current_player.id,
            ),
        )
    ).scalars().unique().one_or_none()
    if not rnd:
        raise HTTPException(status_code=404, detail="Round not found")

    valid_numbers = {h.number for h in rnd.course.holes}
    if payload.hole_number not in valid_numbers:
        raise HTTPException(status_code=400, detail="Invalid hole_number for course")

    target_external_id = payload.player_id or user_id
    participant_by_external_id = {p.player.external_id: p.player_id for p in rnd.participants}

    if target_external_id not in participant_by_external_id:
        raise HTTPException(status_code=400, detail="player_id not in round")

    target_player_id = participant_by_external_id[target_external_id]

    if target_external_id != user_id and current_player.id != rnd.owner_player_id:
        raise HTTPException(status_code=403, detail="Only owner can enter scores for others")

    score = db.execute(
        select(HoleScore).where(
            HoleScore.round_id == round_id,
            HoleScore.player_id == target_player_id,
            HoleScore.hole_number == payload.hole_number,
        )
    ).scalars().one_or_none()

    if score:
        score.strokes = payload.strokes
    else:
        score = HoleScore(
            round_id=round_id,
            player_id=target_player_id,
            hole_number=payload.hole_number,
            strokes=payload.strokes,
        )
        db.add(score)

    db.flush()

    # Auto-complete once every player has a score for every hole.
    if rnd.completed_at is None:
        participant_ids = list(participant_by_external_id.values())
        existing = db.execute(
            select(HoleScore.player_id, HoleScore.hole_number).where(
                HoleScore.round_id == round_id
            )
        ).all()
        have = {(pid, hn) for (pid, hn) in existing}
        need = {(pid, hn) for pid in participant_ids for hn in valid_numbers}
        if need.issubset(have):
            rnd.completed_at = datetime.now(timezone.utc)

    db.commit()
    return HoleScoreOut(
        hole_number=payload.hole_number, player_id=target_external_id, strokes=payload.strokes
    )


@router.get("/rounds", response_model=list[RoundSummaryOut])
def list_rounds(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)
    rounds = db.execute(
        select(Round)
        .options(
            joinedload(Round.owner),
            joinedload(Round.course).joinedload(Course.holes),
            joinedload(Round.participants).joinedload(RoundParticipant.player),
            joinedload(Round.scores).joinedload(HoleScore.player),
        )
        .where(Round.owner_player_id == owner.id)
        .order_by(Round.started_at.desc(), Round.id.desc())
    ).scalars().unique().all()

    return [_round_to_summary(r) for r in rounds]


@router.get("/rounds/{round_id}", response_model=RoundOut)
def get_round(
    round_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    player = ensure_player(db, user_id)
    return _round_to_out(db, round_id, player.id)


def _compute_totals(
    course: Course,
    participant_ids: list[str],
    scores: list[HoleScore],
    owner_id: str,
) -> tuple[int, int | None, dict[str, int | None]]:
    total_par = sum(h.par for h in course.holes)

    sums: dict[str, int] = {}
    for s in scores:
        pid = s.player.external_id
        sums[pid] = sums.get(pid, 0) + s.strokes

    totals_by_player: dict[str, int | None] = {
        pid: (sums.get(pid) if pid in sums else None) for pid in participant_ids
    }
    owner_total = totals_by_player.get(owner_id)

    return total_par, owner_total, totals_by_player


def _round_to_summary(rnd: Round) -> RoundSummaryOut:
    participant_ids = [p.player.external_id for p in rnd.participants] or [rnd.owner.external_id]

    if rnd.course is None:
        # This can happen if a course was deleted while SQLite foreign keys were off.
        return RoundSummaryOut(
            id=rnd.id,
            course_id=rnd.course_id,
            course_name="(deleted course)",
            tournament_id=rnd.tournament_id,
            started_at=rnd.started_at,
            completed_at=rnd.completed_at,
            total_par=0,
            total_strokes=None,
            players_count=len(participant_ids),
        )

    total_par, owner_total, _ = _compute_totals(
        rnd.course, participant_ids, rnd.scores, rnd.owner.external_id
    )
    return RoundSummaryOut(
        id=rnd.id,
        course_id=rnd.course_id,
        course_name=rnd.course.name,
        tournament_id=rnd.tournament_id,
        started_at=rnd.started_at,
        completed_at=rnd.completed_at,
        total_par=total_par,
        total_strokes=owner_total,
        players_count=len(participant_ids),
    )


def _round_to_out(db: Session, round_id: int, player_id: int) -> RoundOut:
    rnd = db.execute(
        select(Round)
        .outerjoin(RoundParticipant, RoundParticipant.round_id == Round.id)
        .options(
            joinedload(Round.owner),
            joinedload(Round.course).joinedload(Course.holes),
            joinedload(Round.participants).joinedload(RoundParticipant.player),
            joinedload(Round.scores).joinedload(HoleScore.player),
        )
        .where(
            Round.id == round_id,
            or_(Round.owner_player_id == player_id, RoundParticipant.player_id == player_id),
        )
    ).scalars().unique().one_or_none()

    if not rnd:
        raise HTTPException(status_code=404, detail="Round not found")

    participant_ids = [p.player.external_id for p in rnd.participants] or [rnd.owner.external_id]

    strokes_by_hole: dict[int, dict[str, int]] = {}
    for s in rnd.scores:
        strokes_by_hole.setdefault(s.hole_number, {})[s.player.external_id] = s.strokes

    holes = []
    for h in rnd.course.holes:
        holes.append(
            ScorecardHole(
                number=h.number,
                par=h.par,
                distance=h.distance,
                hcp=h.hcp,
                strokes={
                    pid: strokes_by_hole.get(h.number, {}).get(pid)
                    for pid in participant_ids
                },
            )
        )

    total_par, owner_total, totals_by_player = _compute_totals(
        rnd.course, participant_ids, rnd.scores, rnd.owner.external_id
    )

    players = [
        RoundPlayerOut(
            id=p.player.id,
            external_id=p.player.external_id,
            email=p.player.email,
            username=p.player.username,
            name=p.player.name,
            handicap=p.player.handicap,
        )
        for p in rnd.participants
    ]

    return RoundOut(
        id=rnd.id,
        course_id=rnd.course_id,
        course_name=rnd.course.name,
        tournament_id=rnd.tournament_id,
        owner_id=rnd.owner.external_id,
        player_ids=participant_ids,
        players=players,
        started_at=rnd.started_at,
        completed_at=rnd.completed_at,
        holes=holes,
        total_par=total_par,
        total_strokes=owner_total,
        total_strokes_by_player=totals_by_player,
    )
