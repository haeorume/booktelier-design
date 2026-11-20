"""요청의 토큰을 꺼내요(C-1, D-27). `Authorization: Bearer <토큰>`.

F1 첫 조각(계약)에서는 토큰이 있는지만 봐요. 토큰 → 참여자 찾기(해시 비교)와
책 범위·역할 확인(403)은 F1 두 번째 조각에서 이 파일에 더해요.
"""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.errors import AppError

_bearer = HTTPBearer(auto_error=False, description="편집자 토큰이나 참여자 토큰")


def bearer_token(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    if cred is None or not cred.credentials.strip():
        raise AppError(401, "unauthorized", "토큰이 없어요")
    return cred.credentials


# 라우터는 이 이름으로 토큰을 받아요.
BearerToken = Annotated[str, Depends(bearer_token)]
