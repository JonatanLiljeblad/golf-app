"""add friends table

Revision ID: e3b1c9d0f4a7
Revises: b7d8e9f0a1b2
Create Date: 2026-01-12

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e3b1c9d0f4a7"
down_revision = "b7d8e9f0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "friends",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("friend_player_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["friend_player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("player_id", "friend_player_id", name="uq_friend"),
    )
    op.create_index(op.f("ix_friends_player_id"), "friends", ["player_id"], unique=False)
    op.create_index(
        op.f("ix_friends_friend_player_id"),
        "friends",
        ["friend_player_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_friends_friend_player_id"), table_name="friends")
    op.drop_index(op.f("ix_friends_player_id"), table_name="friends")
    op.drop_table("friends")
