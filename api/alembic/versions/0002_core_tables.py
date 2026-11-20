"""핵심 테이블 12개 (F1)

app/db/models.py와 같은 모양으로 손으로 적었어요. 맞는지는 tests/test_migrations.py가
마이그레이션을 올린 DB와 모델을 비교해서 확인해요(DB 테스트).
rag_chunk는 F6에서 만들어요(D-26).

ON DELETE: 책 아래는 CASCADE, 비어도 되는 참여자 칸·ai_origin_id는 SET NULL. event는 FK 없음(db 2번).

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _id() -> sa.Column:
    return sa.Column("id", UUID(as_uuid=True), primary_key=True)


def _fk(name: str, target: str, ondelete: str, nullable: bool = False) -> sa.Column:
    return sa.Column(
        name, UUID(as_uuid=True), sa.ForeignKey(target, ondelete=ondelete), nullable=nullable
    )


def _now(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def _ts(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=True)


def _text(name: str, nullable: bool = False, default: str | None = None) -> sa.Column:
    return sa.Column(name, sa.Text(), nullable=nullable, server_default=default)


def upgrade() -> None:
    op.create_table(
        "project",
        _id(),
        _text("title"),
        _text("template_id"),
        sa.Column("layout", JSONB(), nullable=False, server_default="{}"),
        sa.Column("layout_updated_by", UUID(as_uuid=True), nullable=True),  # FK는 participant 뒤에
        _ts("layout_updated_at"),
        _now("created_at"),
        _now("updated_at"),
    )
    op.create_table(
        "participant",
        _id(),
        _fk("project_id", "project.id", "CASCADE"),
        _text("role"),
        _text("display_name"),
        sa.Column("anon_id", UUID(as_uuid=True), nullable=False),
        _text("token_hash"),
        _now("created_at"),
        _ts("last_seen_at"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_foreign_key(
        "project_layout_updated_by_fkey",
        "project",
        "participant",
        ["layout_updated_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "role_link",
        _id(),
        _fk("project_id", "project.id", "CASCADE"),
        _text("role"),
        _text("token"),  # 원문도 저장(D-37)
        _text("token_hash"),
        _now("created_at"),
        _ts("revoked_at"),
        sa.UniqueConstraint("token_hash"),
    )
    # 책·역할마다 쓸 수 있는(취소 안 된) 링크는 하나(FR-08 ③, S-03). 자동 생성이 못 적는 부분 색인.
    op.create_index(
        "uq_role_link_active_role",
        "role_link",
        ["project_id", "role"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_table(
        "chapter",
        _id(),
        _fk("project_id", "project.id", "CASCADE"),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        _text("title"),
        _text("status", default="editing"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("doc", JSONB(), nullable=False),
        _ts("status_changed_at"),
        _now("updated_at"),
        sa.UniqueConstraint("project_id", "sort_order", name="uq_chapter_project_sort_order"),
    )
    op.create_table(
        "chapter_revision",
        _id(),
        _fk("chapter_id", "chapter.id", "CASCADE"),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("doc", JSONB(), nullable=False),
        _text("cause"),
        _fk("created_by", "participant.id", "CASCADE"),
        _now("created_at"),
        sa.UniqueConstraint("chapter_id", "version", name="uq_chapter_revision_chapter_version"),
    )
    op.create_table(
        "ai_suggestion",
        _id(),
        _fk("chapter_id", "chapter.id", "CASCADE"),
        _fk("owner_participant_id", "participant.id", "CASCADE"),
        sa.Column("anchor", JSONB(), nullable=False),
        _text("original"),
        _text("replacement"),
        sa.Column("alternatives", JSONB(), nullable=True),
        _text("kind"),
        _text("reason"),
        sa.Column("evidence", JSONB(), nullable=True),
        _text("source"),
        _text("target_role"),
        sa.Column("base_version", sa.Integer(), nullable=False),
        _text("status", default="pending"),
        _text("status_reason", nullable=True),
        _text("model", nullable=True),
        _now("created_at"),
        _ts("decided_at"),
    )
    op.create_index(
        "ix_ai_suggestion_owner_chapter", "ai_suggestion", ["owner_participant_id", "chapter_id"]
    )
    op.create_table(
        "suggested_edit",
        _id(),
        _fk("chapter_id", "chapter.id", "CASCADE"),
        _fk("author_id", "participant.id", "CASCADE"),
        sa.Column("anchor", JSONB(), nullable=False),
        _text("original"),
        _text("replacement"),
        _text("reason", nullable=True),
        _text("kind", nullable=True),
        _text("status", default="pending"),
        _fk("ai_origin_id", "ai_suggestion.id", "SET NULL", nullable=True),
        sa.Column("base_version", sa.Integer(), nullable=False),
        _now("created_at"),
        _ts("decided_at"),
        _fk("decided_by", "participant.id", "SET NULL", nullable=True),
    )
    op.create_index("ix_suggested_edit_chapter_status", "suggested_edit", ["chapter_id", "status"])
    op.create_table(
        "comment",
        _id(),
        _fk("chapter_id", "chapter.id", "CASCADE"),
        _fk("author_id", "participant.id", "CASCADE"),
        _fk("parent_id", "comment.id", "CASCADE", nullable=True),
        sa.Column("anchor", JSONB(), nullable=True),
        _text("original", nullable=True),
        _text("body"),
        _text("status", default="open"),
        _fk("ai_origin_id", "ai_suggestion.id", "SET NULL", nullable=True),
        _now("created_at"),
        _ts("resolved_at"),
        _fk("resolved_by", "participant.id", "SET NULL", nullable=True),
    )
    op.create_index("ix_comment_chapter_status", "comment", ["chapter_id", "status"])
    op.create_table(
        "style_rule",
        _id(),
        _fk("project_id", "project.id", "CASCADE"),
        _text("type"),
        _text("text"),
        _fk("created_by", "participant.id", "CASCADE"),
        _now("created_at"),
    )
    op.create_table(
        "snapshot",
        _id(),
        _fk("chapter_id", "chapter.id", "CASCADE"),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("doc", JSONB(), nullable=False),
        _text("label"),
        _fk("created_by", "participant.id", "CASCADE"),
        _now("created_at"),
    )
    op.create_table(
        "first_view",
        _text("target_type"),
        sa.Column("target_id", UUID(as_uuid=True), nullable=False),
        _fk("participant_id", "participant.id", "CASCADE"),
        _now("first_viewed_at"),
        sa.PrimaryKeyConstraint("target_type", "target_id", "participant_id"),
    )
    op.create_table(
        "event",
        sa.Column("event_id", UUID(as_uuid=True), primary_key=True),
        _text("name"),
        sa.Column("ts", sa.BigInteger(), nullable=False),
        sa.Column("anon_id", UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", UUID(as_uuid=True), nullable=False),
        sa.Column("participant_id", UUID(as_uuid=True), nullable=True),
        sa.Column("project_id", UUID(as_uuid=True), nullable=True),
        sa.Column("chapter_id", UUID(as_uuid=True), nullable=True),
        _text("role", nullable=True),
        _text("path"),
        sa.Column("props", JSONB(), nullable=True),
        _now("server_ts"),
        sa.Column("chapter_version", sa.Integer(), nullable=True),
        _text("target_type", nullable=True),
        sa.Column("target_id", UUID(as_uuid=True), nullable=True),
        _text("status_after", nullable=True),
    )
    op.create_index("ix_event_project_server_ts", "event", ["project_id", "server_ts"])


def downgrade() -> None:
    # 만든 순서의 거꾸로. project ↔ participant는 서로 가리켜서 FK를 먼저 풀어요.
    op.drop_index("ix_event_project_server_ts", table_name="event")
    op.drop_table("event")
    op.drop_table("first_view")
    op.drop_table("snapshot")
    op.drop_table("style_rule")
    op.drop_index("ix_comment_chapter_status", table_name="comment")
    op.drop_table("comment")
    op.drop_index("ix_suggested_edit_chapter_status", table_name="suggested_edit")
    op.drop_table("suggested_edit")
    op.drop_index("ix_ai_suggestion_owner_chapter", table_name="ai_suggestion")
    op.drop_table("ai_suggestion")
    op.drop_table("chapter_revision")
    op.drop_table("chapter")
    # 이 색인은 0002를 처음 올린 뒤(Codex 검수 11.21)에 더해서, 없는 DB에서도 내려가게 if_exists
    op.drop_index("uq_role_link_active_role", table_name="role_link", if_exists=True)
    op.drop_table("role_link")
    op.drop_constraint("project_layout_updated_by_fkey", "project", type_="foreignkey")
    op.drop_table("participant")
    op.drop_table("project")
