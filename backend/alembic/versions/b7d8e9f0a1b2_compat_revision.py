"""compat revision placeholder

Revision ID: b7d8e9f0a1b2
Revises: d2f0c3a9b1e4
Create Date: 2026-01-12

This revision is a no-op placeholder to keep existing local/dev databases that were
stamped with `b7d8e9f0a1b2` upgradeable after the migration file was lost/renamed.

"""


# revision identifiers, used by Alembic.
revision = "b7d8e9f0a1b2"
down_revision = "d2f0c3a9b1e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
