"""초대 링크 모델(A-05~A-09)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import InviteRole, Role
from app.schemas.project import Participant


class InviteCheckOut(BaseModel):
    """A-05. 링크를 연 사람에게 보여 줄 것. 쓸 수 없으면 JN-02."""

    state: Literal["valid", "unusable"]
    project_title: str | None  # 쓸 수 없으면 None
    role: Role | None
    can: list[str]  # 할 수 있는 일. 권한 표의 action 이름(web/src/domain/permissions.ts)


class JoinIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    anon_id: UUID


class JoinOut(BaseModel):
    participant: Participant
    participant_token: str  # 이 응답에서만 줘요. 서버는 해시만 저장(D-27)


class Invite(BaseModel):
    """편집자에게만 보여요. 다시 복사할 수 있게 주소를 늘 같이 줘요(D-37)."""

    id: UUID
    project_id: UUID
    role: InviteRole
    url: str
    state: Literal["active", "revoked"]
    created_at: datetime
    revoked_at: datetime | None


class InviteCreateIn(BaseModel):
    role: InviteRole


class InviteRotateOut(BaseModel):
    """새로 바꾸기: 옛 링크는 취소되고 새 링크가 생겨요(FR-08 ①)."""

    revoked: Invite
    created: Invite
