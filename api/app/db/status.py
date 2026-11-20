"""DB 상태 확인(/health/db). 배포한 서버가 Neon에 붙는지, pgvector가 켜졌는지 주소 하나로 봐요."""

from sqlalchemy import text
from sqlalchemy.orm import Session


def database_status(session: Session) -> dict[str, bool]:
    session.execute(text("SELECT 1"))
    found = session.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).first()
    return {"connected": True, "pgvector": found is not None}
