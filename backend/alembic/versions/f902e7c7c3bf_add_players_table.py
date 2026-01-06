"""add players table

Revision ID: f902e7c7c3bf
Revises: 8c6f3f2c4a1b
Create Date: 2026-01-07 00:18:31.460925

"""
from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = 'f902e7c7c3bf'
down_revision = '8c6f3f2c4a1b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "players",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id", name="uq_players_external_id"),
    )
    op.create_index(op.f("ix_players_external_id"), "players", ["external_id"], unique=True)

    # Backfill players from existing string-based identity columns.
    dialect = op.get_bind().dialect.name
    select_external_ids = (
        "SELECT user_id AS external_id FROM courses "
        "UNION SELECT user_id AS external_id FROM rounds "
        "UNION SELECT user_id AS external_id FROM round_participants "
        "UNION SELECT player_id AS external_id FROM hole_scores"
    )
    if dialect == "postgresql":
        op.execute(
            "INSERT INTO players (external_id) "
            f"SELECT DISTINCT external_id FROM ({select_external_ids}) s "
            "ON CONFLICT (external_id) DO NOTHING"
        )
    else:
        # SQLite
        op.execute(
            "INSERT OR IGNORE INTO players (external_id) "
            f"SELECT DISTINCT external_id FROM ({select_external_ids})"
        )

    # Add new internal FK columns (nullable during backfill).
    op.add_column("courses", sa.Column("owner_player_id", sa.Integer(), nullable=True))
    op.add_column("rounds", sa.Column("owner_player_id", sa.Integer(), nullable=True))
    op.add_column("round_participants", sa.Column("player_id", sa.Integer(), nullable=True))
    op.add_column("hole_scores", sa.Column("player_id_int", sa.Integer(), nullable=True))

    op.execute(
        "UPDATE courses SET owner_player_id = "
        "(SELECT id FROM players WHERE players.external_id = courses.user_id)"
    )
    op.execute(
        "UPDATE rounds SET owner_player_id = "
        "(SELECT id FROM players WHERE players.external_id = rounds.user_id)"
    )
    op.execute(
        "UPDATE round_participants SET player_id = "
        "(SELECT id FROM players WHERE players.external_id = round_participants.user_id)"
    )
    op.execute(
        "UPDATE hole_scores SET player_id_int = "
        "(SELECT id FROM players WHERE players.external_id = hole_scores.player_id)"
    )

    # Recreate tables to drop old string columns and add FK constraints.
    with op.batch_alter_table("courses", recreate="always") as batch:
        batch.drop_index(op.f("ix_courses_user_id"))
        batch.drop_column("user_id")
        batch.alter_column("owner_player_id", nullable=False)
        batch.create_foreign_key(
            "fk_courses_owner_player_id_players",
            "players",
            ["owner_player_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_index(op.f("ix_courses_owner_player_id"), ["owner_player_id"], unique=False)

    with op.batch_alter_table("rounds", recreate="always") as batch:
        batch.drop_index(op.f("ix_rounds_user_id"))
        batch.drop_column("user_id")
        batch.alter_column("owner_player_id", nullable=False)
        batch.create_foreign_key(
            "fk_rounds_owner_player_id_players",
            "players",
            ["owner_player_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_index(op.f("ix_rounds_owner_player_id"), ["owner_player_id"], unique=False)

    with op.batch_alter_table("round_participants", recreate="always") as batch:
        batch.drop_index(op.f("ix_round_participants_user_id"))
        batch.drop_column("user_id")
        batch.alter_column("player_id", nullable=False)
        batch.drop_constraint("uq_round_participant", type_="unique")
        batch.create_unique_constraint("uq_round_participant", ["round_id", "player_id"])
        batch.create_foreign_key(
            "fk_round_participants_player_id_players",
            "players",
            ["player_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_index(op.f("ix_round_participants_player_id"), ["player_id"], unique=False)

    with op.batch_alter_table("hole_scores", recreate="always") as batch:
        batch.drop_index(op.f("ix_hole_scores_player_id"))
        batch.drop_constraint("uq_score_round_player_hole", type_="unique")
        batch.drop_column("player_id")
        batch.alter_column("player_id_int", new_column_name="player_id", nullable=False)
        batch.create_foreign_key(
            "fk_hole_scores_player_id_players",
            "players",
            ["player_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_unique_constraint(
            "uq_score_round_player_hole", ["round_id", "player_id", "hole_number"]
        )
        batch.create_index(op.f("ix_hole_scores_player_id"), ["player_id"], unique=False)


def downgrade() -> None:
    # Best-effort downgrade back to string identifiers.
    op.add_column("courses", sa.Column("user_id", sa.String(length=128), nullable=True))
    op.add_column("rounds", sa.Column("user_id", sa.String(length=128), nullable=True))
    op.add_column("round_participants", sa.Column("user_id", sa.String(length=128), nullable=True))
    op.add_column("hole_scores", sa.Column("player_id_str", sa.String(length=128), nullable=True))

    op.execute(
        "UPDATE courses SET user_id = "
        "(SELECT external_id FROM players WHERE players.id = courses.owner_player_id)"
    )
    op.execute(
        "UPDATE rounds SET user_id = "
        "(SELECT external_id FROM players WHERE players.id = rounds.owner_player_id)"
    )
    op.execute(
        "UPDATE round_participants SET user_id = "
        "(SELECT external_id FROM players WHERE players.id = round_participants.player_id)"
    )
    op.execute(
        "UPDATE hole_scores SET player_id_str = "
        "(SELECT external_id FROM players WHERE players.id = hole_scores.player_id)"
    )

    with op.batch_alter_table("courses", recreate="always") as batch:
        batch.drop_index(op.f("ix_courses_owner_player_id"))
        batch.drop_constraint("fk_courses_owner_player_id_players", type_="foreignkey")
        batch.drop_column("owner_player_id")
        batch.alter_column("user_id", nullable=False, server_default="dev-user")
        batch.create_index(op.f("ix_courses_user_id"), ["user_id"], unique=False)

    with op.batch_alter_table("rounds", recreate="always") as batch:
        batch.drop_index(op.f("ix_rounds_owner_player_id"))
        batch.drop_constraint("fk_rounds_owner_player_id_players", type_="foreignkey")
        batch.drop_column("owner_player_id")
        batch.alter_column("user_id", nullable=False, server_default="dev-user")
        batch.create_index(op.f("ix_rounds_user_id"), ["user_id"], unique=False)

    with op.batch_alter_table("round_participants", recreate="always") as batch:
        batch.drop_index(op.f("ix_round_participants_player_id"))
        batch.drop_constraint("fk_round_participants_player_id_players", type_="foreignkey")
        batch.drop_constraint("uq_round_participant", type_="unique")
        batch.drop_column("player_id")
        batch.alter_column("user_id", nullable=False)
        batch.create_unique_constraint("uq_round_participant", ["round_id", "user_id"])
        batch.create_index(op.f("ix_round_participants_user_id"), ["user_id"], unique=False)

    with op.batch_alter_table("hole_scores", recreate="always") as batch:
        batch.drop_index(op.f("ix_hole_scores_player_id"))
        batch.drop_constraint("fk_hole_scores_player_id_players", type_="foreignkey")
        batch.drop_constraint("uq_score_round_player_hole", type_="unique")
        batch.drop_column("player_id")
        batch.alter_column("player_id_str", new_column_name="player_id", nullable=False, server_default="dev-user")
        batch.create_unique_constraint(
            "uq_score_round_player_hole", ["round_id", "player_id", "hole_number"]
        )
        batch.create_index(op.f("ix_hole_scores_player_id"), ["player_id"], unique=False)

    op.drop_index(op.f("ix_players_external_id"), table_name="players")
    op.drop_table("players")
