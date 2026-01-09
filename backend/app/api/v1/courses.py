from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import ensure_player, get_current_user_id, get_db
from app.models.course import Course, Hole
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


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    holes: list[HoleIn]

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


class CourseOut(BaseModel):
    id: int
    name: str
    holes: list[HoleOut]

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

    db.add(course)
    db.commit()

    stmt = (
        select(Course)
        .options(joinedload(Course.holes))
        .where(Course.id == course.id)
    )
    return db.execute(stmt).scalars().unique().one()


@router.get("/courses", response_model=list[CourseOut])
def list_courses(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)
    stmt = (
        select(Course)
        .options(joinedload(Course.holes))
        .where(Course.owner_player_id == owner.id)
        .order_by(Course.id)
    )
    return db.execute(stmt).scalars().unique().all()


@router.get("/courses/{course_id}", response_model=CourseOut)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    owner = ensure_player(db, user_id)
    stmt = (
        select(Course)
        .options(joinedload(Course.holes))
        .where(Course.id == course_id, Course.owner_player_id == owner.id)
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
        select(Course).where(Course.id == course_id, Course.owner_player_id == owner.id)
    ).scalars().one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    in_use = db.execute(
        select(Round.id).where(Round.course_id == course_id, Round.owner_player_id == owner.id).limit(1)
    ).first()
    if in_use:
        raise HTTPException(status_code=409, detail="Course is in use")

    try:
        db.delete(course)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Course is in use")

    return {"ok": True}
