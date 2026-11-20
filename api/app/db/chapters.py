"""장 읽기·쓰기(A-11~A-14). 원고를 바꾸는 쓰기는 base_version을 확인해요(D-30, C-4)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Chapter, ChapterRevision, Project
from app.errors import AppError

EMPTY_DOC: dict[str, Any] = {"type": "doc", "content": []}


class VersionConflict(Exception):
    """base_version이 지금 버전과 달라요. latest는 최신 장."""

    def __init__(self, latest: Chapter) -> None:
        super().__init__("version conflict")
        self.latest = latest


def get(db: Session, chapter_id: uuid.UUID) -> Chapter | None:
    return db.get(Chapter, chapter_id)


def list_by_project(db: Session, project_id: uuid.UUID) -> list[Chapter]:
    return list(
        db.scalars(
            select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.sort_order)
        ).all()
    )


def _touch_project(db: Session, project_id: uuid.UUID, now: datetime) -> None:
    # 홈 카드의 '최근 변경'(data-contract project.updated_at)
    db.execute(update(Project).where(Project.id == project_id).values(updated_at=now))


@dataclass(frozen=True)
class Saved:
    """이 요청이 만든 버전과 저장 시각. 다른 요청이 그 뒤에 저장했어도 이 값이에요."""

    version: int
    updated_at: datetime


def save_doc(
    db: Session,
    chapter_id: uuid.UUID,
    *,
    doc: dict[str, Any],
    base_version: int,
    by: uuid.UUID,
    cause: str = "typing",
) -> Saved:
    """원고 저장(A-12). 버전 확인과 올리기를 UPDATE 한 번으로 해서 동시에 와도 하나만 이겨요.

    돌려주는 버전은 UPDATE … RETURNING으로 받은 이 요청의 버전이에요. 커밋 뒤 다시 읽으면
    그사이 다른 사람이 저장한 버전을 받아, 다음 저장이 409 없이 남의 원고를 덮어쓸 수 있어요(D-30).
    잠금 순서는 장 → 책이에요(set_status·create도 같은 순서).
    저장할 때마다 chapter_revision을 남겨요('정할 것' 19 잠정값). 원고 글자는 로그에 남기지 않아요.
    """
    now = datetime.now(UTC)
    row = db.execute(
        update(Chapter)
        .where(Chapter.id == chapter_id, Chapter.version == base_version)
        .values(doc=doc, version=Chapter.version + 1, updated_at=now)
        .returning(Chapter.version, Chapter.project_id)
    ).first()
    if row is None:
        latest = db.get(Chapter, chapter_id)
        if latest is None:
            raise AppError(404, "not_found", "장을 찾을 수 없어요")
        db.refresh(latest)
        raise VersionConflict(latest)
    version, project_id = row
    db.add(
        ChapterRevision(
            id=uuid.uuid4(),
            chapter_id=chapter_id,
            version=version,
            doc=doc,
            cause=cause,
            created_by=by,
        )
    )
    _touch_project(db, project_id, now)
    db.commit()
    return Saved(version=version, updated_at=now)


def create(db: Session, *, project_id: uuid.UUID, chapter_id: uuid.UUID, title: str) -> Chapter:
    """장 추가(A-13, FR-15). 순서는 마지막 다음. 같은 id면 409(C-5)."""
    if db.get(Chapter, chapter_id) is not None:
        raise AppError(409, "duplicate_id", "같은 id가 이미 있어요")
    last = db.scalar(select(func.max(Chapter.sort_order)).where(Chapter.project_id == project_id))
    now = datetime.now(UTC)
    chapter = Chapter(
        id=chapter_id,
        project_id=project_id,
        sort_order=(last or 0) + 1,
        title=title,
        doc=EMPTY_DOC,
    )
    db.add(chapter)
    try:
        db.flush()
        _touch_project(db, project_id, now)
        db.commit()
    except IntegrityError:
        # 같은 id가 동시에 왔거나, 두 사람이 동시에 장을 더해 순서가 겹쳤어요. 화면이 다시 시도해요.
        db.rollback()
        raise AppError(409, "conflict", "그사이 장이 바뀌었어요. 다시 시도해 주세요") from None
    db.refresh(chapter)
    return chapter


def set_status(db: Session, chapter: Chapter, to: str) -> Chapter:
    now = datetime.now(UTC)
    chapter.status = to
    chapter.status_changed_at = now
    db.flush()  # 장을 먼저 잠그고 책을 갱신해요(save_doc과 같은 순서, 교착 방지)
    _touch_project(db, chapter.project_id, now)
    db.commit()
    db.refresh(chapter)
    return chapter
