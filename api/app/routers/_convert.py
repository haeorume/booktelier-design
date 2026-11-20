"""DB 행 → API 모델. 해시 칸(token_hash)은 여기서 옮기지 않아요(D-24, S-04)."""

from typing import Any

from app.config import get_settings
from app.schemas.invite import Invite
from app.schemas.layout import Layout
from app.schemas.project import Chapter, ChapterSummary, Participant, Project


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
