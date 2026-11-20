"""DB 행 → API 모델. 해시 칸(token_hash)은 여기서 옮기지 않아요(D-24, S-04)."""

from typing import Any

from app.config import get_settings
from app.schemas import review
from app.schemas.invite import Invite
from app.schemas.layout import Layout
from app.schemas.project import (
    Chapter,
    ChapterSummary,
    Participant,
    Project,
    Snapshot,
    SnapshotSummary,
)


def web_url(path: str) -> str:
    return get_settings().web_url.rstrip("/") + path


def project(row: Any) -> Project:
    return Project(
        id=row.id,
        title=row.title,
        template_id=row.template_id,
        layout=Layout.model_validate(row.layout or {}),
        layout_updated_by=row.layout_updated_by,
        layout_updated_at=row.layout_updated_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def chapter_summary(row: Any) -> ChapterSummary:
    return ChapterSummary(
        id=row.id,
        project_id=row.project_id,
        order=row.sort_order,
        title=row.title,
        status=row.status,
        version=row.version,
        status_changed_at=row.status_changed_at,
        updated_at=row.updated_at,
    )


def chapter(row: Any) -> Chapter:
    return Chapter(**chapter_summary(row).model_dump(), doc=row.doc)


def participant(row: Any) -> Participant:
    return Participant(
        id=row.id,
        project_id=row.project_id,
        role=row.role,
        display_name=row.display_name,
        created_at=row.created_at,
        last_seen_at=row.last_seen_at,
    )


def invite(row: Any) -> Invite:
    return Invite(
        id=row.id,
        project_id=row.project_id,
        role=row.role,
        url=web_url(f"/j/{row.token}"),
        state="revoked" if row.revoked_at is not None else "active",
        created_at=row.created_at,
        revoked_at=row.revoked_at,
    )


def snapshot_summary(row: Any) -> SnapshotSummary:
    return SnapshotSummary(
        id=row.id,
        chapter_id=row.chapter_id,
        version=row.version,
        label=row.label,
        created_by=row.created_by,
        created_at=row.created_at,
    )


def snapshot(row: Any) -> Snapshot:
    return Snapshot(**snapshot_summary(row).model_dump(), doc=row.doc)


def ai_suggestion(row: Any) -> review.AiSuggestion:
    return review.AiSuggestion(
        id=row.id,
        chapter_id=row.chapter_id,
        owner_participant_id=row.owner_participant_id,
        anchor=review.Anchor(**row.anchor),
        original=row.original,
        replacement=row.replacement,
        alternatives=list(row.alternatives or []),
        kind=row.kind,
        reason=row.reason,
        evidence=row.evidence,
        source=row.source,
        target_role=row.target_role,
        base_version=row.base_version,
        status=row.status,
        created_at=row.created_at,
        decided_at=row.decided_at,
    )


def comment(row: Any, anchor: dict[str, Any] | None = None) -> review.Comment:
    a = anchor if anchor is not None else row.anchor
    return review.Comment(
        id=row.id,
        chapter_id=row.chapter_id,
        author_id=row.author_id,
        parent_id=row.parent_id,
        anchor=review.Anchor(**a) if a else None,
        original=row.original,
        body=row.body,
        status=row.status,
        ai_origin_id=row.ai_origin_id,
        created_at=row.created_at,
        resolved_at=row.resolved_at,
        resolved_by=row.resolved_by,
    )


def suggested_edit(row: Any) -> review.SuggestedEdit:
    return review.SuggestedEdit(
        id=row.id,
        chapter_id=row.chapter_id,
        author_id=row.author_id,
        anchor=review.Anchor(**row.anchor),
        original=row.original,
        replacement=row.replacement,
        reason=row.reason,
        kind=row.kind,
        status=row.status,
        ai_origin_id=row.ai_origin_id,
        base_version=row.base_version,
        created_at=row.created_at,
        decided_at=row.decided_at,
        decided_by=row.decided_by,
    )


def style_rule(row: Any) -> review.StyleRule:
    return review.StyleRule(
        id=row.id,
        project_id=row.project_id,
        type=row.type,
        text=row.text,
        created_by=row.created_by,
        created_at=row.created_at,
    )
