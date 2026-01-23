from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import ensure_player, get_current_user_id, get_db
from app.models.course import Course, CourseTee, Hole, TeeHoleDistance
from app.models.round import Round

router = APIRouter()


class HoleIn(BaseModel):
    number: int = Field(ge=1, le=18)
    par: int = Field(ge=1, le=10)
    distance: int | None = Field(default=None, ge=1, le=2000)
    hcp: int | None = Field(default=None, ge=1, le=18)


class HoleOut(HoleIn):
    id: int

    class Config:
        from_attributes = True


class TeeHoleDistanceIn(BaseModel):
    hole_number: int = Field(ge=1, le=18)
    distance: int = Field(ge=1, le=2000)


class TeeIn(BaseModel):
    tee_name: str = Field(min_length=1, max_length=64)
    course_rating: float | None = None
    slope_rating: int | None = None
    course_rating_men: float | None = None
    slope_rating_men: int | None = None
    course_rating_women: float | None = None
    slope_rating_women: int | None = None
    hole_distances: list[TeeHoleDistanceIn]


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    holes: list[HoleIn]
    tees: list[TeeIn] = []

    @field_validator("holes")
    @classmethod
    def validate_holes(cls, holes: list[HoleIn]) -> list[HoleIn]:
        if len(holes) not in (9, 18):
            raise ValueError("holes must be length 9 or 18")
        numbers = [h.number for h in holes]
        if len(set(numbers)) != len(numbers):
            raise ValueError("hole numbers must be unique")

        max_hcp = len(holes)
        for h in holes:
            if h.hcp is not None and h.hcp > max_hcp:
                raise ValueError(f"hcp must be between 1 and {max_hcp}")

        return holes

    @field_validator("tees")
    @classmethod
    def validate_tees(cls, tees: list[TeeIn], info):
        holes: list[HoleIn] = info.data.get("holes") or []
        hole_numbers = {h.number for h in holes}

        names = [t.tee_name.strip() for t in tees]
        if any(not n for n in names):
            raise ValueError("tee_name required")
        if len(set(n.lower() for n in names)) != len(names):
            raise ValueError("tee_name must be unique")

        for t in tees:
            if len(t.hole_distances) != len(holes):
                raise ValueError("hole_distances must match holes length")
            nums = [d.hole_number for d in t.hole_distances]
            if len(set(nums)) != len(nums):
                raise ValueError("hole_numbers must be unique in hole_distances")
            if set(nums) != hole_numbers:
                raise ValueError("hole_distances must include all hole numbers")

        return tees


class TeeSummaryOut(BaseModel):
    id: int
    tee_name: str

    class Config:
        from_attributes = True


class CourseOut(BaseModel):
    id: int
    name: str
    owner_id: str
    holes: list[HoleOut]
    tees: list[TeeSummaryOut] = []

    class Config:
        from_attributes = True


@router.post("/courses", response_model=CourseOut, status_code=201)
def create_course(
    payload: CourseCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)
    course = Course(owner_player_id=owner.id, name=payload.name)
    course.holes = [
        Hole(number=h.number, par=h.par, distance=h.distance, hcp=h.hcp) for h in payload.holes
    ]

    if payload.tees:
        course.tees = [
            CourseTee(
                tee_name=t.tee_name.strip(),
                course_rating=t.course_rating,
                slope_rating=t.slope_rating,
                course_rating_men=t.course_rating_men,
                slope_rating_men=t.slope_rating_men,
                course_rating_women=t.course_rating_women,
                slope_rating_women=t.slope_rating_women,
                hole_distances=[
                    TeeHoleDistance(hole_number=d.hole_number, distance=d.distance)
                    for d in sorted(t.hole_distances, key=lambda x: x.hole_number)
                ],
            )
            for t in payload.tees
        ]

    db.add(course)
    db.commit()

    stmt = (
        select(Course)
        .options(joinedload(Course.owner), joinedload(Course.holes), joinedload(Course.tees))
        .where(Course.id == course.id)
    )
    return db.execute(stmt).scalars().unique().one()


@router.get("/courses", response_model=list[CourseOut])
def list_courses(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    stmt = (
        select(Course)
        .options(joinedload(Course.owner), joinedload(Course.holes), joinedload(Course.tees))
        .where(Course.archived_at.is_(None))
        .order_by(Course.id)
    )
    return db.execute(stmt).scalars().unique().all()


@router.get("/courses/{course_id}", response_model=CourseOut)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    stmt = (
        select(Course)
        .options(joinedload(Course.owner), joinedload(Course.holes), joinedload(Course.tees))
        .where(Course.id == course_id, Course.archived_at.is_(None))
    )
    course = db.execute(stmt).scalars().unique().one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.delete("/courses/{course_id}")
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)

    course = db.execute(
        select(Course).where(Course.id == course_id, Course.archived_at.is_(None))
    ).scalars().one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.owner_player_id != owner.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    active = db.execute(
        select(Round.id)
        .where(Round.course_id == course_id, Round.completed_at.is_(None))
        .limit(1)
    ).first()
    if active:
        raise HTTPException(status_code=409, detail="Course has active rounds")

    course.archived_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Course is in use")

    return {"ok": True}
