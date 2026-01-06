"""add round participants and player scores

Revision ID: 8c6f3f2c4a1b
Revises: f5400019e0fb
Create Date: 2026-01-06

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8c6f3f2c4a1b"
down_revision = "f5400019e0fb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "round_participants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("round_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["round_id"], ["rounds.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("round_id", "user_id", name="uq_round_participant"),
    )
    op.create_index(op.f("ix_round_participants_round_id"), "round_participants", ["round_id"], unique=False)
    op.create_index(op.f("ix_round_participants_user_id"), "round_participants", ["user_id"], unique=False)

    # Ensure existing rounds have at least the owner as a participant.
    op.execute(
        "INSERT INTO round_participants (round_id, user_id) "
        "SELECT id, user_id FROM rounds "
        "WHERE id NOT IN (SELECT round_id FROM round_participants)"
    )

    # Add player_id to hole_scores and update uniqueness to be per-player per-hole.
    with op.batch_alter_table("hole_scores", recreate="always") as batch:
        batch.add_column(
            sa.Column("player_id", sa.String(length=128), nullable=False, server_default="dev-user")
        )

    # Backfill player_id for existing scores to the round owner.
    op.execute(
        "UPDATE hole_scores "
        "SET player_id = (SELECT user_id FROM rounds WHERE rounds.id = hole_scores.round_id) "
        "WHERE player_id = 'dev-user'"
    )

    # Replace unique constraint.
    with op.batch_alter_table("hole_scores", recreate="always") as batch:
        batch.drop_constraint("uq_score_round_hole", type_="unique")
        batch.create_unique_constraint(
            "uq_score_round_player_hole", ["round_id", "player_id", "hole_number"]
        )
        batch.create_index(op.f("ix_hole_scores_player_id"), ["player_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("hole_scores", recreate="always") as batch:
        batch.drop_index(op.f("ix_hole_scores_player_id"))
        batch.drop_constraint("uq_score_round_player_hole", type_="unique")
        batch.create_unique_constraint("uq_score_round_hole", ["round_id", "hole_number"])
        batch.drop_column("player_id")

    op.drop_index(op.f("ix_round_participants_user_id"), table_name="round_participants")
    op.drop_index(op.f("ix_round_participants_round_id"), table_name="round_participants")
    op.drop_table("round_participants")
