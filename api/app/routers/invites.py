"""초대 링크 API(A-05, A-06, A-09).

A-05·A-06의 {token}은 초대 링크의 token(누구나), A-09의 {invite_id}는 링크 id(편집자만)예요.
찾기는 늘 token의 해시로 해요(D-37).
"""

from uuid import UUID

from fastapi import APIRouter, status

from app.auth.permissions import actions_for
from app.auth.token import Me, require, require_project
from app.auth.tokens import hash_token, new_invite_token, new_secret_token
from app.db import invites as invite_db
from app.db import participants as participant_db
from app.db import projects as project_db
from app.db.models import RoleLink
from app.db.session import DbSession
from app.errors import AppError
from app.routers import _convert
from app.schemas.common import error_responses
from app.schemas.invite import Invite, InviteCheckOut, InviteRotateOut, JoinIn, JoinOut

router = APIRouter(tags=["invites"])

_UNUSABLE = InviteCheckOut(state="unusable", project_id=None, project_title=None, role=None, can=[])


def _usable(db: DbSession, token: str) -> RoleLink | None:
    link = invite_db.find_by_token_hash(db, hash_token(token))
    if link is None or link.revoked_at is not None:
        return None
    return link


@router.get("/invites/{token}", summary="A-05 초대 링크 확인", response_model=InviteCheckOut)
def check_invite(token: str, db: DbSession) -> InviteCheckOut:
    """누구나. 없거나 바꾸었거나 취소한 링크는 state=unusable(JN-02). 무엇 때문인지는 알려 주지 않아요."""
    link = _usable(db, token)
    project = project_db.get(db, link.project_id) if link else None
    if link is None or project is None:
        return _UNUSABLE
    return InviteCheckOut(
        state="valid",
        project_id=project.id,
        project_title=project.title,
        role="author" if link.role == "author" else "designer",
        can=actions_for(link.role),
    )


@router.post(
    "/invites/{token}/join",
    summary="A-06 참여하기",
    response_model=JoinOut,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(404),
)
def join(token: str, body: JoinIn, db: DbSession) -> JoinOut:
    """링크를 가진 사람. 역할은 링크의 역할로 정해져요(NFR-01). 참여자 토큰은 이 응답에서만 줘요(D-27).

    없거나 바꾸었거나 취소한 링크면 404 invite_unusable(FR-08 ③, S-03).
    같은 브라우저가 같은 역할로 다시 들어오면 참여자는 그대로, 이름과 토큰만 바뀌어요.
    """
    link = _usable(db, token)
    if link is None:
        raise AppError(404, "invite_unusable", "이 링크는 쓸 수 없어요")
    name = body.display_name.strip()
    if not name:
        raise AppError(422, "invalid_request", "display_name: 이름이 비어 있어요")
    secret = new_secret_token()
    row = participant_db.join(
        db,
        project_id=link.project_id,
        role=link.role,
        display_name=name,
        anon_id=body.anon_id,
        token_hash=hash_token(secret),
    )
    return JoinOut(participant=_convert.participant(row), participant_token=secret)


def _my_invite(db: DbSession, me: Me, invite_id: UUID) -> RoleLink:
    """편집자만, 그리고 내 책의 링크만. 다른 책의 링크면 403(S-02)."""
    require(me, "share_role_links")
    link = invite_db.get(db, invite_id)
    if link is None:
        raise AppError(404, "not_found", "링크를 찾을 수 없어요")
    require_project(me, link.project_id)
    return link


@router.post(
    "/invites/{invite_id}/rotate",
    summary="A-09 초대 링크 새로 바꾸기",
    response_model=InviteRotateOut,
    responses=error_responses(401, 403, 404, 409),
)
def rotate_invite(invite_id: UUID, me: Me, db: DbSession) -> InviteRotateOut:
    """편집자만. 옛 링크는 취소되고 같은 역할의 새 링크가 생겨요(FR-08 ①, S-03).
    이미 바꾸었거나 취소한 링크면 409 invite_revoked. 화면은 A-07을 다시 읽어요."""
    link = _my_invite(db, me, invite_id)
    token = new_invite_token()
    old, new = invite_db.rotate(db, link, token=token, token_hash=hash_token(token))
    return InviteRotateOut(revoked=_convert.invite(old), created=_convert.invite(new))


@router.post(
    "/invites/{invite_id}/revoke",
    summary="A-09 초대 링크 취소",
    response_model=Invite,
    responses=error_responses(401, 403, 404),
)
def revoke_invite(invite_id: UUID, me: Me, db: DbSession) -> Invite:
    """편집자만. 취소한 링크로는 들어올 수 없어요(FR-08 ②③)."""
    link = _my_invite(db, me, invite_id)
    return _convert.invite(invite_db.revoke(db, link))
