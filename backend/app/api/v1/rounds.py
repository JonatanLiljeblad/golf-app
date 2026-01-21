from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pydantic.config import ConfigDict
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import ensure_player, get_current_user_id, get_db
from app.models.course import Course, Hole
from app.models.player import Player
from app.models.activity_event import ActivityEvent
from app.models.round import HoleScore, Round, RoundParticipant
from app.models.tournament import Tournament
from app.models.tournament_member import TournamentMember

router = APIRouter()


class GuestPlayerIn(BaseModel):
    name: str
    handicap: float | None = None


class RoundCreate(BaseModel):
    course_id: int
    stats_enabled: bool = False
    player_ids: list[str] | None = None
    guest_players: list[GuestPlayerIn] | None = None


class RoundAddParticipants(BaseModel):
    player_ids: list[str]


class ScoreIn(BaseModel):
    hole_number: int = Field(ge=1, le=18)
    strokes: int = Field(ge=1, le=30)
    putts: int | None = Field(default=None, ge=0, le=10)
    fairway: str | None = None
    gir: str | None = None
    player_id: str | None = None


class HoleScoreOut(BaseModel):
    hole_number: int
    player_id: str
    strokes: int

    class Config:
        from_attributes = True


class ScorecardHole(BaseModel):
    model_config = ConfigDict(extra="ignore")

    number: int
    par: int
    distance: int | None = None
    hcp: int | None = None
    strokes: dict[str, int | None]
    putts: dict[str, int | None] | None = None
    fairway: dict[str, str | None] | None = None
    gir: dict[str, str | None] | None = None


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
    tournament_completed_at: datetime | None
    tournament_paused_at: datetime | None
    tournament_pause_message: str | None
    owner_id: str
    player_ids: list[str]
    players: list[RoundPlayerOut]
    started_at: datetime
    completed_at: datetime | None
    stats_enabled: bool
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


