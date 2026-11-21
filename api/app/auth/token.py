"""요청의 토큰 → 신원(C-1, C-2, D-22, D-27). `Authorization: Bearer <토큰>`.

- 토큰이 없거나 맞는 참여자가 없으면 401.
- 책 범위가 다르거나(require_project) 역할에 없는 일이면(require) 403.
라우터는 `Me`로 신원을 받아요. DB 함수는 app/db/participants.py에 있어요(R6).
"""

import uuid
from dataclasses import dataclass
from typing import Annotated, get_args

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.permissions import Action, Role, can
from app.auth.tokens import hash_token
from app.db import participants
from app.db.session import DbSession
from app.errors import AppError

_bearer = HTTPBearer(auto_error=False, description="편집자 토큰이나 참여자 토큰")


def bearer_token(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    if cred is None or not cred.credentials.strip():
        raise AppError(401, "unauthorized", "토큰이 없어요")
    return cred.credentials


BearerToken = Annotated[str, Depends(bearer_token)]


@dataclass(frozen=True)
class Identity:
    participant_id: uuid.UUID
    project_id: uuid.UUID
    role: Role
    display_name: str


def current_identity(token: BearerToken, db: DbSession) -> Identity:
    found = participants.find_by_token_hash(db, hash_token(token))
    if found is None:
        raise AppError(401, "unauthorized", "토큰이 맞지 않아요")
    role = next((r for r in get_args(Role) if r == found.role), None)
    if role is None:  # DB에 모르는 역할이 들어 있으면 들이지 않아요
        raise AppError(401, "unauthorized", "토큰이 맞지 않아요")
    return Identity(
        participant_id=found.id,
        project_id=found.project_id,
        role=role,
        display_name=found.display_name,
    )


# 라우터는 이 이름으로 신원을 받아요.
Me = Annotated[Identity, Depends(current_identity)]


def require_project(me: Identity, project_id: uuid.UUID) -> None:
    """토큰 하나는 책 하나예요. 다른 책이면 403(S-02, FR-07)."""
    if me.project_id != project_id:
        raise AppError(403, "forbidden", "이 책에 들어올 수 없어요")


def require(me: Identity, action: Action) -> None:
    """역할 권한 표로 막아요(D-14, D-15, S-05)."""
    if not can(me.role, action):
        raise AppError(403, "forbidden", "이 역할로는 할 수 없어요")


def optional_identity(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)], db: DbSession
) -> Identity | None:
    """토큰이 있으면 신원, 없거나 맞지 않으면 None. 이벤트(A-33)처럼 토큰 없이도 받는 곳에서 써요.

    화면을 떠날 때 쓰는 sendBeacon은 토큰 헤더를 붙일 수 없고, 책을 만들기 전 화면에는 토큰이 아직 없어요.
    """
    if cred is None or not cred.credentials.strip():
        return None
    try:
        return current_identity(cred.credentials, db)
    except AppError:
        return None


MaybeMe = Annotated[Identity | None, Depends(optional_identity)]
