"""장 API(A-11, A-12, A-14). 지금은 가짜 응답(D-25)."""

from uuid import UUID

from fastapi import APIRouter

from app.auth.token import BearerToken
from app.errors import AppError
from app.routers import _fake
from app.schemas.common import error_responses
from app.schemas.project import (
    Chapter,
    ChapterStatusIn,
    ChapterSummary,
    DocSaveIn,
    DocSaveOut,
    VersionConflictOut,
)

router = APIRouter(tags=["chapters"])


@router.get(
    "/chapters/{chapter_id}",
    summary="A-11 장 읽기",
    response_model=Chapter,
    responses=error_responses(401, 403, 404),
)
def get_chapter(chapter_id: UUID, _token: BearerToken) -> Chapter:
    return _fake.chapter(chapter_id)


@router.put(
    "/chapters/{chapter_id}/doc",
    summary="A-12 원고 저장",
    response_model=DocSaveOut,
    responses={
        **error_responses(401, 403, 404),
        409: {"model": VersionConflictOut, "description": "base_version이 최신이 아니에요"},
    },
)
def save_doc(chapter_id: UUID, body: DocSaveIn, _token: BearerToken) -> DocSaveOut:
    """작가만. base_version이 지금 버전과 다르면 409와 최신 장(C-4, D-30).

    가짜 응답: 예시 장의 version은 3이에요. 3을 보내면 4로 저장되고, 다른 값이면 409예요.
    """
    if body.base_version != _fake.CHAPTER_VERSION:
        latest = _fake.chapter(chapter_id)
        raise AppError(
            409,
            "version_conflict",
            "그사이 원고가 바뀌었어요",
            extra={"latest": latest.model_dump(mode="json")},
        )
    return DocSaveOut(version=_fake.CHAPTER_VERSION + 1, updated_at=_fake.T1)


@router.post(
    "/chapters/{chapter_id}/status",
    summary="A-14 장 상태 바꾸기",
    response_model=ChapterSummary,
    responses=error_responses(401, 403, 404),
)
def change_status(chapter_id: UUID, body: ChapterStatusIn, _token: BearerToken) -> ChapterSummary:
    """검토 요청은 작가, 검토 완료·다시 열기는 편집자(FR-12~14)."""
    return _fake.chapter_summary(chapter_id).model_copy(
        update={"status": body.to, "status_changed_at": _fake.T1}
    )
