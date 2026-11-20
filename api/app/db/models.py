"""테이블 모델 12개(rag_chunk는 F6). 칸은 data-contract '4. 필드', 키·색인은 db 탭 3번.

ON DELETE(11.21 정모 결정, F1):
- 책 아래(장·참여자·링크·원칙·검토본·의견·제안 …)는 CASCADE. MVP에는 지우는 API가 없어 정리할 때만 쓰여요.
- 참여자를 가리키는 칸 중 비어도 되는 칸(layout_updated_by, decided_by, resolved_by)과 ai_origin_id는 SET NULL.
- 참여자를 가리키는 필수 칸(created_by, author_id, owner_participant_id)은 NOT NULL이라 CASCADE.
- event는 FK 없이 id만 남겨요(db 2번).

시각은 모두 서버가 정해요(timestamptz, D-28). 원고 글자(doc)는 event에 넣지 않아요.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

Json = dict[str, Any]


def _now() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


def _ts() -> Mapped[datetime | None]:
    return mapped_column(DateTime(timezone=True), nullable=True)


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True)


def _fk(target: str, ondelete: str, nullable: bool = False) -> Mapped[Any]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey(target, ondelete=ondelete), nullable=nullable
    )


class Project(Base):
    __tablename__ = "project"

    id: Mapped[uuid.UUID] = _pk()
    title: Mapped[str] = mapped_column(Text, nullable=False)
    template_id: Mapped[str] = mapped_column(Text, nullable=False)
    layout: Mapped[Json] = mapped_column(JSONB, nullable=False, server_default="{}")
    # participant가 project를 가리키고 project도 participant를 가리켜서 use_alter로 나중에 걸어요.
    layout_updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "participant.id",
            ondelete="SET NULL",
            use_alter=True,
            name="project_layout_updated_by_fkey",
        ),
        nullable=True,
    )
    layout_updated_at: Mapped[datetime | None] = _ts()
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()


class Participant(Base):
    __tablename__ = "participant"

    id: Mapped[uuid.UUID] = _pk()
    project_id: Mapped[uuid.UUID] = _fk("project.id", "CASCADE")
    role: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    anon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = _now()
    last_seen_at: Mapped[datetime | None] = _ts()


class RoleLink(Base):
    """초대 링크. token 원문도 저장해요(D-37). 찾기는 token_hash로."""

    __tablename__ = "role_link"
    __table_args__ = (
        # 책·역할마다 쓸 수 있는(취소 안 된) 링크는 하나(FR-08 ③, S-03)
        Index(
            "uq_role_link_active_role",
            "project_id",
            "role",
            unique=True,
            postgresql_where=sql_text("revoked_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = _pk()
    project_id: Mapped[uuid.UUID] = _fk("project.id", "CASCADE")
    role: Mapped[str] = mapped_column(Text, nullable=False)
    token: Mapped[str] = mapped_column(Text, nullable=False)
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = _now()
    revoked_at: Mapped[datetime | None] = _ts()


class Chapter(Base):
    __tablename__ = "chapter"
    __table_args__ = (
        UniqueConstraint("project_id", "sort_order", name="uq_chapter_project_sort_order"),
    )

    id: Mapped[uuid.UUID] = _pk()
    project_id: Mapped[uuid.UUID] = _fk("project.id", "CASCADE")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="editing")
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    doc: Mapped[Json] = mapped_column(JSONB, nullable=False)
    status_changed_at: Mapped[datetime | None] = _ts()
    updated_at: Mapped[datetime] = _now()


class ChapterRevision(Base):
    __tablename__ = "chapter_revision"
    __table_args__ = (
        UniqueConstraint("chapter_id", "version", name="uq_chapter_revision_chapter_version"),
    )

    id: Mapped[uuid.UUID] = _pk()
    chapter_id: Mapped[uuid.UUID] = _fk("chapter.id", "CASCADE")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    doc: Mapped[Json] = mapped_column(JSONB, nullable=False)
    cause: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID] = _fk("participant.id", "CASCADE")
    created_at: Mapped[datetime] = _now()


class AiSuggestion(Base):
    __tablename__ = "ai_suggestion"
    __table_args__ = (
        Index("ix_ai_suggestion_owner_chapter", "owner_participant_id", "chapter_id"),
    )

    id: Mapped[uuid.UUID] = _pk()
    chapter_id: Mapped[uuid.UUID] = _fk("chapter.id", "CASCADE")
    owner_participant_id: Mapped[uuid.UUID] = _fk("participant.id", "CASCADE")
    anchor: Mapped[Json] = mapped_column(JSONB, nullable=False)
    original: Mapped[str] = mapped_column(Text, nullable=False)
    replacement: Mapped[str] = mapped_column(Text, nullable=False)
    alternatives: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[Json | None] = mapped_column(JSONB, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    target_role: Mapped[str] = mapped_column(Text, nullable=False)
    base_version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _now()
    decided_at: Mapped[datetime | None] = _ts()


class SuggestedEdit(Base):
    __tablename__ = "suggested_edit"
    __table_args__ = (Index("ix_suggested_edit_chapter_status", "chapter_id", "status"),)

    id: Mapped[uuid.UUID] = _pk()
    chapter_id: Mapped[uuid.UUID] = _fk("chapter.id", "CASCADE")
    author_id: Mapped[uuid.UUID] = _fk("participant.id", "CASCADE")
    anchor: Mapped[Json] = mapped_column(JSONB, nullable=False)
    original: Mapped[str] = mapped_column(Text, nullable=False)
    replacement: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    kind: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    ai_origin_id: Mapped[uuid.UUID | None] = _fk("ai_suggestion.id", "SET NULL", nullable=True)
    base_version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = _now()
    decided_at: Mapped[datetime | None] = _ts()
    decided_by: Mapped[uuid.UUID | None] = _fk("participant.id", "SET NULL", nullable=True)


class Comment(Base):
    __tablename__ = "comment"
    __table_args__ = (Index("ix_comment_chapter_status", "chapter_id", "status"),)

    id: Mapped[uuid.UUID] = _pk()
    chapter_id: Mapped[uuid.UUID] = _fk("chapter.id", "CASCADE")
    author_id: Mapped[uuid.UUID] = _fk("participant.id", "CASCADE")
    parent_id: Mapped[uuid.UUID | None] = _fk("comment.id", "CASCADE", nullable=True)
    anchor: Mapped[Json | None] = mapped_column(JSONB, nullable=True)  # 답글은 비움
    original: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="open")
    ai_origin_id: Mapped[uuid.UUID | None] = _fk("ai_suggestion.id", "SET NULL", nullable=True)
    created_at: Mapped[datetime] = _now()
    resolved_at: Mapped[datetime | None] = _ts()
    resolved_by: Mapped[uuid.UUID | None] = _fk("participant.id", "SET NULL", nullable=True)


class StyleRule(Base):
    __tablename__ = "style_rule"

    id: Mapped[uuid.UUID] = _pk()
    project_id: Mapped[uuid.UUID] = _fk("project.id", "CASCADE")
    type: Mapped[str] = mapped_column(Text, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID] = _fk("participant.id", "CASCADE")
    created_at: Mapped[datetime] = _now()


class Snapshot(Base):
    __tablename__ = "snapshot"

    id: Mapped[uuid.UUID] = _pk()
    chapter_id: Mapped[uuid.UUID] = _fk("chapter.id", "CASCADE")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    doc: Mapped[Json] = mapped_column(JSONB, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID] = _fk("participant.id", "CASCADE")
    created_at: Mapped[datetime] = _now()


class FirstView(Base):
    __tablename__ = "first_view"
    __table_args__ = (PrimaryKeyConstraint("target_type", "target_id", "participant_id"),)

    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    participant_id: Mapped[uuid.UUID] = _fk("participant.id", "CASCADE")
    first_viewed_at: Mapped[datetime] = _now()


class Event(Base):
    """행동 기록. events 탭 '1. 공통 칸'. FK 없이 id만 남겨요(db 2번)."""

    __tablename__ = "event"
    __table_args__ = (Index("ix_event_project_server_ts", "project_id", "server_ts"),)

    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    ts: Mapped[int] = mapped_column(BigInteger, nullable=False)  # 브라우저 시각(ms)
    anon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    participant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    role: Mapped[str | None] = mapped_column(Text, nullable=True)
    path: Mapped[str] = mapped_column(Text, nullable=False)
    props: Mapped[Json | None] = mapped_column(JSONB, nullable=True)
    server_ts: Mapped[datetime] = _now()
    chapter_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    status_after: Mapped[str | None] = mapped_column(Text, nullable=True)
