"""add player profile fields

Revision ID: c1a2b3c4d5e6
Revises: f902e7c7c3bf
Create Date: 2026-01-08

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c1a2b3c4d5e6"
down_revision = "f902e7c7c3bf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    # On Postgres, `recreate="always"` tries to drop the PK constraint, but `players`
    # is referenced by multiple FKs; use regular ALTERs instead.
    if dialect == "postgresql":
        op.add_column("players", sa.Column("email", sa.String(length=320), nullable=True))
        op.add_column("players", sa.Column("username", sa.String(length=64), nullable=True))
        op.add_column("players", sa.Column("name", sa.String(length=128), nullable=True))
        op.add_column("players", sa.Column("handicap", sa.Float(), nullable=True))
        op.create_index(op.f("ix_players_email"), "players", ["email"], unique=True)
        op.create_index(op.f("ix_players_username"), "players", ["username"], unique=True)
    else:
        with op.batch_alter_table("players", recreate="always") as batch:
            batch.add_column(sa.Column("email", sa.String(length=320), nullable=True))
            batch.add_column(sa.Column("username", sa.String(length=64), nullable=True))
            batch.add_column(sa.Column("name", sa.String(length=128), nullable=True))
            batch.add_column(sa.Column("handicap", sa.Float(), nullable=True))
            batch.create_index(op.f("ix_players_email"), ["email"], unique=True)
            batch.create_index(op.f("ix_players_username"), ["username"], unique=True)


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.drop_index(op.f("ix_players_username"), table_name="players")
        op.drop_index(op.f("ix_players_email"), table_name="players")
        op.drop_column("players", "handicap")
        op.drop_column("players", "name")
        op.drop_column("players", "username")
        op.drop_column("players", "email")
    else:
        with op.batch_alter_table("players", recreate="always") as batch:
            batch.drop_index(op.f("ix_players_username"))
            batch.drop_index(op.f("ix_players_email"))
            batch.drop_column("handicap")
            batch.drop_column("name")
            batch.drop_column("username")
            batch.drop_column("email")
