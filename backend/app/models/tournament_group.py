from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TournamentGroup(Base):
    __tablename__ = "tournament_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    tournament_id: Mapped[int] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(128), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
