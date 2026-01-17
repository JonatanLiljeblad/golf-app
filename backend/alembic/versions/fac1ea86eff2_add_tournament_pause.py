"""add tournament pause

Revision ID: fac1ea86eff2
Revises: 861a45b5bde5
Create Date: 2026-01-17 02:20:24.178000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "fac1ea86eff2"
down_revision = "861a45b5bde5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.add_column("tournaments", sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column("tournaments", sa.Column("pause_message", sa.String(length=280), nullable=True))
    else:
        with op.batch_alter_table("tournaments", recreate="always") as batch:
            batch.add_column(sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True))
            batch.add_column(sa.Column("pause_message", sa.String(length=280), nullable=True))


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.drop_column("tournaments", "pause_message")
        op.drop_column("tournaments", "paused_at")
    else:
        with op.batch_alter_table("tournaments", recreate="always") as batch:
            batch.drop_column("pause_message")
            batch.drop_column("paused_at")
