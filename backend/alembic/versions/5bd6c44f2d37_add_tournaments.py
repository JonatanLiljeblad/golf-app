"""add tournaments

Revision ID: 5bd6c44f2d37
Revises: c3d4e5f6a7b8
Create Date: 2026-01-14 09:36:46.939668

"""
from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = '5bd6c44f2d37'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tournaments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_player_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["owner_player_id"], ["players.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tournaments_course_id"), "tournaments", ["course_id"], unique=False)
    op.create_index(op.f("ix_tournaments_owner_player_id"), "tournaments", ["owner_player_id"], unique=False)

    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.add_column("rounds", sa.Column("tournament_id", sa.Integer(), nullable=True))
        op.create_index(op.f("ix_rounds_tournament_id"), "rounds", ["tournament_id"], unique=False)
        op.create_foreign_key(
            "fk_rounds_tournament_id",
            "rounds",
            "tournaments",
            ["tournament_id"],
            ["id"],
            ondelete="SET NULL",
        )
    else:
        with op.batch_alter_table("rounds", recreate="always") as batch:
            batch.add_column(sa.Column("tournament_id", sa.Integer(), nullable=True))
            batch.create_index(op.f("ix_rounds_tournament_id"), ["tournament_id"], unique=False)
            batch.create_foreign_key(
                "fk_rounds_tournament_id",
                "tournaments",
                ["tournament_id"],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.drop_constraint("fk_rounds_tournament_id", "rounds", type_="foreignkey")
        op.drop_index(op.f("ix_rounds_tournament_id"), table_name="rounds")
        op.drop_column("rounds", "tournament_id")
    else:
        with op.batch_alter_table("rounds", recreate="always") as batch:
            batch.drop_constraint("fk_rounds_tournament_id", type_="foreignkey")
            batch.drop_index(op.f("ix_rounds_tournament_id"))
            batch.drop_column("tournament_id")

    op.drop_index(op.f("ix_tournaments_owner_player_id"), table_name="tournaments")
    op.drop_index(op.f("ix_tournaments_course_id"), table_name="tournaments")
    op.drop_table("tournaments")
