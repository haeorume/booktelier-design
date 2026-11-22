"""함께 봄: 의견·수정 제안(A-22~A-26), 처음 본 기록(A-27), 표기 원칙(A-28)."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import docops
from app.db import chapters as chapter_db
from app.db.models import AiSuggestion, Chapter, Comment, FirstView, StyleRule, SuggestedEdit
from app.errors import AppError


def _anchor(a: dict[str, Any]) -> docops.Anchor:
    return docops.Anchor(str(a["paragraph_id"]), int(a["start"]), int(a["end"]))


def list_comments(db: Session, chapter_id: uuid.UUID) -> list[Comment]:
    return list(
        db.scalars(
            select(Comment)
            .where(Comment.chapter_id == chapter_id)
            .order_by(Comment.created_at, Comment.id)
        ).all()
    )


def list_edits(db: Session, chapter_id: uuid.UUID) -> list[SuggestedEdit]:
    return list(
        db.scalars(
            select(SuggestedEdit)
            .where(SuggestedEdit.chapter_id == chapter_id)
            .order_by(SuggestedEdit.created_at, SuggestedEdit.id)
        ).all()
    )


def relocate_comment(chapter: Chapter, c: Comment) -> None:
    """읽을 때 지금 원고에서 자리를 다시 찾고 저장해요(NFR-05 ①). 저장하지 않으면 다음에 처음 자리에서
    다시 찾아, 같은 문구가 여럿일 때 다른 문구로 옮겨갈 수 있어요(Codex 검수 11.21).
    못 찾으면 그 자리 그대로(카드는 남아요). 커밋은 부르는 쪽이 해요."""
    if c.anchor is None or not c.original:
        return
    found = docops.locate(chapter.doc, _anchor(c.anchor), c.original)
    if found is not None and found != _anchor(c.anchor):
        c.anchor = found.as_dict()


def relocate_edit(db: Session, chapter: Chapter, e: SuggestedEdit) -> None:
    """대기 수정 제안의 자리를 다시 찾고, 원문이 지워졌으면 원문 삭제됨(source_deleted, data-contract P5)."""
    if e.status != "pending":
        return
    found = docops.locate(chapter.doc, _anchor(e.anchor), e.original)
    if found is None:
        e.status, e.decided_at = "source_deleted", datetime.now(UTC)
    elif found != _anchor(e.anchor):
        e.anchor = found.as_dict()


def get_comment(db: Session, comment_id: uuid.UUID) -> Comment | None:
    return db.get(Comment, comment_id)


def get_edit(db: Session, edit_id: uuid.UUID) -> SuggestedEdit | None:
    return db.get(SuggestedEdit, edit_id)


def create_comment(
    db: Session,
    chapter: Chapter,
    *,
    comment_id: uuid.UUID,
    body: str,
    anchor: docops.Anchor | None,
    original: str | None,
    parent_id: uuid.UUID | None,
    by: uuid.UUID,
) -> Comment:
    """의견·답글(FR-32). 답글은 자리 없이 원래 의견에 달아요. 같은 id면 409(C-5)."""
    if db.get(Comment, comment_id) is not None:
        raise AppError(409, "duplicate_id", "같은 id가 이미 있어요")
    if parent_id is not None:
        parent = db.get(Comment, parent_id)
        if parent is None or parent.chapter_id != chapter.id:
            raise AppError(404, "not_found", "답글을 달 의견을 찾을 수 없어요")
        anchor_d, original = None, None
    else:
        if anchor is None or not original:
            raise AppError(422, "invalid_request", "anchor: 의견을 단 자리가 없어요")
        found = docops.locate(chapter.doc, anchor, original)
        if found is None:
            raise AppError(409, "source_changed", "그 글자가 원고에 없어요")
        anchor_d = found.as_dict()
    row = Comment(
        created_at=datetime.now(UTC),  # now()는 트랜잭션 시작 시각이라 같은 요청의 줄끼리 같아져요
        id=comment_id,
        chapter_id=chapter.id,
        author_id=by,
        parent_id=parent_id,
        anchor=anchor_d,
        original=original,
        body=body,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "duplicate_id", "같은 id가 이미 있어요") from None
    db.refresh(row)
    return row


def set_comment_status(db: Session, c: Comment, *, resolved: bool, by: uuid.UUID) -> Comment:
    """해결·다시 열기(FR-36). 해결한 사람과 시각을 남겨요."""
    if resolved and c.status == "resolved" or not resolved and c.status == "open":
        raise AppError(409, "invalid_transition", "이미 그 상태예요")
    if resolved:
        c.status, c.resolved_at, c.resolved_by = "resolved", datetime.now(UTC), by
    else:
        c.status, c.resolved_at, c.resolved_by = "open", None, None
    db.commit()
    db.refresh(c)
    return c


def create_edit(
    db: Session,
    chapter: Chapter,
    *,
    edit_id: uuid.UUID,
    anchor: docops.Anchor,
    original: str,
    replacement: str,
    reason: str | None,
    kind: str | None,
    by: uuid.UUID,
) -> SuggestedEdit:
    """수정 제안 직접 남기기(FR-33). 고른 글자가 지금 원고에 있어야 해요."""
    if db.get(SuggestedEdit, edit_id) is not None:
        raise AppError(409, "duplicate_id", "같은 id가 이미 있어요")
    found = docops.locate(chapter.doc, anchor, original)
    if found is None:
        raise AppError(409, "source_changed", "그 글자가 원고에 없어요")
    row = SuggestedEdit(
        created_at=datetime.now(UTC),
        id=edit_id,
        chapter_id=chapter.id,
        author_id=by,
        anchor=found.as_dict(),
        original=original,
        replacement=replacement,
        reason=reason or None,
        kind=kind,
        base_version=chapter.version,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "duplicate_id", "같은 id가 이미 있어요") from None
    db.refresh(row)
    return row


def lock_edit(db: Session, e: SuggestedEdit) -> None:
    """수정 제안 행을 잠그고 그 자리에서 다시 읽어요. 두 창의 수락·거절이 겹쳐도 하나만 이겨요(FR-34·35, Codex 검수 11.21)."""
    db.scalars(
        select(SuggestedEdit)
        .where(SuggestedEdit.id == e.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()


def accept(
    db: Session, e: SuggestedEdit, chapter: Chapter, *, base_version: int, by: uuid.UUID
) -> tuple[int, uuid.UUID | None]:
    """수락(FR-34). 서버가 원고에 반영하고(D-30), AI 제안에서 왔으면 원래 제안을 반영됨으로 바꿔요(X-07·X-13).
    원문이 지워졌으면 원문 삭제됨으로 두고 409."""
    lock_edit(db, e)
    if e.status != "pending":
        raise AppError(409, "invalid_transition", f"'{e.status}' 상태의 수정 제안이에요")
    found = docops.locate(chapter.doc, _anchor(e.anchor), e.original)
    if found is None:
        e.status, e.decided_at = "source_deleted", datetime.now(UTC)
        db.commit()
        raise AppError(409, "source_changed", "가리키던 문장이 지워져 수락할 수 없어요")
    doc = docops.replace(chapter.doc, found, e.replacement)
    saved = chapter_db.save_doc(
        db,
        chapter.id,
        doc=doc,
        base_version=base_version,
        by=by,
        cause="edit_accepted",
        commit=False,
    )
    now = datetime.now(UTC)
    e.anchor = docops.Anchor(
        found.paragraph_id, found.start, found.start + docops.u16_len(e.replacement)
    ).as_dict()
    e.status, e.decided_at, e.decided_by = "accepted", now, by
    merged: uuid.UUID | None = None
    if e.ai_origin_id is not None:
        origin = db.get(AiSuggestion, e.ai_origin_id)
        if origin is not None and origin.status == "sent":
            origin.status, origin.decided_at = "merged", now
            merged = origin.id
    db.commit()
    db.refresh(e)
    return saved.version, merged


def reject(db: Session, e: SuggestedEdit, *, by: uuid.UUID) -> SuggestedEdit:
    """거절(FR-35). 원고는 그대로예요."""
    lock_edit(db, e)
    if e.status != "pending":
        raise AppError(409, "invalid_transition", f"'{e.status}' 상태의 수정 제안이에요")
    e.status, e.decided_at, e.decided_by = "rejected", datetime.now(UTC), by
    db.commit()
    db.refresh(e)
    return e


def add_view(db: Session, *, target_type: str, target_id: uuid.UUID, by: uuid.UUID) -> None:
    """처음 본 기록(A-27). 한 사람이 한 대상을 처음 본 때는 한 번만 남아요(first_view PK)."""
    db.execute(
        insert(FirstView)
        .values(target_type=target_type, target_id=target_id, participant_id=by)
        .on_conflict_do_nothing()
    )
    db.commit()


def seen_ids(db: Session, by: uuid.UUID, target_type: str) -> set[uuid.UUID]:
    return set(
        db.scalars(
            select(FirstView.target_id).where(
                FirstView.participant_id == by, FirstView.target_type == target_type
            )
        ).all()
    )


def list_style_rules(db: Session, project_id: uuid.UUID) -> list[StyleRule]:
    return list(
        db.scalars(
            select(StyleRule)
            .where(StyleRule.project_id == project_id)
            .order_by(StyleRule.created_at, StyleRule.id)
        ).all()
    )


def create_style_rule(
    db: Session, *, project_id: uuid.UUID, type_: str, text: str, by: uuid.UUID
) -> StyleRule:
    row = StyleRule(id=uuid.uuid4(), project_id=project_id, type=type_, text=text, created_by=by)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
