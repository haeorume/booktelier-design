"""Alembic 실행 환경.

- DB 주소: `-x url=...`가 있으면 그것, 없으면 DATABASE_URL(app.config). 테스트는 -x url로 테스트 DB를 넘겨요.
- 벡터 칸: pgvector.sqlalchemy를 불러 둬야 자동 생성이 Vector 타입을 제대로 적어요(D-26).
- 우리 모델에 없는 테이블(예: LangChain이 만든 langchain_*)을 지우자고 제안하지 않게 막아요(D-26, R15).
"""

from logging.config import fileConfig
from typing import Any

import pgvector.sqlalchemy  # Vector 타입 등록
from alembic import context
from sqlalchemy import create_engine, pool

from app.config import get_settings, normalize_db_url
from app.db import models
from app.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
_ = pgvector.sqlalchemy
_ = models  # 테이블 모델을 메타데이터에 올려요(F1)


def _url() -> str:
    x = context.get_x_argument(as_dictionary=True)
    url = x.get("url") or get_settings().database_url
    if not url:
        raise RuntimeError(
            "DB 주소가 없어요. api/.env에 DATABASE_URL을 넣거나 `-x url=...`로 넘겨요."
        )
    return normalize_db_url(url)


def include_object(
    obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any
) -> bool:
    # DB에만 있고 우리 모델에는 없는 테이블은 건드리지 않아요(지우자는 제안 금지).
    return not (type_ == "table" and reflected and compare_to is None)


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=include_object,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
