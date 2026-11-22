from collections.abc import Iterator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    if not url:
        raise RuntimeError(
            "DATABASE_URL이 비어 있어요. api/.env.example을 보고 api/.env를 만들어요."
        )
    # Neon 무료 플랜은 5분 쉬면 꺼져서 끊긴 연결이 풀에 남을 수 있어요. 쓰기 전에 살아 있는지 확인해요.
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI 의존성. 요청 하나에 세션 하나. 커밋은 db 폴더의 함수가 해요."""
    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()


# 라우터는 이 이름으로 세션을 받아요. sqlalchemy를 라우터에서 import 하지 않게(R6).
DbSession = Annotated[Session, Depends(get_db)]
