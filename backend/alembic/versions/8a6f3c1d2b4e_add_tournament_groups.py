"""add tournament groups

Revision ID: 8a6f3c1d2b4e
Revises: 306e55708d9f
Create Date: 2026-01-20

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8a6f3c1d2b4e"
down_revision = "306e55708d9f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tournament_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tournament_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tournament_id"], ["tournaments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_tournament_groups_tournament_id"),
        "tournament_groups",
        ["tournament_id"],
        unique=False,
    )

    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.add_column("rounds", sa.Column("tournament_group_id", sa.Integer(), nullable=True))
        op.create_index(op.f("ix_rounds_tournament_group_id"), "rounds", ["tournament_group_id"], unique=False)
        op.create_foreign_key(
            "fk_rounds_tournament_group_id",
            "rounds",
            "tournament_groups",
            ["tournament_group_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_unique_constraint("uq_rounds_tournament_group_id", "rounds", ["tournament_group_id"])
    else:
        with op.batch_alter_table("rounds", recreate="always") as batch:
            batch.add_column(sa.Column("tournament_group_id", sa.Integer(), nullable=True))
            batch.create_index(op.f("ix_rounds_tournament_group_id"), ["tournament_group_id"], unique=False)
            batch.create_foreign_key(
                "fk_rounds_tournament_group_id",
                "tournament_groups",
                ["tournament_group_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch.create_unique_constraint("uq_rounds_tournament_group_id", ["tournament_group_id"])


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.drop_constraint("uq_rounds_tournament_group_id", "rounds", type_="unique")
        op.drop_constraint("fk_rounds_tournament_group_id", "rounds", type_="foreignkey")
        op.drop_index(op.f("ix_rounds_tournament_group_id"), table_name="rounds")
        op.drop_column("rounds", "tournament_group_id")
    else:
        with op.batch_alter_table("rounds", recreate="always") as batch:
            batch.drop_constraint("uq_rounds_tournament_group_id", type_="unique")
            batch.drop_constraint("fk_rounds_tournament_group_id", type_="foreignkey")
            batch.drop_index(op.f("ix_rounds_tournament_group_id"))
            batch.drop_column("tournament_group_id")

    op.drop_index(op.f("ix_tournament_groups_tournament_id"), table_name="tournament_groups")
    op.drop_table("tournament_groups")
