from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user_id, get_db
from app.models.course import Course
from app.models.round import HoleScore, Round

router = APIRouter()


class RoundCreate(BaseModel):
    course_id: int


class ScoreIn(BaseModel):
    hole_number: int = Field(ge=1, le=18)
    strokes: int = Field(ge=1, le=30)


class HoleScoreOut(BaseModel):
    hole_number: int
    strokes: int

    class Config:
        from_attributes = True


class ScorecardHole(BaseModel):
    number: int
    par: int
    strokes: int | None


class RoundOut(BaseModel):
    id: int
    course_id: int
    course_name: str
    started_at: datetime
    completed_at: datetime | None
    holes: list[ScorecardHole]
    total_par: int
    total_strokes: int | None


class RoundSummaryOut(BaseModel):
    id: int
    course_id: int
    course_name: str
    started_at: datetime
    completed_at: datetime | None
    total_par: int
    total_strokes: int | None


@router.post("/rounds", response_model=RoundOut, status_code=201)
def create_round(
    payload: RoundCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    course = db.execute(
        select(Course)
        .options(joinedload(Course.holes))
        .where(Course.id == payload.course_id, Course.user_id == user_id)
    ).scalars().unique().one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    rnd = Round(user_id=user_id, course_id=payload.course_id)
    db.add(rnd)
    db.commit()

    return _round_to_out(db, rnd.id, user_id)


@router.post("/rounds/{round_id}/scores", response_model=HoleScoreOut)
def submit_score(
    round_id: int,
    payload: ScoreIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    rnd = db.execute(
        select(Round)
        .options(joinedload(Round.course).joinedload(Course.holes))
        .where(Round.id == round_id, Round.user_id == user_id)
    ).scalars().unique().one_or_none()
    if not rnd:
        raise HTTPException(status_code=404, detail="Round not found")

    valid_numbers = {h.number for h in rnd.course.holes}
    if payload.hole_number not in valid_numbers:
        raise HTTPException(status_code=400, detail="Invalid hole_number for course")

    score = db.execute(
        select(HoleScore).where(
            HoleScore.round_id == round_id, HoleScore.hole_number == payload.hole_number
        )
    ).scalars().one_or_none()

    if score:
        score.strokes = payload.strokes
    else:
        score = HoleScore(
            round_id=round_id, hole_number=payload.hole_number, strokes=payload.strokes
        )
        db.add(score)

    db.flush()

    # Auto-complete the round once all holes have a score.
    if rnd.completed_at is None:
        scored_holes = db.execute(
            select(HoleScore.hole_number).where(HoleScore.round_id == round_id)
        ).scalars().all()
        if len(set(scored_holes)) == len(valid_numbers):
            rnd.completed_at = datetime.now(timezone.utc)

    db.commit()
    return score


@router.get("/rounds", response_model=list[RoundSummaryOut])
def list_rounds(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    rounds = db.execute(
        select(Round)
        .options(
            joinedload(Round.course).joinedload(Course.holes),
            joinedload(Round.scores),
        )
        .where(Round.user_id == user_id)
        .order_by(Round.started_at.desc(), Round.id.desc())
    ).scalars().unique().all()

    return [_round_to_summary(r) for r in rounds]


@router.get("/rounds/{round_id}", response_model=RoundOut)
def get_round(
    round_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    return _round_to_out(db, round_id, user_id)


def _compute_totals(course: Course, scores: list[HoleScore]) -> tuple[int, int | None]:
    total_par = sum(h.par for h in course.holes)
    total_strokes = sum(s.strokes for s in scores) if scores else None
    return total_par, total_strokes


def _round_to_summary(rnd: Round) -> RoundSummaryOut:
    total_par, total_strokes = _compute_totals(rnd.course, rnd.scores)
    return RoundSummaryOut(
        id=rnd.id,
        course_id=rnd.course_id,
        course_name=rnd.course.name,
        started_at=rnd.started_at,
        completed_at=rnd.completed_at,
        total_par=total_par,
        total_strokes=total_strokes,
    )


def _round_to_out(db: Session, round_id: int, user_id: str) -> RoundOut:
    rnd = db.execute(
        select(Round)
        .options(
            joinedload(Round.course).joinedload(Course.holes),
            joinedload(Round.scores),
        )
        .where(Round.id == round_id, Round.user_id == user_id)
    ).scalars().unique().one_or_none()

    if not rnd:
        raise HTTPException(status_code=404, detail="Round not found")

    score_by_number = {s.hole_number: s.strokes for s in rnd.scores}
    holes = [
        ScorecardHole(number=h.number, par=h.par, strokes=score_by_number.get(h.number))
        for h in rnd.course.holes
    ]

    total_par, total_strokes = _compute_totals(rnd.course, rnd.scores)

    return RoundOut(
        id=rnd.id,
        course_id=rnd.course_id,
        course_name=rnd.course.name,
        started_at=rnd.started_at,
        completed_at=rnd.completed_at,
        holes=holes,
        total_par=total_par,
        total_strokes=total_strokes,
    )
