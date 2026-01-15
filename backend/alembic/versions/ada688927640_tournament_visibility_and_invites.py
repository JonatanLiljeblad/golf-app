"""tournament visibility and invites

Revision ID: ada688927640
Revises: 5bd6c44f2d37
Create Date: 2026-01-14 15:21:16.586519

"""
from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = 'ada688927640'
down_revision = '5bd6c44f2d37'
branch_labels = None
depends_on = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.add_column(
            "tournaments", sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("false"))
        )
    else:
        with op.batch_alter_table("tournaments", recreate="always") as batch:
            batch.add_column(sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("0")))

    op.create_table(
        "tournament_members",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tournament_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tournament_id"], ["tournaments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tournament_id", "player_id", name="uq_tournament_member"),
    )
    op.create_index(op.f("ix_tournament_members_player_id"), "tournament_members", ["player_id"], unique=False)
    op.create_index(
        op.f("ix_tournament_members_tournament_id"), "tournament_members", ["tournament_id"], unique=False
    )

    op.create_table(
        "tournament_invites",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tournament_id", sa.Integer(), nullable=False),
        sa.Column("requester_id", sa.Integer(), nullable=False),
        sa.Column("recipient_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["recipient_id"], ["players.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requester_id"], ["players.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tournament_id"], ["tournaments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tournament_id", "requester_id", "recipient_id", name="uq_tournament_invite"),
    )
    op.create_index(op.f("ix_tournament_invites_recipient_id"), "tournament_invites", ["recipient_id"], unique=False)
    op.create_index(op.f("ix_tournament_invites_requester_id"), "tournament_invites", ["requester_id"], unique=False)
    op.create_index(op.f("ix_tournament_invites_tournament_id"), "tournament_invites", ["tournament_id"], unique=False)

    # Ensure tournament owner is also a member.
    op.execute(
        "INSERT INTO tournament_members (tournament_id, player_id) "
        "SELECT id, owner_player_id FROM tournaments "
        "WHERE id NOT IN (SELECT tournament_id FROM tournament_members)"
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tournament_invites_tournament_id"), table_name="tournament_invites")
    op.drop_index(op.f("ix_tournament_invites_requester_id"), table_name="tournament_invites")
    op.drop_index(op.f("ix_tournament_invites_recipient_id"), table_name="tournament_invites")
    op.drop_table("tournament_invites")

    op.drop_index(op.f("ix_tournament_members_tournament_id"), table_name="tournament_members")
    op.drop_index(op.f("ix_tournament_members_player_id"), table_name="tournament_members")
    op.drop_table("tournament_members")

    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.drop_column("tournaments", "is_public")
    else:
        with op.batch_alter_table("tournaments", recreate="always") as batch:
            batch.drop_column("is_public")
