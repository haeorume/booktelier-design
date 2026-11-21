"""이벤트 저장(A-33, events 탭). FK 없이 id만 남겨요(db 2번). 원고 글자는 받지 않아요(S-09)."""

from collections.abc import Sequence
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import Event


def store(db: Session, rows: Sequence[dict[str, Any]]) -> int:
    """같은 event_id는 한 번만(다시 보낸 묶음, sendBeacon 겹침). 새로 넣은 수를 돌려줘요."""
    if not rows:
        return 0
    stmt = insert(Event).values(list(rows)).on_conflict_do_nothing(index_elements=["event_id"])
    result = db.execute(stmt.returning(Event.event_id))
    stored = len(result.all())
    db.commit()
    return stored
