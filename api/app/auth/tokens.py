"""토큰 발급과 해시(D-27, D-37).

- 편집자·참여자 토큰: 서버가 만든 무작위 문자열. DB에는 해시만 저장해요.
- 초대 링크 token: UUID v4(data-contract role_link). 원문도 저장하지만 찾기는 해시로 해요(D-37).
- 해시는 SHA-256. 토큰이 충분히 길고 무작위라 솔트 없이 비교해요.
"""

import hashlib
import secrets
import uuid


def new_secret_token() -> str:
    return secrets.token_urlsafe(32)


def new_invite_token() -> str:
    return str(uuid.uuid4())


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
