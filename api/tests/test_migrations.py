"""마이그레이션을 끝까지 올린 DB가 app/db/models.py와 같은 모양인지(DB 테스트).

마이그레이션은 손으로 적어서, 모델과 어긋나면 여기서 잡아요. 다르면 자동 생성이 낼 차이를 그대로 보여 줘요.
"""

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine

from app.db import models
from app.db.base import Base

pytestmark = pytest.mark.db


def test_migrations_match_models(db_engine: Engine) -> None:
    _ = models
    with db_engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        diff = [
            d
            for d in compare_metadata(ctx, Base.metadata)
            # alembic_version과 F6의 rag_chunk 같은 모델 밖 테이블은 빼요
            if not (isinstance(d, tuple) and d[0] == "remove_table")
        ]
    assert diff == []
