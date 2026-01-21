"""course tees

Revision ID: 3b2c3a1b9a2f
Revises: b4bedd0b4872
Create Date: 2026-01-21

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "3b2c3a1b9a2f"
down_revision = "b4bedd0b4872"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_tees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tee_name", sa.String(length=64), nullable=False),
        sa.Column("course_rating", sa.Float(), nullable=True),
        sa.Column("slope_rating", sa.Integer(), nullable=True),
        sa.UniqueConstraint("course_id", "tee_name", name="uq_course_tee_name"),
    )
    op.create_index("ix_course_tees_course_id", "course_tees", ["course_id"], unique=False)

    op.create_table(
        "tee_hole_distances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tee_id", sa.Integer(), sa.ForeignKey("course_tees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hole_number", sa.Integer(), nullable=False),
        sa.Column("distance", sa.Integer(), nullable=False),
        sa.UniqueConstraint("tee_id", "hole_number", name="uq_tee_hole_number"),
    )
    op.create_index("ix_tee_hole_distances_tee_id", "tee_hole_distances", ["tee_id"], unique=False)

    op.add_column("rounds", sa.Column("tee_id", sa.Integer(), nullable=True))
    op.create_index("ix_rounds_tee_id", "rounds", ["tee_id"])
    op.create_foreign_key(
        "fk_rounds_tee_id",
        "rounds",
        "course_tees",
        ["tee_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_rounds_tee_id", "rounds", type_="foreignkey")
    op.drop_index("ix_rounds_tee_id", table_name="rounds")
    op.drop_column("rounds", "tee_id")

    op.drop_index("ix_tee_hole_distances_tee_id", table_name="tee_hole_distances")
    op.drop_table("tee_hole_distances")

    op.drop_index("ix_course_tees_course_id", table_name="course_tees")
    op.drop_table("course_tees")
