"""초대 링크(role_link) 읽기·쓰기. 원문 token도 저장하지만 찾기는 해시로 해요(D-37)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import RoleLink
from app.errors import AppError


def list_by_project(db: Session, project_id: uuid.UUID) -> list[RoleLink]:
    return list(
        db.scalars(
            select(RoleLink)
            .where(RoleLink.project_id == project_id)
            .order_by(RoleLink.created_at, RoleLink.id)
        ).all()
    )


def get(db: Session, invite_id: uuid.UUID) -> RoleLink | None:
    return db.get(RoleLink, invite_id)


def find_by_token_hash(db: Session, token_hash: str) -> RoleLink | None:
    return db.scalars(select(RoleLink).where(RoleLink.token_hash == token_hash)).first()


def active_for_role(db: Session, project_id: uuid.UUID, role: str) -> RoleLink | None:
    return db.scalars(
        select(RoleLink).where(
            RoleLink.project_id == project_id,
            RoleLink.role == role,
            RoleLink.revoked_at.is_(None),
        )
    ).first()


def create_or_get_active(
    db: Session, *, project_id: uuid.UUID, role: str, token: str, token_hash: str
) -> RoleLink:
    """그 역할의 쓸 수 있는 링크가 있으면 그것, 없으면 새로 만들어요(A-08).

    책·역할마다 쓸 수 있는 링크는 하나예요(부분 유일 색인 uq_role_link_active_role).
    동시에 두 요청이 만들려 하면 뒤 요청은 색인에 걸리고, 먼저 만든 링크를 돌려줘요.
    """
    found = active_for_role(db, project_id, role)
    if found is not None:
        return found
    link = RoleLink(
        id=uuid.uuid4(), project_id=project_id, role=role, token=token, token_hash=token_hash
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        found = active_for_role(db, project_id, role)
        if found is None:
            raise
        return found
    db.refresh(link)
    return link


def revoke(db: Session, link: RoleLink) -> RoleLink:
    if link.revoked_at is None:
        link.revoked_at = datetime.now(UTC)
        db.commit()
        db.refresh(link)
    return link


def rotate(
    db: Session, link: RoleLink, *, token: str, token_hash: str
) -> tuple[RoleLink, RoleLink]:
    """옛 링크를 취소하고 같은 역할의 새 링크를 만들어요(FR-08 ①). 한 트랜잭션.

    이미 취소된 링크(이미 바꾼 링크 포함)는 409. 바꾸기를 다시 보내도 쓸 수 있는 링크가 둘이 되지 않아요.
    같은 링크를 동시에 바꾸면 뒤 요청은 색인에 걸려 409.
    """
    if link.revoked_at is not None:
        raise AppError(409, "invite_revoked", "이미 바꾸었거나 취소한 링크예요")
    link.revoked_at = datetime.now(UTC)
    db.flush()  # 옛 링크를 먼저 취소해야 새 링크가 색인에 걸리지 않아요
    new = RoleLink(
        id=uuid.uuid4(),
        project_id=link.project_id,
        role=link.role,
        token=token,
        token_hash=token_hash,
    )
    db.add(new)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "invite_revoked", "이미 바꾸었거나 취소한 링크예요") from None
    db.refresh(link)
    db.refresh(new)
    return link, new
