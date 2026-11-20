"""A-01·A-04 나 확인. 가짜 응답(D-25): 토큰이 있으면 예시 편집자를 돌려줘요."""

from fastapi import APIRouter

from app.auth.token import BearerToken
from app.routers import _fake
from app.schemas.common import error_responses
from app.schemas.project import MeOut

router = APIRouter(tags=["me"])


@router.get(
    "/me",
    summary="A-01 나 확인 (A-04 편집자 링크로 들어오기도 이것)",
    response_model=MeOut,
    responses=error_responses(401),
)
def get_me(_token: BearerToken) -> MeOut:
    """화면이 처음 열릴 때 불러요. 편집자 링크(/e/[token])로 들어오면 그 토큰을 헤더에 실어 불러요(A-04)."""
    return MeOut(
        kind="editor",
        participant_id=_fake.EDITOR_ID,
        role="editor",
        display_name="이편집",
        project_id=_fake.PROJECT_ID,
    )
