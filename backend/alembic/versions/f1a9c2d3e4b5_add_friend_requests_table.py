"""add friend requests table

Revision ID: f1a9c2d3e4b5
Revises: e3b1c9d0f4a7
Create Date: 2026-01-12

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f1a9c2d3e4b5"
down_revision = "e3b1c9d0f4a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "friend_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requester_id", sa.Integer(), nullable=False),
        sa.Column("recipient_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["requester_id"], ["players.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("requester_id", "recipient_id", name="uq_friend_request"),
    )
    op.create_index(
        op.f("ix_friend_requests_requester_id"),
        "friend_requests",
        ["requester_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_friend_requests_recipient_id"),
        "friend_requests",
        ["recipient_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_friend_requests_recipient_id"), table_name="friend_requests")
    op.drop_index(op.f("ix_friend_requests_requester_id"), table_name="friend_requests")
    op.drop_table("friend_requests")
