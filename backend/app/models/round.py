from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Round(Base):
    __tablename__ = "rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Owner/creator of the round (allowed to enter scores for all players).
    owner_player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    tournament_id: Mapped[int | None] = mapped_column(
        ForeignKey("tournaments.id", ondelete="SET NULL"), index=True
    )
    tournament_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("tournament_groups.id", ondelete="SET NULL"), index=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stats_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")

    course = relationship("Course")
    owner = relationship("Player")
    participants: Mapped[list["RoundParticipant"]] = relationship(
        back_populates="round",
        cascade="all, delete-orphan",
        order_by="RoundParticipant.player_id",
    )
    scores: Mapped[list["HoleScore"]] = relationship(
        back_populates="round",
        cascade="all, delete-orphan",
        order_by="HoleScore.hole_number",
    )


class RoundParticipant(Base):
    __tablename__ = "round_participants"
    __table_args__ = (
        UniqueConstraint("round_id", "player_id", name="uq_round_participant"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    round_id: Mapped[int] = mapped_column(
        ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    round: Mapped["Round"] = relationship(back_populates="participants")
    player = relationship("Player")


class HoleScore(Base):
    __tablename__ = "hole_scores"
    __table_args__ = (
        UniqueConstraint(
            "round_id", "player_id", "hole_number", name="uq_score_round_player_hole"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    round_id: Mapped[int] = mapped_column(
        ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    hole_number: Mapped[int] = mapped_column(Integer, nullable=False)
    strokes: Mapped[int] = mapped_column(Integer, nullable=False)
    putts: Mapped[int | None] = mapped_column(Integer)
    fairway: Mapped[str | None] = mapped_column(String(16))
    gir: Mapped[str | None] = mapped_column(String(16))

    round: Mapped["Round"] = relationship(back_populates="scores")
    player = relationship("Player")
