"""AI 제안 읽기·쓰기(A-16, A-17, A-19, A-20, A-21). 보내기 전까지 주인만 봐요(D-29).

원고를 바꾸는 적용·실행 취소는 save_doc(commit=False)로 원고와 제안을 한 트랜잭션에 바꿔요(D-30).
"""

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import docops
from app.ai.provider import Proposal
from app.db import chapters as chapter_db
from app.db.models import AiSuggestion, Chapter, Comment, StyleRule, SuggestedEdit
from app.errors import AppError


def _anchor(row: AiSuggestion) -> docops.Anchor:
    a = row.anchor
    return docops.Anchor(str(a["paragraph_id"]), int(a["start"]), int(a["end"]))


def list_mine(db: Session, chapter_id: uuid.UUID, owner: uuid.UUID) -> list[AiSuggestion]:
    return list(
        db.scalars(
            select(AiSuggestion)
            .where(
                AiSuggestion.chapter_id == chapter_id, AiSuggestion.owner_participant_id == owner
            )
            .order_by(AiSuggestion.created_at, AiSuggestion.id)
        ).all()
    )


def get_mine(db: Session, suggestion_id: uuid.UUID, owner: uuid.UUID) -> AiSuggestion:
    """남의 AI 제안은 없는 것과 같아요(FR-23, D-29). 있는지도 알리지 않으려고 404."""
    row = db.get(AiSuggestion, suggestion_id)
    if row is None or row.owner_participant_id != owner:
        raise AppError(404, "not_found", "AI 제안을 찾을 수 없어요")
    return row


