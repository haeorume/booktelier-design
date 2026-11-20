"""참여자 읽기·쓰기. 토큰은 해시로만 찾아요(D-27)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Participant


def find_by_token_hash(db: Session, token_hash: str) -> Participant | None:
    return db.scalars(select(Participant).where(Participant.token_hash == token_hash)).first()


def find_many_by_token_hashes(db: Session, token_hashes: list[str]) -> list[Participant]:
    if not token_hashes:
        return []
    return list(
        db.scalars(select(Participant).where(Participant.token_hash.in_(token_hashes))).all()
    )


def list_by_project(db: Session, project_id: uuid.UUID) -> list[Participant]:
    return list(
        db.scalars(
            select(Participant)
            .where(Participant.project_id == project_id)
            .order_by(Participant.created_at, Participant.id)
        ).all()
    )


def join(
    db: Session,
    *,
    project_id: uuid.UUID,
    role: str,
    display_name: str,
    anon_id: uuid.UUID,
    token_hash: str,
) -> Participant:
    """링크로 들어오기(FR-06). 같은 브라우저(anon_id)가 같은 역할로 이미 들어왔으면 새로 만들지 않고
    이름과 토큰만 바꿔요(1차 joinWithRoleLink와 같음). 옛 토큰은 해시가 바뀌어 더는 맞지 않아요.
    """
    found = db.scalars(
        select(Participant).where(
            Participant.project_id == project_id,
            Participant.role == role,
            Participant.anon_id == anon_id,
        )
    ).first()
    now = datetime.now(UTC)
    if found is None:
        found = Participant(
            id=uuid.uuid4(),
            project_id=project_id,
            role=role,
            display_name=display_name,
            anon_id=anon_id,
            token_hash=token_hash,
            last_seen_at=now,
        )
        db.add(found)
    else:
        found.display_name = display_name
        found.token_hash = token_hash
        found.last_seen_at = now
    db.commit()
    db.refresh(found)
    return found
