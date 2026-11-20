"""검토본(A-29, FR-38). 저장한 때의 장 원고와 버전을 그대로 복사해 둬요."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Chapter, Snapshot


def create(db: Session, chapter: Chapter, *, label: str, by: uuid.UUID) -> Snapshot:
    snap = Snapshot(
        id=uuid.uuid4(),
        chapter_id=chapter.id,
        version=chapter.version,
        doc=chapter.doc,
        label=label,
        created_by=by,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


def list_by_chapter(db: Session, chapter_id: uuid.UUID) -> list[Snapshot]:
    return list(
        db.scalars(
            select(Snapshot)
            .where(Snapshot.chapter_id == chapter_id)
            .order_by(Snapshot.created_at.desc(), Snapshot.id)
        ).all()
    )


def get(db: Session, snapshot_id: uuid.UUID) -> Snapshot | None:
    return db.get(Snapshot, snapshot_id)
