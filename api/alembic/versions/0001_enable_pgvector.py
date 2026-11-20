"""pgvector 확장 켜기

Alembic 자동 생성은 확장(extension)을 만들지 않아서 직접 적어요(D-26).
rag_chunk 테이블은 임베딩 모델이 정해진 뒤 F6에서 만들어요('정할 것' 26번).

Revision ID: 0001
Revises:
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS vector")
