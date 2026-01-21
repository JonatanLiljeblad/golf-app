"""add activity events

Revision ID: 6c5edc0cb6f8
Revises: 8a6f3c1d2b4e
Create Date: 2026-01-21 08:49:24.229226

"""
from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = '6c5edc0cb6f8'
down_revision = '8a6f3c1d2b4e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activity_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("player_id", sa.Integer(), sa.ForeignKey("players.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hole_number", sa.Integer(), nullable=False),
        sa.Column("strokes", sa.Integer(), nullable=False),
        sa.Column("par", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.UniqueConstraint("round_id", "player_id", "hole_number", name="uq_activity_round_player_hole"),
    )
    op.create_index(op.f("ix_activity_events_created_at"), "activity_events", ["created_at"], unique=False)
    op.create_index(op.f("ix_activity_events_player_id"), "activity_events", ["player_id"], unique=False)
    op.create_index(op.f("ix_activity_events_round_id"), "activity_events", ["round_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_activity_events_round_id"), table_name="activity_events")
    op.drop_index(op.f("ix_activity_events_player_id"), table_name="activity_events")
    op.drop_index(op.f("ix_activity_events_created_at"), table_name="activity_events")
    op.drop_table("activity_events")
