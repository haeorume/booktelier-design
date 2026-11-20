"""초대 링크 API(A-05, A-06, A-09). 지금은 가짜 응답(D-25).

A-05·A-06의 {token}은 초대 링크의 token(누구나), A-09의 {invite_id}는 링크 id(편집자만)예요.
"""

from uuid import UUID

from fastapi import APIRouter, status

from app.auth.token import BearerToken
from app.errors import AppError
from app.routers import _fake
from app.schemas.common import error_responses
from app.schemas.invite import Invite, InviteCheckOut, InviteRotateOut, JoinIn, JoinOut

router = APIRouter(tags=["invites"])

# 가짜 응답에서 '쓸 수 없는 링크'로 보는 token. 화면이 JN-02를 만들 때 써요.
FAKE_UNUSABLE_TOKEN = "revoked"


@router.get("/invites/{token}", summary="A-05 초대 링크 확인", response_model=InviteCheckOut)
def check_invite(token: str) -> InviteCheckOut:
    """누구나. 없거나 바꾸었거나 취소한 링크는 state=unusable(JN-02). 무엇 때문인지는 알려 주지 않아요."""
    if token == FAKE_UNUSABLE_TOKEN:
        return InviteCheckOut(state="unusable", project_title=None, role=None, can=[])
    return InviteCheckOut(
        state="valid",
        project_title="파리에서 보낸 일주일",
        role="author",
        can=["edit_manuscript", "apply_ai_suggestion", "request_review", "create_comment"],
    )


@router.post(
    "/invites/{token}/join",
    summary="A-06 참여하기",
    response_model=JoinOut,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(404),
)
def join(token: str, body: JoinIn) -> JoinOut:
    """링크를 가진 사람. 역할은 링크의 역할로 정해져요(NFR-01). 참여자 토큰은 이 응답에서만 줘요(D-27).

    없거나 바꾸었거나 취소한 링크면 404 invite_unusable(FR-08 ③, S-03).
    """
    if token == FAKE_UNUSABLE_TOKEN:
        raise AppError(404, "invite_unusable", "이 링크는 쓸 수 없어요")
    author = _fake.participants()[1].model_copy(update={"display_name": body.display_name})
    return JoinOut(participant=author, participant_token=_fake.FAKE_TOKEN)


@router.post(
    "/invites/{invite_id}/rotate",
    summary="A-09 초대 링크 새로 바꾸기",
    response_model=InviteRotateOut,
    responses=error_responses(401, 403, 404),
)
def rotate_invite(invite_id: UUID, _token: BearerToken) -> InviteRotateOut:
    """편집자만. 옛 링크는 취소되고 같은 역할의 새 링크가 생겨요(FR-08 ①, S-03)."""
    old = _fake.invite(invite_id, "author")
    return InviteRotateOut(
        revoked=old.model_copy(update={"state": "revoked", "revoked_at": _fake.T1}),
        created=_fake.invite(_fake.INVITE_ROTATED_ID, "author", token="fake-rotated-token"),
    )


@router.post(
    "/invites/{invite_id}/revoke",
    summary="A-09 초대 링크 취소",
    response_model=Invite,
    responses=error_responses(401, 403, 404),
)
def revoke_invite(invite_id: UUID, _token: BearerToken) -> Invite:
    """편집자만. 취소한 링크로는 들어올 수 없어요(FR-08 ②③)."""
    return _fake.invite(invite_id, "author").model_copy(
        update={"state": "revoked", "revoked_at": _fake.T1}
    )
