from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.db.session import DbSession
from app.db.status import database_status

router = APIRouter(tags=["health"])


class HealthOut(BaseModel):
    status: Literal["ok"]


class DbHealthOut(BaseModel):
    connected: bool
    pgvector: bool


@router.get("/health", summary="health 서버가 떠 있나", response_model=HealthOut)
def health() -> HealthOut:
    """서버가 살아 있는지. 배포처(Railway) 헬스 체크가 불러요. DB는 보지 않아요."""
    return HealthOut(status="ok")


@router.get("/health/db", summary="health DB 연결과 pgvector", response_model=DbHealthOut)
def health_db(db: DbSession) -> DbHealthOut:
    """배포 뒤 Neon에 붙는지, pgvector가 켜졌는지 확인해요(DEPLOY 2장). 헬스 체크 경로로는 쓰지 않아요."""
    return DbHealthOut(**database_status(db))
