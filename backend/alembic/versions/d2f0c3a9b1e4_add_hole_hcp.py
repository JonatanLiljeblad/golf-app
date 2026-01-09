"""add hole distance and hcp

Revision ID: d2f0c3a9b1e4
Revises: c1a2b3c4d5e6
Create Date: 2026-01-09

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d2f0c3a9b1e4"
down_revision = "c1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.add_column("holes", sa.Column("distance", sa.Integer(), nullable=True))
        op.add_column("holes", sa.Column("hcp", sa.Integer(), nullable=True))
    else:
        with op.batch_alter_table("holes", recreate="always") as batch:
            batch.add_column(sa.Column("distance", sa.Integer(), nullable=True))
            batch.add_column(sa.Column("hcp", sa.Integer(), nullable=True))


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.drop_column("holes", "hcp")
        op.drop_column("holes", "distance")
    else:
        with op.batch_alter_table("holes", recreate="always") as batch:
            batch.drop_column("hcp")
            batch.drop_column("distance")
