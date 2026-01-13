"""add course archiving

Revision ID: c3d4e5f6a7b8
Revises: f1a9c2d3e4b5
Create Date: 2026-01-12

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c3d4e5f6a7b8"
down_revision = "f1a9c2d3e4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_courses_archived_at"), "courses", ["archived_at"], unique=False)


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.drop_index(op.f("ix_courses_archived_at"), table_name="courses")
        op.drop_column("courses", "archived_at")
    else:
        with op.batch_alter_table("courses", recreate="always") as batch:
            batch.drop_index(op.f("ix_courses_archived_at"))
            batch.drop_column("archived_at")
