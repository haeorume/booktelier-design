"""ai_suggestion에 실행 취소 칸 두 개 (F5)

A-20 undo는 '바로 앞 동작일 때만' 되돌려요(X-04). 그러려면 적용으로 만든 원고 버전과 넣은 글자를 알아야 해요.
지우는 변경 없음. 둘 다 비어도 되는 칸이라 기존 행은 그대로예요.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("ai_suggestion", sa.Column("applied_version", sa.Integer(), nullable=True))
    op.add_column("ai_suggestion", sa.Column("applied_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_suggestion", "applied_text")
    op.drop_column("ai_suggestion", "applied_version")