@router.post(
    "/rounds", response_model=RoundOut, status_code=201, response_model_exclude_unset=True
)
def create_round(
    payload: RoundCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)

    active = db.execute(
        select(Round.id)
        .outerjoin(RoundParticipant, RoundParticipant.round_id == Round.id)
        .where(
            Round.completed_at.is_(None),
            or_(Round.owner_player_id == owner.id, RoundParticipant.player_id == owner.id),
        )
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

            active_other = db.execute(
                select(Round.id)
                .outerjoin(RoundParticipant, RoundParticipant.round_id == Round.id)
                .where(
                    Round.completed_at.is_(None),
                    or_(Round.owner_player_id == p.id, RoundParticipant.player_id == p.id),
                )
                .limit(1)
            ).first()
            if active_other:
                raise HTTPException(status_code=409, detail="Player already has an active round")

            if p.id not in {x.id for x in players}:
                players.append(p)

    guest_payloads = payload.guest_players or []

    if len(players) + len(guest_payloads) > 4:
        raise HTTPException(status_code=400, detail="max 4 players")

    rnd = Round(
        owner_player_id=owner.id,
        course_id=payload.course_id,
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
        active_other = db.execute(
            select(Round.id)
            .outerjoin(RoundParticipant, RoundParticipant.round_id == Round.id)
            .where(
                Round.completed_at.is_(None),
                Round.id != rnd.id,
                or_(Round.owner_player_id == p.id, RoundParticipant.player_id == p.id),
            )
            .limit(1)
        ).first()
        if active_other:
            raise HTTPException(status_code=409, detail="Player already has an active round")

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
    if rnd.tournament_id is not None:
        raise HTTPException(status_code=409, detail="Cannot delete a tournament round")

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

    if rnd.tournament_id is not None:
        t = db.execute(select(Tournament).where(Tournament.id == rnd.tournament_id)).scalars().one_or_none()
        if t and t.completed_at is not None:
            raise HTTPException(status_code=409, detail="Tournament is finished")
        if t and t.paused_at is not None:
            raise HTTPException(status_code=409, detail=t.pause_message or "Tournament is paused")

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

    allowed_fairway = {"left", "hit", "right", "short"}
    allowed_gir = {"left", "hit", "right", "short", "long"}

    hole_par_by_number = {h.number: h.par for h in rnd.course.holes}
    hole_par = hole_par_by_number.get(payload.hole_number)

    if rnd.stats_enabled:
        if payload.putts is None or payload.gir is None:
            raise HTTPException(status_code=400, detail="putts and gir are required when stats are enabled")
        if hole_par != 3 and payload.fairway is None:
            raise HTTPException(status_code=400, detail="fairway is required on non-par-3 holes when stats are enabled")
        if payload.fairway is not None and payload.fairway not in allowed_fairway:
            raise HTTPException(status_code=400, detail="Invalid fairway value")
        if payload.gir not in allowed_gir:
            raise HTTPException(status_code=400, detail="Invalid gir value")

    score = db.execute(
        select(HoleScore).where(
            HoleScore.round_id == round_id,
            HoleScore.player_id == target_player_id,
            HoleScore.hole_number == payload.hole_number,
        )
    ).scalars().one_or_none()

    if score:
        score.strokes = payload.strokes
        if payload.putts is not None:
            score.putts = payload.putts
        if payload.fairway is not None:
            score.fairway = payload.fairway
        if payload.gir is not None:
            score.gir = payload.gir
    else:
        score = HoleScore(
            round_id=round_id,
            player_id=target_player_id,
            hole_number=payload.hole_number,
            strokes=payload.strokes,
            putts=payload.putts,
            fairway=payload.fairway,
            gir=payload.gir,
        )
        db.add(score)

    db.flush()

    # Emit "birdie or better" activity events for the player.
    diff = payload.strokes - int(hole_par or 0)
    kind = None
    if diff <= -3:
        kind = "albatross"
    elif diff == -2:
        kind = "eagle"
    elif diff == -1:
        kind = "birdie"

    existing_event = db.execute(
        select(ActivityEvent).where(
            ActivityEvent.round_id == round_id,
            ActivityEvent.player_id == target_player_id,
            ActivityEvent.hole_number == payload.hole_number,
        )
    ).scalars().one_or_none()

    if kind and hole_par is not None:
        if existing_event:
            existing_event.strokes = payload.strokes
            existing_event.par = int(hole_par)
            existing_event.kind = kind
        else:
            db.add(
                ActivityEvent(
                    player_id=target_player_id,
                    round_id=round_id,
                    hole_number=payload.hole_number,
                    strokes=payload.strokes,
                    par=int(hole_par),
                    kind=kind,
                )
            )
    elif existing_event:
        db.delete(existing_event)

    # Auto-complete once every player has a score for every hole.
    just_completed = False
    if rnd.completed_at is None:
        participant_ids = list(participant_by_external_id.values())
        existing = db.execute(
            select(HoleScore.player_id, HoleScore.hole_number, HoleScore.putts, HoleScore.fairway, HoleScore.gir).where(
                HoleScore.round_id == round_id
            )
        ).all()

        if not rnd.stats_enabled:
            have = {(pid, hn) for (pid, hn, _p, _f, _g) in existing}
        else:
            have = {
                (pid, hn)
                for (pid, hn, p, f, g) in existing
                if p is not None and g is not None and (hole_par_by_number.get(hn) == 3 or f is not None)
            }

        need = {(pid, hn) for pid in participant_ids for hn in valid_numbers}
        if need.issubset(have):
            rnd.completed_at = datetime.now(timezone.utc)
            just_completed = True

    if just_completed:
        total_par = sum(h.par for h in rnd.course.holes)

        totals = db.execute(
            select(HoleScore.player_id, func.sum(HoleScore.strokes))
            .where(HoleScore.round_id == round_id)
            .group_by(HoleScore.player_id)
        ).all()
        total_strokes_by_player_id = {pid: int(s or 0) for pid, s in totals}

        # Emit PB events on round completion for each real player in the round.
        for pid in set(total_strokes_by_player_id.keys()):
            p = db.execute(select(Player).where(Player.id == pid)).scalars().one_or_none()
            if not p or p.external_id.startswith("guest:"):
                continue

            round_strokes = total_strokes_by_player_id.get(pid)
            if round_strokes is None:
                continue
            score_to_par = round_strokes - total_par

            # Overall PB: best (lowest) score_to_par across completed rounds.
            overall_scores = (
                select(
                    (func.sum(HoleScore.strokes) - func.sum(Hole.par)).label("score_to_par")
                )
                .select_from(HoleScore)
                .join(Round, Round.id == HoleScore.round_id)
                .join(
                    Hole,
                    (Hole.course_id == Round.course_id)
                    & (Hole.number == HoleScore.hole_number),
                )
                .where(
                    HoleScore.player_id == pid,
                    Round.completed_at.isnot(None),
                    Round.id != round_id,
                )
                .group_by(HoleScore.round_id)
            ).subquery()

            prev_best_overall = db.execute(
                select(func.min(overall_scores.c.score_to_par))
            ).scalars().one()

            if prev_best_overall is None or score_to_par < int(prev_best_overall):
                existing_pb = db.execute(
                    select(ActivityEvent).where(
                        ActivityEvent.round_id == round_id,
                        ActivityEvent.player_id == pid,
                        ActivityEvent.hole_number == 0,
                        ActivityEvent.kind == "pb_overall",
                    )
                ).scalars().one_or_none()
                if existing_pb:
                    existing_pb.strokes = round_strokes
                    existing_pb.par = total_par
                else:
                    db.add(
                        ActivityEvent(
                            player_id=pid,
                            round_id=round_id,
                            hole_number=0,
                            strokes=round_strokes,
                            par=total_par,
                            kind="pb_overall",
                        )
                    )

            # Course PB: best (lowest) score_to_par on same course across completed rounds.
            course_scores = (
                select(
                    (func.sum(HoleScore.strokes) - func.sum(Hole.par)).label("score_to_par")
                )
                .select_from(HoleScore)
                .join(Round, Round.id == HoleScore.round_id)
                .join(
                    Hole,
                    (Hole.course_id == Round.course_id)
                    & (Hole.number == HoleScore.hole_number),
                )
                .where(
                    HoleScore.player_id == pid,
                    Round.completed_at.isnot(None),
                    Round.course_id == rnd.course_id,
                    Round.id != round_id,
                )
                .group_by(HoleScore.round_id)
            ).subquery()

            prev_best_course = db.execute(
                select(func.min(course_scores.c.score_to_par))
            ).scalars().one()

            if prev_best_course is None or score_to_par < int(prev_best_course):
                existing_pb = db.execute(
                    select(ActivityEvent).where(
                        ActivityEvent.round_id == round_id,
                        ActivityEvent.player_id == pid,
                        ActivityEvent.hole_number == 0,
                        ActivityEvent.kind == "pb_course",
                    )
                ).scalars().one_or_none()
                if existing_pb:
                    existing_pb.strokes = round_strokes
                    existing_pb.par = total_par
                else:
                    db.add(
                        ActivityEvent(
                            player_id=pid,
                            round_id=round_id,
                            hole_number=0,
                            strokes=round_strokes,
                            par=total_par,
                            kind="pb_course",
                        )
                    )

    db.commit()
    return HoleScoreOut(
        hole_number=payload.hole_number, player_id=target_external_id, strokes=payload.strokes
    )


@router.get("/rounds", response_model=list[RoundSummaryOut])
def list_rounds(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    player = ensure_player(db, user_id)
    rounds = db.execute(
        select(Round)
        .outerjoin(RoundParticipant, RoundParticipant.round_id == Round.id)
        .options(
            joinedload(Round.owner),
            joinedload(Round.course).joinedload(Course.holes),
            joinedload(Round.participants).joinedload(RoundParticipant.player),
            joinedload(Round.scores).joinedload(HoleScore.player),
        )
        .where(or_(Round.owner_player_id == player.id, RoundParticipant.player_id == player.id))
        .order_by(Round.started_at.desc(), Round.id.desc())
    ).scalars().unique().all()

    return [_round_to_summary(r, player.external_id) for r in rounds]


@router.get(
    "/rounds/{round_id}", response_model=RoundOut, response_model_exclude_unset=True
)
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


def _round_to_summary(rnd: Round, viewer_external_id: str) -> RoundSummaryOut:
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

    total_par, _, totals_by_player = _compute_totals(
        rnd.course, participant_ids, rnd.scores, rnd.owner.external_id
    )
    viewer_total = totals_by_player.get(viewer_external_id)
    return RoundSummaryOut(
        id=rnd.id,
        course_id=rnd.course_id,
        course_name=rnd.course.name,
        tournament_id=rnd.tournament_id,
        started_at=rnd.started_at,
        completed_at=rnd.completed_at,
        total_par=total_par,
        total_strokes=viewer_total,
        players_count=len(participant_ids),
    )


def _round_to_out(db: Session, round_id: int, player_id: int) -> RoundOut:
    rnd = db.execute(
        select(Round)
        .outerjoin(RoundParticipant, RoundParticipant.round_id == Round.id)
        .outerjoin(Tournament, Tournament.id == Round.tournament_id)
        .outerjoin(TournamentMember, TournamentMember.tournament_id == Tournament.id)
        .options(
            joinedload(Round.owner),
            joinedload(Round.course).joinedload(Course.holes),
            joinedload(Round.participants).joinedload(RoundParticipant.player),
            joinedload(Round.scores).joinedload(HoleScore.player),
        )
        .where(
            Round.id == round_id,
            or_(
                Round.owner_player_id == player_id,
                RoundParticipant.player_id == player_id,
                and_(
                    Round.tournament_id.isnot(None),
                    or_(
                        Tournament.is_public.is_(True),
                        Tournament.owner_player_id == player_id,
                        TournamentMember.player_id == player_id,
                    ),
                ),
            ),
        )
    ).scalars().unique().one_or_none()

    if not rnd:
        raise HTTPException(status_code=404, detail="Round not found")

    participant_ids = [p.player.external_id for p in rnd.participants] or [rnd.owner.external_id]

    strokes_by_hole: dict[int, dict[str, int]] = {}
    putts_by_hole: dict[int, dict[str, int]] = {}
    fairway_by_hole: dict[int, dict[str, str]] = {}
    gir_by_hole: dict[int, dict[str, str]] = {}

    for s in rnd.scores:
        ext = s.player.external_id
        strokes_by_hole.setdefault(s.hole_number, {})[ext] = s.strokes
        if s.putts is not None:
            putts_by_hole.setdefault(s.hole_number, {})[ext] = s.putts
        if s.fairway is not None:
            fairway_by_hole.setdefault(s.hole_number, {})[ext] = s.fairway
        if s.gir is not None:
            gir_by_hole.setdefault(s.hole_number, {})[ext] = s.gir

    holes = []
    for h in rnd.course.holes:
        hole_kwargs = dict(
            number=h.number,
            par=h.par,
            distance=h.distance,
            hcp=h.hcp,
            strokes={pid: strokes_by_hole.get(h.number, {}).get(pid) for pid in participant_ids},
        )
        if rnd.stats_enabled:
            hole_kwargs["putts"] = {
                pid: putts_by_hole.get(h.number, {}).get(pid) for pid in participant_ids
            }
            hole_kwargs["fairway"] = {
                pid: fairway_by_hole.get(h.number, {}).get(pid) for pid in participant_ids
            }
            hole_kwargs["gir"] = {
                pid: gir_by_hole.get(h.number, {}).get(pid) for pid in participant_ids
            }

        holes.append(ScorecardHole(**hole_kwargs))

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

    t_completed_at = None
    t_paused_at = None
    t_pause_message = None
    if rnd.tournament_id is not None:
        row = db.execute(
            select(Tournament.completed_at, Tournament.paused_at, Tournament.pause_message).where(
                Tournament.id == rnd.tournament_id
            )
        ).first()
        if row:
            t_completed_at, t_paused_at, t_pause_message = row

    return RoundOut(
        id=rnd.id,
        course_id=rnd.course_id,
        course_name=rnd.course.name,
        tournament_id=rnd.tournament_id,
        tournament_completed_at=t_completed_at,
        tournament_paused_at=t_paused_at,
        tournament_pause_message=t_pause_message,
        owner_id=rnd.owner.external_id,
        player_ids=participant_ids,
        players=players,
        started_at=rnd.started_at,
        completed_at=rnd.completed_at,
        stats_enabled=bool(rnd.stats_enabled),
        holes=holes,
        total_par=total_par,
        total_strokes=owner_total,
        total_strokes_by_player=totals_by_player,
    )
