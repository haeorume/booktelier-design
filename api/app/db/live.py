"""함께 작업(A-30, A-31): 작업 위치 남기기와 since 뒤에 바뀐 것 찾기(D-31)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.db.models import Chapter, Comment, Participant, Project, SuggestedEdit


def report_presence(
    db: Session,
    participant_id: uuid.UUID,
    *,
    chapter_id: uuid.UUID,
    paragraph_id: str | None,
) -> None:
    """위치와 마지막 접속 시각만 바꿔요. 이벤트로 쌓지 않아요(FR-47)."""
    db.execute(
        update(Participant)
        .where(Participant.id == participant_id)
        .values(
            current_chapter_id=chapter_id,
            current_paragraph_id=paragraph_id,
            last_seen_at=datetime.now(UTC),
        )
    )
    db.commit()


@dataclass
class Changes:
    cursor: datetime
    chapters: list[Chapter]
    shared_chapter_ids: list[uuid.UUID]
    layout_changed: bool
    present: list[Participant]


def changes(
    db: Session,
    project: Project,
    *,
    me: uuid.UUID,
    since: datetime | None,
    overlap: timedelta,
    ttl: timedelta,
) -> Changes:
    """since가 없으면 장 전부. 있으면 since - overlap 뒤에 바뀐 것만(같은 변경이 두 번 올 수 있어요).

    의견·수정 제안은 장 id만 알려 줘요. 화면이 A-22로 다시 읽어요.
    AI 제안(ai_suggestion)은 보지 않아요. 보내기 전 제안은 주인만 보고(D-29), 보낸 제안은 수정 제안·의견이 돼요.
    """
    now = datetime.now(UTC)
    chapter_q = select(Chapter).where(Chapter.project_id == project.id)
    shared_ids: set[uuid.UUID] = set()
    layout_changed = True
    if since is not None:
        after = since - overlap
        chapter_q = chapter_q.where(
            or_(Chapter.updated_at > after, Chapter.status_changed_at > after)
        )
        in_book = select(Chapter.id).where(Chapter.project_id == project.id)
        for model in (Comment, SuggestedEdit):
            shared_ids |= set(
                db.scalars(
                    select(model.chapter_id)
                    .where(model.chapter_id.in_(in_book), model.updated_at > after)
                    .distinct()
                ).all()
            )
        layout_changed = project.layout_updated_at is not None and project.layout_updated_at > after
    chapters = list(db.scalars(chapter_q.order_by(Chapter.sort_order)).all())
    present = list(
        db.scalars(
            select(Participant)
            .where(
                Participant.project_id == project.id,
                Participant.id != me,
                Participant.last_seen_at > now - ttl,
                Participant.current_chapter_id.is_not(None),
            )
            .order_by(Participant.created_at, Participant.id)
        ).all()
    )
    return Changes(
        cursor=now,
        chapters=chapters,
        shared_chapter_ids=sorted(shared_ids, key=str),
        layout_changed=layout_changed,
        present=present,
    )
