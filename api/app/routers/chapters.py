"""장 API(A-11, A-12, A-14)와 검토본(A-29).

장은 늘 그 책의 참여자만 읽고 써요(403, S-02). 원고 저장은 base_version을 확인해요(D-30, S-06).
"""

from uuid import UUID

from fastapi import APIRouter, status

from app.auth.token import Identity, Me, require, require_project
from app.db import chapters as chapter_db
from app.db import snapshots as snapshot_db
from app.db.models import Chapter as ChapterRow
from app.db.session import DbSession
from app.errors import AppError
from app.routers import _convert
from app.schemas.common import ChapterStatus, error_responses
from app.schemas.project import (
    Chapter,
    ChapterStatusIn,
    ChapterSummary,
    DocSaveIn,
    DocSaveOut,
    Snapshot,
    SnapshotCreateIn,
    SnapshotSummary,
    VersionConflictOut,
)

router = APIRouter(tags=["chapters"])


def chapter_of(db: DbSession, me: Identity, chapter_id: UUID) -> ChapterRow:
    row = chapter_db.get(db, chapter_id)
    if row is None:
        raise AppError(404, "not_found", "장을 찾을 수 없어요")
    require_project(me, row.project_id)
    return row


@router.get(
    "/chapters/{chapter_id}",
    summary="A-11 장 읽기",
    response_model=Chapter,
    responses=error_responses(401, 403, 404),
)
def get_chapter(chapter_id: UUID, me: Me, db: DbSession) -> Chapter:
    return _convert.chapter(chapter_of(db, me, chapter_id))


@router.put(
    "/chapters/{chapter_id}/doc",
    summary="A-12 원고 저장",
    response_model=DocSaveOut,
    responses={
        **error_responses(401, 403, 404),
        409: {"model": VersionConflictOut, "description": "base_version이 최신이 아니에요"},
    },
)
def save_doc(chapter_id: UUID, body: DocSaveIn, me: Me, db: DbSession) -> DocSaveOut:
    """작가만(D-14). base_version이 지금 버전과 다르면 409와 최신 장(C-4, D-30)."""
    chapter_of(db, me, chapter_id)
    require(me, "edit_manuscript")
    try:
        saved = chapter_db.save_doc(
            db,
            chapter_id,
            doc=body.doc.model_dump(exclude_none=True),
            base_version=body.base_version,
            by=me.participant_id,
        )
    except chapter_db.VersionConflict as e:
        raise AppError(
            409,
            "version_conflict",
            "그사이 원고가 바뀌었어요",
            extra={"latest": _convert.chapter(e.latest).model_dump(mode="json")},
        ) from None
    return DocSaveOut(version=saved.version, updated_at=saved.updated_at)


# 장 상태 전이(FR-12~14). 웹 domain/transitions.ts의 장 표와 같고, 편집자의 '다시 열기'를 더했어요(api-needs A-14).
_TRANSITIONS: dict[tuple[str, ChapterStatus], str] = {
    ("editing", "review_requested"): "request_review",
    ("reviewed", "review_requested"): "request_review",  # FR-13 ① 검토 완료 뒤에도 다시 요청
    ("review_requested", "reviewed"): "complete_review",
    ("reviewed", "editing"): "complete_review",  # 다시 열기(편집자)
}


@router.post(
    "/chapters/{chapter_id}/status",
    summary="A-14 장 상태 바꾸기",
    response_model=ChapterSummary,
    responses=error_responses(401, 403, 404, 409),
)
def change_status(chapter_id: UUID, body: ChapterStatusIn, me: Me, db: DbSession) -> ChapterSummary:
    """검토 요청은 작가, 검토 완료·다시 열기는 편집자(FR-12~14). 표에 없는 전이는 409."""
    row = chapter_of(db, me, chapter_id)
    action = _TRANSITIONS.get((row.status, body.to))
    if action is None:
        raise AppError(
            409, "invalid_transition", f"'{row.status}'에서 '{body.to}'로 바꿀 수 없어요"
        )
    require(me, "request_review" if action == "request_review" else "complete_review")
    return _convert.chapter_summary(chapter_db.set_status(db, row, body.to))


@router.get(
    "/chapters/{chapter_id}/snapshots",
    summary="A-29 검토본 목록",
    response_model=list[SnapshotSummary],
    responses=error_responses(401, 403, 404),
)
def list_snapshots(chapter_id: UUID, me: Me, db: DbSession) -> list[SnapshotSummary]:
    """보기는 모두(FR-38). 최근 것이 먼저, 원고는 빼요."""
    chapter_of(db, me, chapter_id)
    require(me, "view_snapshots")
    return [_convert.snapshot_summary(s) for s in snapshot_db.list_by_chapter(db, chapter_id)]


@router.post(
    "/chapters/{chapter_id}/snapshots",
    summary="A-29 검토본 저장",
    response_model=Snapshot,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(401, 403, 404),
)
def create_snapshot(chapter_id: UUID, body: SnapshotCreateIn, me: Me, db: DbSession) -> Snapshot:
    """저장은 편집자(FR-38, routes WS-03). 지금 원고와 버전을 그대로 복사해요."""
    row = chapter_of(db, me, chapter_id)
    require(me, "save_snapshot")
    label = body.label.strip()
    if not label:
        raise AppError(422, "invalid_request", "label: 검토본 이름이 비어 있어요")
    return _convert.snapshot(snapshot_db.create(db, row, label=label, by=me.participant_id))


@router.get(
    "/snapshots/{snapshot_id}",
    summary="A-29 검토본 하나",
    response_model=Snapshot,
    responses=error_responses(401, 403, 404),
)
def get_snapshot(snapshot_id: UUID, me: Me, db: DbSession) -> Snapshot:
    snap = snapshot_db.get(db, snapshot_id)
    if snap is None:
        raise AppError(404, "not_found", "검토본을 찾을 수 없어요")
    chapter_of(db, me, snap.chapter_id)
    require(me, "view_snapshots")
    return _convert.snapshot(snap)
