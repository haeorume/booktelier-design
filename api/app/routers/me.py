"""A-01·A-04 나 확인."""

from fastapi import APIRouter

from app.auth.token import Me
from app.schemas.common import error_responses
from app.schemas.project import MeOut

router = APIRouter(tags=["me"])


@router.get(
    "/me",
    summary="A-01 나 확인 (A-04 편집자 링크로 들어오기도 이것)",
    response_model=MeOut,
    responses=error_responses(401),
)
def get_me(me: Me) -> MeOut:
    """화면이 처음 열릴 때 불러요. 편집자 링크(/e/[token])로 들어오면 그 토큰을 헤더에 실어 불러요(A-04)."""
    return MeOut(
        kind="editor" if me.role == "editor" else "participant",
        participant_id=me.participant_id,
        role=me.role,
        display_name=me.display_name,
        project_id=me.project_id,
    )
