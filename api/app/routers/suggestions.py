"""AI 제안 API(A-16, A-17, A-19, A-20, A-21). 보내기 전 AI 제안은 주인만 봐요(D-29, S-07).

AI 요청은 원문을 받지 않고 장 id와 base_version만 받아요(C-9). 서버가 저장된 원고를 읽어요.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter

from app.ai.demo import get_provider
from app.auth.token import Identity, Me, require
from app.db import chapters as chapter_db
from app.db import suggestions as ai_db
from app.db.models import AiSuggestion as AiRow
from app.db.models import Chapter as ChapterRow
from app.db.session import DbSession
from app.errors import AppError
from app.routers import _convert
from app.routers.chapters import chapter_of
from app.schemas.common import error_responses
from app.schemas.project import ConflictOut
from app.schemas.review import (
    AiActionOut,
    AiSuggestion,
    ApplyIn,
    Kind,
    LiveCheckIn,
    ReviewIn,
    ReviewOut,
    SendIn,
    SendOut,
    UndoIn,
)

router = APIRouter(tags=["ai"])

KINDS = ("spelling", "spacing", "notation", "polish")
CONFLICT: dict[int | str, dict[str, Any]] = {
    409: {
        "model": ConflictOut,
        "description": "그사이 원고나 제안이 바뀌었어요(code로 구분)",
    }
}


def _fresh(chapter: ChapterRow, base_version: int) -> None:
    """AI는 저장이 끝난 버전으로 불러요(A-16). 다르면 409와 최신 장(C-4)."""
    if chapter.version != base_version:
        raise AppError(
            409,
            "version_conflict",
            "그사이 원고가 바뀌었어요",
            extra={"latest": _convert.chapter(chapter).model_dump(mode="json")},
        )


def _version_conflict(e: chapter_db.VersionConflict) -> AppError:
    return AppError(
        409,
        "version_conflict",
        "그사이 원고가 바뀌었어요",
        extra={"latest": _convert.chapter(e.latest).model_dump(mode="json")},
    )


@router.post(
    "/chapters/{chapter_id}/live-check",
    summary="A-16 실시간 교정",
    response_model=list[AiSuggestion],
    responses={**error_responses(401, 403, 404), **CONFLICT},
)
def live_check(chapter_id: UUID, body: LiveCheckIn, me: Me, db: DbSession) -> list[AiSuggestion]:
    """작가가 입력을 멈추면 바뀐 문단만(D-18). 이번에 대기로 뜬 내 제안을 돌려줘요. 실패해도 입력은 막지 않아요(NFR-03)."""
    chapter = chapter_of(db, me, chapter_id)
    require(me, "edit_manuscript")
    _fresh(chapter, body.base_version)
    result = get_provider().live_check(chapter.doc, body.paragraph_ids)
    rows = ai_db.save_proposals(
        db,
        chapter,
        owner=me.participant_id,
        source="live_check",
        proposals=result.proposals,
        model=result.model,
    )
    return [_convert.ai_suggestion(r) for r in rows]


@router.post(
    "/chapters/{chapter_id}/review",
    summary="A-17 장 검토 실행",
    response_model=ReviewOut,
    responses={**error_responses(401, 403, 404), **CONFLICT},
)
def chapter_review(chapter_id: UUID, body: ReviewIn, me: Me, db: DbSession) -> ReviewOut:
    """편집자가 눌러야만 돌고, 결과는 실행한 사람에게만 보여요(D-18, FR-21 ③). 바로 답해요(A-18 없음, F5 결정)."""
    chapter = chapter_of(db, me, chapter_id)
    require(me, "run_chapter_review")
    _fresh(chapter, body.base_version)
    result = get_provider().chapter_review(chapter.doc)
    rows = ai_db.save_proposals(
        db,
        chapter,
        owner=me.participant_id,
        source="chapter_review",
        proposals=result.proposals,
        model=result.model,
    )
    count = {k: sum(1 for r in rows if r.kind == k) for k in KINDS}
    summary: dict[Kind, int] = {
        "spelling": count["spelling"],
        "spacing": count["spacing"],
        "notation": count["notation"],
        "polish": count["polish"],
    }
    return ReviewOut(summary=summary, suggestions=[_convert.ai_suggestion(r) for r in rows])


@router.get(
    "/chapters/{chapter_id}/ai-suggestions",
    summary="A-19 내 AI 제안 목록",
    response_model=list[AiSuggestion],
    responses=error_responses(401, 403, 404),
)
def list_mine(chapter_id: UUID, me: Me, db: DbSession) -> list[AiSuggestion]:
    """내 제안만(다른 사람 것은 오지 않음, D-29). 지금 원고에 맞춰 자리를 다시 찾고, 원문이 사라진 대기 제안은 무효로 해요."""
    chapter = chapter_of(db, me, chapter_id)
    require(me, "view_ai_suggestions")
    ai_db.reconcile(db, chapter, me.participant_id)
    return [_convert.ai_suggestion(r) for r in ai_db.list_mine(db, chapter_id, me.participant_id)]


def _mine_and_chapter(db: DbSession, me: Identity, suggestion_id: UUID) -> tuple[AiRow, ChapterRow]:
    row = ai_db.get_mine(db, suggestion_id, me.participant_id)
    chapter = chapter_of(db, me, row.chapter_id)
    return row, chapter


@router.post(
    "/ai-suggestions/{suggestion_id}/apply",
    summary="A-20 AI 제안 적용",
    response_model=AiActionOut,
    responses={**error_responses(401, 403, 404), **CONFLICT},
)
def apply(suggestion_id: UUID, body: ApplyIn, me: Me, db: DbSession) -> AiActionOut:
    """작가만(D-14). 서버가 원고에 반영하고 새 버전을 돌려줘요(D-30, S-08). 그사이 원고가 바뀌었으면 409."""
    require(me, "apply_ai_suggestion")
    row, chapter = _mine_and_chapter(db, me, suggestion_id)
    try:
        version = ai_db.apply(
            db,
            row,
            chapter,
            choice=body.choice,
            base_version=body.base_version,
            by=me.participant_id,
        )
    except chapter_db.VersionConflict as e:
        raise _version_conflict(e) from None
    return AiActionOut(suggestion=_convert.ai_suggestion(row), chapter_version=version)


@router.post(
    "/ai-suggestions/{suggestion_id}/undo",
    summary="A-20 AI 제안 실행 취소",
    response_model=AiActionOut,
    responses={**error_responses(401, 403, 404), **CONFLICT},
)
def undo(suggestion_id: UUID, body: UndoIn, me: Me, db: DbSession) -> AiActionOut:
    """작가만. 바로 앞 동작일 때만 서버가 되돌려요(FR-27 ③, X-04)."""
    require(me, "undo_ai_suggestion")
    row, chapter = _mine_and_chapter(db, me, suggestion_id)
    try:
        version = ai_db.undo(db, row, chapter, base_version=body.base_version, by=me.participant_id)
    except chapter_db.VersionConflict as e:
        raise _version_conflict(e) from None
    return AiActionOut(suggestion=_convert.ai_suggestion(row), chapter_version=version)


@router.post(
    "/ai-suggestions/{suggestion_id}/dismiss",
    summary="A-20 AI 제안 무시",
    response_model=AiActionOut,
    responses=error_responses(401, 403, 404, 409),
)
def dismiss(suggestion_id: UUID, me: Me, db: DbSession) -> AiActionOut:
    require(me, "dismiss_ai_suggestion")
    row, _ = _mine_and_chapter(db, me, suggestion_id)
    return AiActionOut(
        suggestion=_convert.ai_suggestion(ai_db.dismiss(db, row)), chapter_version=None
    )


@router.post(
    "/ai-suggestions/{suggestion_id}/keep",
    summary="A-20 AI 제안 이 표현 유지",
    response_model=AiActionOut,
    responses=error_responses(401, 403, 404, 409),
)
def keep(suggestion_id: UUID, me: Me, db: DbSession) -> AiActionOut:
    """표기 원칙에 유지 표현을 남기고 제안은 무효(FR-30)."""
    require(me, "keep_ai_suggestion")
    row, chapter = _mine_and_chapter(db, me, suggestion_id)
    kept = ai_db.keep(db, row, chapter.project_id, me.participant_id)
    return AiActionOut(suggestion=_convert.ai_suggestion(kept), chapter_version=None)


@router.post(
    "/ai-suggestions/{suggestion_id}/send",
    summary="A-21 AI 제안 보내기",
    response_model=SendOut,
    responses=error_responses(401, 403, 404, 409),
)
def send(suggestion_id: UUID, body: SendIn, me: Me, db: DbSession) -> SendOut:
    """편집자만(FR-29 ④). 수정 제안이면 이유·종류가 담긴 카드 하나(⑤)."""
    require(me, "send_ai_suggestion")
    row, chapter = _mine_and_chapter(db, me, suggestion_id)
    text = body.text.strip()
    if not text:
        raise AppError(422, "invalid_request", "text: 보내는 문구가 비어 있어요")
    comment, edit = ai_db.send(
        db, row, chapter, as_=body.as_, text=text, choice=body.choice, by=me.participant_id
    )
    return SendOut(
        suggestion=_convert.ai_suggestion(row),
        comment=_convert.comment(comment) if comment else None,
        suggested_edit=_convert.suggested_edit(edit) if edit else None,
    )
