"""add round statistics

Revision ID: 306e55708d9f
Revises: fac1ea86eff2
Create Date: 2026-01-16 22:45:56.637567

"""
from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = '306e55708d9f'
down_revision = 'fac1ea86eff2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rounds",
        sa.Column("stats_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("hole_scores", sa.Column("putts", sa.Integer(), nullable=True))
    op.add_column("hole_scores", sa.Column("fairway", sa.String(length=16), nullable=True))
    op.add_column("hole_scores", sa.Column("gir", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("hole_scores", "gir")
    op.drop_column("hole_scores", "fairway")
    op.drop_column("hole_scores", "putts")
    op.drop_column("rounds", "stats_enabled")