def lock(db: Session, row: AiSuggestion) -> None:
    """그 제안 행을 잠그고 최신 값으로 다시 읽어요(SELECT … FOR UPDATE, 같은 객체를 그 자리에서 갱신).

    두 창에서 같은 제안을 동시에 보내거나 적용해도 뒤 요청은 앞 요청이 끝난 상태를 보고 409를 받아요
    (FR-29 ③, Codex 검수 11.21). 잠금 순서는 제안 → 장 → 책이에요(교착 방지).
    """
    db.scalars(
        select(AiSuggestion)
        .where(AiSuggestion.id == row.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()


def reconcile(db: Session, chapter: Chapter, owner: uuid.UUID) -> None:
    """지금 원고에 맞춰 내 대기 제안을 정리해요. 원문이 사라지면 무효(source_changed), 자리가 옮겨졌으면
    새 자리를 저장해요(NFR-04·05, 1차 reconcile과 같음)."""
    now = datetime.now(UTC)
    changed = False
    for row in list_mine(db, chapter.id, owner):
        if row.status != "pending":
            continue
        found = docops.locate(chapter.doc, _anchor(row), row.original)
        if found is None:
            row.status, row.status_reason, row.decided_at = "stale", "source_changed", now
            changed = True
        elif found != _anchor(row):
            row.anchor = found.as_dict()
            changed = True
    if changed:
        db.commit()


def save_proposals(
    db: Session,
    chapter: Chapter,
    *,
    owner: uuid.UUID,
    source: str,
    proposals: Iterable[Proposal],
    model: str,
) -> list[AiSuggestion]:
    """새 제안을 저장하고, 이번에 대기로 뜬 것을 돌려줘요(1차 saveAiSuggestions와 같은 규칙).

    - 지금 원고에서 자리를 찾지 못하면 저장하지 않아요.
    - 같은 주인·장·문단에 원문·수정안이 같은 대기 제안이 있으면 새로 만들지 않고 자리·버전만 바꿔요.
    - 같은 제안을 이미 처리했으면(무시·보냄·적용 등) 다시 띄우지 않아요(FR-28 ②).
    """
    existing = list_mine(db, chapter.id, owner)
    claimed: set[uuid.UUID] = set()
    out: list[AiSuggestion] = []
    # 만든 순서대로 시각을 1마이크로초씩 늘려요. now()는 한 요청 안에서 같아 목록 순서가 흔들려요.
    base = datetime.now(UTC)
    for i, p in enumerate(proposals):
        found = docops.locate(
            chapter.doc, docops.Anchor(p.paragraph_id, p.start, p.end), p.original
        )
        if found is None:
            continue
        same = [
            e
            for e in existing
            if e.anchor.get("paragraph_id") == p.paragraph_id
            and e.original == p.original
            and e.replacement == p.replacement
        ]
        free = [e for e in same if e.status == "pending" and e.id not in claimed]
        if free:
            row = min(free, key=lambda e: abs(int(e.anchor["start"]) - found.start))
            row.anchor, row.base_version = found.as_dict(), chapter.version
            # 이번에 근거를 찾았으면 새 근거로(RAG가 전에 실패했던 제안도 근거가 붙게, Codex 검수 11.21).
            # 이번에 못 찾았으면 예전 근거를 남겨요.
            if p.evidence is not None:
                row.evidence = p.evidence
            claimed.add(row.id)
            out.append(row)
            continue
        if same:
            continue  # 이미 처리했어요
        row = AiSuggestion(
            created_at=base + timedelta(microseconds=i),
            id=uuid.uuid4(),
            chapter_id=chapter.id,
            owner_participant_id=owner,
            anchor=found.as_dict(),
            original=p.original,
            replacement=p.replacement,
            alternatives=list(p.alternatives)[:2],
            kind=p.kind,
            reason=p.reason,
            evidence=p.evidence,
            source=source,
            target_role=p.target_role,
            base_version=chapter.version,
            model=model,
        )
        db.add(row)
        existing.append(row)
        claimed.add(row.id)
        out.append(row)
    db.commit()
    for row in out:
        db.refresh(row)
    return out


def _decide(row: AiSuggestion, status: str, reason: str | None = None) -> None:
    row.status, row.status_reason, row.decided_at = status, reason, datetime.now(UTC)


def _need(row: AiSuggestion, status: str) -> None:
    if row.status != status:
        raise AppError(409, "invalid_transition", f"'{row.status}' 상태의 AI 제안이에요")


def apply(
    db: Session,
    row: AiSuggestion,
    chapter: Chapter,
    *,
    choice: int,
    base_version: int,
    by: uuid.UUID,
) -> int:
    """적용(FR-27 ①). 서버가 원고에 반영하고 새 버전을 돌려줘요. 원문이 사라졌으면 무효로 두고 409."""
    lock(db, row)
    _need(row, "pending")
    options = [row.replacement, *(row.alternatives or [])]
    if choice >= len(options):
        raise AppError(422, "invalid_request", "choice: 없는 수정안이에요")
    text = options[choice]
    found = docops.locate(chapter.doc, _anchor(row), row.original)
    if found is None:
        _decide(row, "stale", "source_changed")
        db.commit()
        raise AppError(409, "source_changed", "원고가 먼저 바뀌어 이 제안은 적용하지 못했어요")
    doc = docops.replace(chapter.doc, found, text)
    saved = chapter_db.save_doc(
        db, chapter.id, doc=doc, base_version=base_version, by=by, cause="ai_applied", commit=False
    )
    row.anchor = docops.Anchor(
        found.paragraph_id, found.start, found.start + docops.u16_len(text)
    ).as_dict()
    row.applied_version, row.applied_text = saved.version, text
    _decide(row, "applied")
    db.commit()
    db.refresh(row)
    return saved.version


def undo(
    db: Session, row: AiSuggestion, chapter: Chapter, *, base_version: int, by: uuid.UUID
) -> int:
    """실행 취소(FR-27 ③). 바로 앞 동작일 때만(장 버전이 적용으로 만든 버전과 같고, 넣은 글자가 그대로) 되돌려요."""
    lock(db, row)
    _need(row, "applied")
    at = _anchor(row)
    text = docops.paragraph_text(chapter.doc, at.paragraph_id)
    if (
        row.applied_version != chapter.version
        or text is None
        or docops.u16_slice(text, at.start, at.end) != (row.applied_text or "")
    ):
        raise AppError(409, "undo_unavailable", "원고가 바뀌어 실행 취소할 수 없어요")
    doc = docops.replace(chapter.doc, at, row.original)
    saved = chapter_db.save_doc(
        db, chapter.id, doc=doc, base_version=base_version, by=by, cause="undo", commit=False
    )
    row.anchor = docops.Anchor(
        at.paragraph_id, at.start, at.start + docops.u16_len(row.original)
    ).as_dict()
    row.applied_version, row.applied_text = None, None
    row.status, row.status_reason, row.decided_at = "pending", None, None
    db.commit()
    db.refresh(row)
    return saved.version


def dismiss(db: Session, row: AiSuggestion) -> AiSuggestion:
    """무시(FR-28). 같은 제안은 다시 뜨지 않아요(save_proposals)."""
    lock(db, row)
    _need(row, "pending")
    _decide(row, "dismissed")
    db.commit()
    db.refresh(row)
    return row


def keep(db: Session, row: AiSuggestion, project_id: uuid.UUID, by: uuid.UUID) -> AiSuggestion:
    """이 표현 유지(FR-30). 표기 원칙에 유지 표현을 남기고 제안은 무효(kept)로 해요."""
    lock(db, row)
    _need(row, "pending")
    db.add(
        StyleRule(
            id=uuid.uuid4(), project_id=project_id, type="keep", text=row.original, created_by=by
        )
    )
    _decide(row, "stale", "kept")
    db.commit()
    db.refresh(row)
    return row


def send(
    db: Session,
    row: AiSuggestion,
    chapter: Chapter,
    *,
    as_: str,
    text: str,
    choice: int,
    by: uuid.UUID,
) -> tuple[Comment | None, SuggestedEdit | None]:
    """보내기(FR-29). 의견이면 의견 하나, 수정 제안이면 이유·종류를 담은 수정 제안 카드 하나(⑤, 설명용 의견 없음).
    누르는 순간의 원고에서 자리를 다시 찾아요. 원래 제안은 보냄이 되어 다시 보낼 수 없어요(③)."""
    lock(db, row)
    _need(row, "pending")
    found = docops.locate(chapter.doc, _anchor(row), row.original)
    if found is None:
        _decide(row, "stale", "source_changed")
        db.commit()
        raise AppError(409, "source_changed", "원고가 먼저 바뀌어 이 제안은 보내지 못했어요")
    anchor: dict[str, Any] = found.as_dict()
    comment: Comment | None = None
    edit: SuggestedEdit | None = None
    if as_ == "suggested_edit":
        options = [row.replacement, *(row.alternatives or [])]
        if choice >= len(options):
            raise AppError(422, "invalid_request", "choice: 없는 수정안이에요")
        edit = SuggestedEdit(
            created_at=datetime.now(UTC),
            id=uuid.uuid4(),
            chapter_id=chapter.id,
            author_id=by,
            anchor=anchor,
            original=row.original,
            replacement=options[choice],
            reason=text,
            kind=row.kind,
            ai_origin_id=row.id,
            base_version=chapter.version,
        )
        db.add(edit)
    else:
        comment = Comment(
            created_at=datetime.now(UTC),
            id=uuid.uuid4(),
            chapter_id=chapter.id,
            author_id=by,
            anchor=anchor,
            original=row.original,
            body=text,
            ai_origin_id=row.id,
        )
        db.add(comment)
    row.anchor = anchor
    _decide(row, "sent")
    db.commit()
    for x in (row, comment, edit):
        if x is not None:
            db.refresh(x)
    return comment, edit
