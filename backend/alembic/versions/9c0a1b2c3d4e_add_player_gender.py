"""add player gender

Revision ID: 9c0a1b2c3d4e
Revises: f25403bfe5c4
Create Date: 2026-01-22 11:19:46.165422

"""
from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = '9c0a1b2c3d4e'
down_revision = 'f25403bfe5c4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.add_column("players", sa.Column("gender", sa.String(length=16), nullable=True))
    else:
        with op.batch_alter_table("players", recreate="always") as batch:
            batch.add_column(sa.Column("gender", sa.String(length=16), nullable=True))


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.drop_column("players", "gender")
    else:
        with op.batch_alter_table("players", recreate="always") as batch:
            batch.drop_column("gender")
