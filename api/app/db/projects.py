"""책 읽기·쓰기(A-02, A-03)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Chapter, Comment, FirstView, Participant, Project
from app.errors import AppError

EMPTY_DOC: dict[str, Any] = {"type": "doc", "content": []}


def get(db: Session, project_id: uuid.UUID) -> Project | None:
    return db.get(Project, project_id)


def ids_taken(db: Session, project_id: uuid.UUID, chapter_id: uuid.UUID) -> bool:
    return db.get(Project, project_id) is not None or db.get(Chapter, chapter_id) is not None


def create(
    db: Session,
    *,
    project_id: uuid.UUID,
    title: str,
    template_id: str,
    layout: dict[str, Any],
    chapter_id: uuid.UUID,
    chapter_title: str,
    editor_name: str,
    editor_anon_id: uuid.UUID,
    editor_token_hash: str,
) -> tuple[Project, Chapter, Participant]:
    """책, 빈 첫 장(FR-01 ①), 편집자 참여자(정할 것 13)를 한 트랜잭션으로 만들어요.

    id는 화면이 만든 UUID라 이미 있으면 409(D-27, C-5).
    """
    if ids_taken(db, project_id, chapter_id):
        raise AppError(409, "duplicate_id", "같은 id가 이미 있어요")
    now = datetime.now(UTC)
    project = Project(id=project_id, title=title, template_id=template_id, layout=layout)
    editor = Participant(
        id=uuid.uuid4(),
        project_id=project_id,
        role="editor",
        display_name=editor_name,
        anon_id=editor_anon_id,
        token_hash=editor_token_hash,
        last_seen_at=now,
    )
    chapter = Chapter(
        id=chapter_id,
        project_id=project_id,
        sort_order=1,
        title=chapter_title,
        doc=EMPTY_DOC,
    )
    try:
        db.add(project)
        db.flush()  # participant·chapter가 project를 가리켜서 먼저 넣어요
        db.add_all([editor, chapter])
        db.commit()
    except IntegrityError:
        # 같은 id로 거의 동시에 온 요청은 위 확인을 둘 다 지나갈 수 있어요. 그때도 409(C-5, D-35).
        db.rollback()
        raise AppError(409, "duplicate_id", "같은 id가 이미 있어요") from None
    for row in (project, editor, chapter):
        db.refresh(row)
    return project, chapter, editor


def lock(db: Session, project_id: uuid.UUID) -> Project | None:
    """책 행을 잠그고 최신 값으로 다시 읽어요(SELECT … FOR UPDATE). 조판 값을 합치기 전에 불러요.

    겹친 요청은 앞 요청이 커밋할 때까지 기다렸다가 그 결과 위에 합쳐요(A-15, FR-16 ⑤).
    """
    return db.scalars(
        select(Project)
        .where(Project.id == project_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()


def update_layout(
    db: Session,
    project: Project,
    *,
    template_id: str,
    layout: dict[str, Any],
    by: uuid.UUID,
) -> Project:
    """조판 값 저장(A-15). 마지막에 바꾼 사람과 시각을 남겨요(FR-16 ⑤)."""
    now = datetime.now(UTC)
    project.template_id = template_id
    project.layout = layout
    project.layout_updated_by = by
    project.layout_updated_at = now
    project.updated_at = now
    db.commit()
    db.refresh(project)
    return project


@dataclass(frozen=True)
class CardRow:
    project: Project
    chapter_statuses: list[str]
    participants: list[Participant]
    todo_count: int


def _todo_count(db: Session, project_id: uuid.UUID, me: uuid.UUID) -> int:
    """확인할 일(FR-02 ②). 사람이 보낸 일 중 내가 아직 확인하지 않은 것만 세요.

    - 의견: 남이 남겼고 내가 처음 본 기록(first_view)이 없는 것. 상태(해결됨)와는 상관없어요.
    - 검토 요청: 검토 요청 상태인 장. 검토 완료를 누르면 줄어요.
    - AI 제안과 수정 제안은 세지 않아요.
    """
    unseen_comments = db.scalar(
        select(func.count())
        .select_from(Comment)
        .join(Chapter, Chapter.id == Comment.chapter_id)
        .outerjoin(
            FirstView,
            and_(
                FirstView.target_type == "comment",
                FirstView.target_id == Comment.id,
                FirstView.participant_id == me,
            ),
        )
        .where(
            Chapter.project_id == project_id,
            Comment.author_id != me,
            FirstView.target_id.is_(None),
        )
    )
    review = db.scalar(
        select(func.count())
        .select_from(Chapter)
        .where(Chapter.project_id == project_id, Chapter.status == "review_requested")
    )
    return int(unseen_comments or 0) + int(review or 0)


def cards_for_editors(db: Session, editors: list[Participant]) -> list[CardRow]:
    """편집자 참여자들의 책 카드(A-03). 최근에 바뀐 책이 먼저."""
    rows: list[CardRow] = []
    seen: set[uuid.UUID] = set()
    for me in editors:
        project = db.get(Project, me.project_id)
        if project is None or project.id in seen:
            continue
        seen.add(project.id)
        statuses = list(
            db.scalars(
                select(Chapter.status)
                .where(Chapter.project_id == project.id)
                .order_by(Chapter.sort_order)
            ).all()
        )
        people = list(
            db.scalars(
                select(Participant)
                .where(Participant.project_id == project.id)
                .order_by(Participant.created_at, Participant.id)
            ).all()
        )
        rows.append(CardRow(project, statuses, people, _todo_count(db, project.id, me.id)))
    rows.sort(key=lambda r: r.project.updated_at, reverse=True)
    return rows
