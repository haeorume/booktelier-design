"""함께 봄 API(A-22~A-28): 의견·수정 제안·처음 본 기록·표기 원칙."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app import docops
from app.auth.token import Identity, Me, require
from app.db import chapters as chapter_db
from app.db import shared as shared_db
from app.db.models import Comment as CommentRow
from app.db.models import SuggestedEdit as EditRow
from app.db.session import DbSession
from app.errors import AppError
from app.routers import _convert
from app.routers.chapters import chapter_of
from app.routers.projects import _project_of
from app.schemas.common import error_responses
from app.schemas.project import ConflictOut
from app.schemas.review import (
    AcceptIn,
    AcceptOut,
    Comment,
    CommentIn,
    SharedOut,
    StyleRule,
    StyleRuleIn,
    SuggestedEdit,
    SuggestedEditIn,
    ViewIn,
)

router = APIRouter(tags=["shared"])


@router.get(
    "/chapters/{chapter_id}/shared",
    summary="A-22 함께 봄 목록",
    response_model=SharedOut,
    responses=error_responses(401, 403, 404),
)
def list_shared(
    chapter_id: UUID,
    me: Me,
    db: DbSession,
    type: Literal["all", "comment", "suggested_edit"] = Query(default="all"),
    status_: Literal["all", "open"] = Query(default="all", alias="status"),
) -> SharedOut:
    """참여자 모두. 의견(답글 포함)과 수정 제안. '진행 중'(open)은 열린 의견과 대기 수정 제안만(L-63, FR-36).
    자리는 지금 원고에서 다시 찾아 돌려줘요(NFR-05)."""
    chapter = chapter_of(db, me, chapter_id)
    comments = shared_db.list_comments(db, chapter_id) if type in ("all", "comment") else []
    edits = shared_db.list_edits(db, chapter_id) if type in ("all", "suggested_edit") else []
    for e in edits:
        shared_db.relocate_edit(db, chapter, e)
    for c in comments:
        shared_db.relocate_comment(chapter, c)
    db.commit()
    if status_ == "open":
        open_roots = {c.id for c in comments if c.parent_id is None and c.status == "open"}
        comments = [c for c in comments if (c.parent_id or c.id) in open_roots]
        edits = [e for e in edits if e.status == "pending"]
    return SharedOut(
        comments=[_convert.comment(c) for c in comments],
        suggested_edits=[_convert.suggested_edit(e) for e in edits],
        seen=sorted(
            shared_db.seen_ids(db, me.participant_id, "comment")
            | shared_db.seen_ids(db, me.participant_id, "suggested_edit"),
            key=str,
        ),
    )


@router.post(
    "/chapters/{chapter_id}/comments",
    summary="A-23 의견 남기기·답글",
    response_model=Comment,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(401, 403, 404, 409),
)
def create_comment(chapter_id: UUID, body: CommentIn, me: Me, db: DbSession) -> Comment:
    """세 역할 모두(FR-32, D-14). 의견은 원고를 바꾸지 않아요."""
    chapter = chapter_of(db, me, chapter_id)
    require(me, "create_comment")
    text = body.body.strip()
    if not text:
        raise AppError(422, "invalid_request", "body: 의견이 비어 있어요")
    anchor = (
        docops.Anchor(body.anchor.paragraph_id, body.anchor.start, body.anchor.end)
        if body.anchor
        else None
    )
    row = shared_db.create_comment(
        db,
        chapter,
        comment_id=body.id,
        body=text,
        anchor=anchor,
        original=body.original,
        parent_id=body.parent_id,
        by=me.participant_id,
    )
    return _convert.comment(row)


def _comment_of(db: DbSession, me: Identity, comment_id: UUID) -> CommentRow:
    row = shared_db.get_comment(db, comment_id)
    if row is None:
        raise AppError(404, "not_found", "의견을 찾을 수 없어요")
    chapter_of(db, me, row.chapter_id)
    return row


def _resolve(db: DbSession, me: Identity, comment_id: UUID, resolved: bool) -> Comment:
    """쓴 사람과 편집자만(Q-21)."""
    row = _comment_of(db, me, comment_id)
    if row.author_id != me.participant_id and me.role != "editor":
        raise AppError(403, "forbidden", "쓴 사람과 편집자만 바꿀 수 있어요")
    return _convert.comment(
        shared_db.set_comment_status(db, row, resolved=resolved, by=me.participant_id)
    )


@router.post(
    "/comments/{comment_id}/resolve",
    summary="A-24 의견 해결",
    response_model=Comment,
    responses=error_responses(401, 403, 404, 409),
)
def resolve(comment_id: UUID, me: Me, db: DbSession) -> Comment:
    return _resolve(db, me, comment_id, True)


@router.post(
    "/comments/{comment_id}/reopen",
    summary="A-24 의견 다시 열기",
    response_model=Comment,
    responses=error_responses(401, 403, 404, 409),
)
def reopen(comment_id: UUID, me: Me, db: DbSession) -> Comment:
    return _resolve(db, me, comment_id, False)


@router.post(
    "/chapters/{chapter_id}/suggested-edits",
    summary="A-25 수정 제안 남기기",
    response_model=SuggestedEdit,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(401, 403, 404, 409),
)
def create_edit(chapter_id: UUID, body: SuggestedEditIn, me: Me, db: DbSession) -> SuggestedEdit:
    """편집자만(FR-33, D-14). 이유는 비워도 돼요(Q-22)."""
    chapter = chapter_of(db, me, chapter_id)
    require(me, "create_suggested_edit")
    a = body.anchor
    row = shared_db.create_edit(
        db,
        chapter,
        edit_id=body.id,
        anchor=docops.Anchor(a.paragraph_id, a.start, a.end),
        original=body.original,
        replacement=body.replacement,
        reason=(body.reason or "").strip() or None,
        kind=body.kind,
        by=me.participant_id,
    )
    return _convert.suggested_edit(row)


def _edit_of(db: DbSession, me: Identity, edit_id: UUID) -> EditRow:
    row = shared_db.get_edit(db, edit_id)
    if row is None:
        raise AppError(404, "not_found", "수정 제안을 찾을 수 없어요")
    chapter_of(db, me, row.chapter_id)
    return row


@router.post(
    "/suggested-edits/{edit_id}/accept",
    summary="A-26 수정 제안 수락",
    response_model=AcceptOut,
    responses={
        **error_responses(401, 403, 404),
        409: {
            "model": ConflictOut,
            "description": "그사이 원고나 수정 제안이 바뀌었어요(code로 구분)",
        },
    },
)
def accept(edit_id: UUID, body: AcceptIn, me: Me, db: DbSession) -> AcceptOut:
    """받은 사람(작가)만(FR-34). 서버가 원고에 반영하고 버전을 올려요(D-30, S-08)."""
    require(me, "accept_suggested_edit")
    row = _edit_of(db, me, edit_id)
    chapter = chapter_of(db, me, row.chapter_id)
    try:
        version, merged = shared_db.accept(
            db, row, chapter, base_version=body.base_version, by=me.participant_id
        )
    except chapter_db.VersionConflict as e:
        raise AppError(
            409,
            "version_conflict",
            "그사이 원고가 바뀌었어요",
            extra={"latest": _convert.chapter(e.latest).model_dump(mode="json")},
        ) from None
    return AcceptOut(
        suggested_edit=_convert.suggested_edit(row),
        chapter_version=version,
        merged_ai_suggestion_id=merged,
    )


@router.post(
    "/suggested-edits/{edit_id}/reject",
    summary="A-26 수정 제안 거절",
    response_model=SuggestedEdit,
    responses=error_responses(401, 403, 404, 409),
)
def reject(edit_id: UUID, me: Me, db: DbSession) -> SuggestedEdit:
    """받은 사람(작가)만(FR-35). 원고는 그대로예요."""
    require(me, "reject_suggested_edit")
    row = _edit_of(db, me, edit_id)
    return _convert.suggested_edit(shared_db.reject(db, row, by=me.participant_id))


@router.post(
    "/views",
    summary="A-27 처음 본 기록",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=error_responses(401, 403, 404),
)
def add_view(body: ViewIn, me: Me, db: DbSession) -> Response:
    """카드를 화면에 연 때. 처음 한 번만 남아요(first_view). 내 책의 의견·수정 제안만."""
    row: CommentRow | EditRow | None = (
        shared_db.get_comment(db, body.target_id)
        if body.target_type == "comment"
        else shared_db.get_edit(db, body.target_id)
    )
    if row is None:
        raise AppError(404, "not_found", "대상을 찾을 수 없어요")
    chapter_of(db, me, row.chapter_id)
    shared_db.add_view(
        db, target_type=body.target_type, target_id=body.target_id, by=me.participant_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/projects/{project_id}/style-rules",
    summary="A-28 표기 원칙 목록",
    response_model=list[StyleRule],
    responses=error_responses(401, 403, 404),
)
def list_style_rules(project_id: UUID, me: Me, db: DbSession) -> list[StyleRule]:
    _project_of(db, me, project_id)
    return [_convert.style_rule(r) for r in shared_db.list_style_rules(db, project_id)]


@router.post(
    "/projects/{project_id}/style-rules",
    summary="A-28 표기 원칙 더하기",
    response_model=StyleRule,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(401, 403, 404),
)
def create_style_rule(project_id: UUID, body: StyleRuleIn, me: Me, db: DbSession) -> StyleRule:
    """추가는 누구나(api-needs A-28). 수정·삭제는 편집자(FR-31, Could, 이번에는 없음)."""
    _project_of(db, me, project_id)
    text = body.text.strip()
    if not text:
        raise AppError(422, "invalid_request", "text: 비어 있어요")
    return _convert.style_rule(
        shared_db.create_style_rule(
            db, project_id=project_id, type_=body.type, text=text, by=me.participant_id
        )
    )
