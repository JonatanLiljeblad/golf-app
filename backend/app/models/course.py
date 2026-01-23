from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner = relationship("Player")

    @property
    def owner_id(self) -> str:
        # External identity (Auth0 `sub` in prod, X-User-Id in dev).
        return self.owner.external_id if self.owner else ""

    holes: Mapped[list["Hole"]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="Hole.number",
    )

    tees: Mapped[list["CourseTee"]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="CourseTee.id",
    )


class Hole(Base):
    __tablename__ = "holes"
    __table_args__ = (
        UniqueConstraint("course_id", "number", name="uq_hole_course_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    par: Mapped[int] = mapped_column(Integer, nullable=False)
    distance: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hcp: Mapped[int | None] = mapped_column(Integer, nullable=True)

    course: Mapped["Course"] = relationship(back_populates="holes")


class CourseTee(Base):
    __tablename__ = "course_tees"
    __table_args__ = (
        UniqueConstraint("course_id", "tee_name", name="uq_course_tee_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )

    tee_name: Mapped[str] = mapped_column(String(64), nullable=False)
    course_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    slope_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    course_rating_men: Mapped[float | None] = mapped_column(Float, nullable=True)
    slope_rating_men: Mapped[int | None] = mapped_column(Integer, nullable=True)
    course_rating_women: Mapped[float | None] = mapped_column(Float, nullable=True)
    slope_rating_women: Mapped[int | None] = mapped_column(Integer, nullable=True)

    course: Mapped["Course"] = relationship(back_populates="tees")
    hole_distances: Mapped[list["TeeHoleDistance"]] = relationship(
        back_populates="tee",
        cascade="all, delete-orphan",
        order_by="TeeHoleDistance.hole_number",
    )


class TeeHoleDistance(Base):
    __tablename__ = "tee_hole_distances"
    __table_args__ = (
        UniqueConstraint("tee_id", "hole_number", name="uq_tee_hole_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tee_id: Mapped[int] = mapped_column(
        ForeignKey("course_tees.id", ondelete="CASCADE"), nullable=False, index=True
    )

    hole_number: Mapped[int] = mapped_column(Integer, nullable=False)
    distance: Mapped[int] = mapped_column(Integer, nullable=False)

    tee: Mapped["CourseTee"] = relationship(back_populates="hole_distances")
