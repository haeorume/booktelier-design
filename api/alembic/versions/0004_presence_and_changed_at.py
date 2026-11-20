"""작업 위치 칸과 바뀐 시각 칸 (F4)

- participant.current_chapter_id, current_paragraph_id: A-30 작업 위치(FR-47). 장이 지워지면 비워요(SET NULL).
- comment.updated_at, suggested_edit.updated_at: A-31 커서. '다시 열기'처럼 시각을 지우는 변경도 잡아요.
  기존 행은 만든 시각으로 채워요.
지우는 변경 없음.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("participant", sa.Column("current_chapter_id", UUID(as_uuid=True), nullable=True))
    op.add_column("participant", sa.Column("current_paragraph_id", sa.Text(), nullable=True))
    op.create_foreign_key(
        "participant_current_chapter_id_fkey",
        "participant",
        "chapter",
        ["current_chapter_id"],
        ["id"],
        ondelete="SET NULL",
    )
    for table in ("comment", "suggested_edit"):
        op.add_column(
            table,
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.execute(f"UPDATE {table} SET updated_at = created_at")


def downgrade() -> None:
    for table in ("suggested_edit", "comment"):
        op.drop_column(table, "updated_at")
    op.drop_constraint("participant_current_chapter_id_fkey", "participant", type_="foreignkey")
    op.drop_column("participant", "current_paragraph_id")
    op.drop_column("participant", "current_chapter_id")
