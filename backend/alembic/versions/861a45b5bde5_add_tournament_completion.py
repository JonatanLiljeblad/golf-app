"""add tournament completion

Revision ID: 861a45b5bde5
Revises: ada688927640
Create Date: 2026-01-17 02:20:24.178000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "861a45b5bde5"
down_revision = "ada688927640"
branch_labels = None
depends_on = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.add_column("tournaments", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    else:
        with op.batch_alter_table("tournaments", recreate="always") as batch:
            batch.add_column(sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.drop_column("tournaments", "completed_at")
    else:
        with op.batch_alter_table("tournaments", recreate="always") as batch:
            batch.drop_column("completed_at")
