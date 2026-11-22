"""함께 작업 API(A-30, A-31). 몇 초 간격 새로 읽기(D-31). 위치는 이벤트로 쌓지 않아요(FR-47)."""

from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.auth.token import Me
from app.db import chapters as chapter_db
from app.db import live as live_db
from app.db.session import DbSession
from app.errors import AppError
from app.routers import _convert
from app.routers.projects import _project_of
from app.schemas.common import error_responses
from app.schemas.layout import Layout
from app.schemas.live import (
    CURSOR_OVERLAP_SECONDS,
    PRESENCE_TTL_SECONDS,
    ChangesOut,
    Presence,
    PresenceIn,
)

router = APIRouter(tags=["live"])


@router.post(
    "/projects/{project_id}/presence",
    summary="A-30 접속자와 작업 위치",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=error_responses(401, 403, 404),
)
def report_presence(project_id: UUID, body: PresenceIn, me: Me, db: DbSession) -> Response:
    """내 위치 알리기 전용. 접속자 목록은 A-31로 받아요(D-31). 세 역할 모두."""
    _project_of(db, me, project_id)
    chapter = chapter_db.get(db, body.chapter_id)
    if chapter is None or chapter.project_id != project_id:
        raise AppError(404, "not_found", "장을 찾을 수 없어요")
    live_db.report_presence(
        db, me.participant_id, chapter_id=chapter.id, paragraph_id=body.paragraph_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/projects/{project_id}/changes",
    summary="A-31 바뀐 것 받기",
    response_model=ChangesOut,
    responses=error_responses(401, 403, 404),
)
def changes(
    project_id: UUID,
    me: Me,
    db: DbSession,
    since: Annotated[datetime | None, Query(description="앞 응답의 cursor")] = None,
) -> ChangesOut:
    """세 역할 모두. 다른 사람의 보내기 전 AI 제안은 넣지 않아요(D-29)."""
    project = _project_of(db, me, project_id)
    if since is not None and since.tzinfo is None:
        since = since.replace(tzinfo=UTC)  # 시간대 없이 오면 서버 시각(UTC)으로 봐요
    found = live_db.changes(
        db,
        project,
        me=me.participant_id,
        since=since,
        overlap=timedelta(seconds=CURSOR_OVERLAP_SECONDS),
        ttl=timedelta(seconds=PRESENCE_TTL_SECONDS),
    )
    return ChangesOut(
        cursor=found.cursor,
        chapters=[_convert.chapter_summary(c) for c in found.chapters],
        shared_chapter_ids=found.shared_chapter_ids,
        layout=Layout.model_validate(project.layout or {}) if found.layout_changed else None,
        presence=[
            Presence(
                participant_id=p.id,
                role=p.role,
                display_name=p.display_name,
                chapter_id=p.current_chapter_id,
                paragraph_id=p.current_paragraph_id,
                seen_at=p.last_seen_at or found.cursor,
            )
            for p in found.present
        ],
    )
