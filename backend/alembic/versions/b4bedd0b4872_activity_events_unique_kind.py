"""activity events unique kind

Revision ID: b4bedd0b4872
Revises: 6c5edc0cb6f8
Create Date: 2026-01-21 09:12:38.516960

"""
from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = 'b4bedd0b4872'
down_revision = '6c5edc0cb6f8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update unique constraint to allow multiple event kinds per (round, player, hole).
    op.drop_constraint(
        "uq_activity_round_player_hole", "activity_events", type_="unique"
    )
    op.create_unique_constraint(
        "uq_activity_round_player_hole",
        "activity_events",
        ["round_id", "player_id", "hole_number", "kind"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_activity_round_player_hole", "activity_events", type_="unique"
    )
    op.create_unique_constraint(
        "uq_activity_round_player_hole",
        "activity_events",
        ["round_id", "player_id", "hole_number"],
    )
