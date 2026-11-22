"""rag_chunk 표 (F6 RAG, D-26)

AI가 근거로 찾아 쓰는 글 조각과 벡터. 임베딩은 text-embedding-3-small(1536차원, '정할 것' 26).
- source: norm(어문 규범 조항) · chapter(같은 책의 다른 장 문단)
- 색인: (source, project_id, chapter_id)로 먼저 거르고, embedding은 HNSW 코사인 거리(db 탭 3번)
- 책·장이 지워지면 조각도 지워요(CASCADE). 지우는 변경 없음. pgvector 확장은 0001에서 켰어요.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rag_chunk",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("project.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "chapter_id",
            UUID(as_uuid=True),
            sa.ForeignKey("chapter.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("chapter_version", sa.Integer(), nullable=True),
        sa.Column("paragraph_id", sa.Text(), nullable=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_rag_chunk_source_project_chapter", "rag_chunk", ["source", "project_id", "chapter_id"]
    )
    op.create_index(
        "ix_rag_chunk_embedding_hnsw",
        "rag_chunk",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_rag_chunk_embedding_hnsw", table_name="rag_chunk")
    op.drop_index("ix_rag_chunk_source_project_chapter", table_name="rag_chunk")
    op.drop_table("rag_chunk")
