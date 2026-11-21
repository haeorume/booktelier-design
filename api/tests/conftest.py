"""테스트 공통 준비.

DB 테스트(@pytest.mark.db)는 TEST_DATABASE_URL이 있을 때만 모아요. 없으면 '고르지 않음(deselected)'으로 빠지고,
끝에 몇 개가 빠졌는지 알려요. CI는 REQUIRE_DB_TESTS=1이라 주소가 없으면 실패해요.

안전장치: TEST_DATABASE_URL이 DATABASE_URL(개발·배포 DB)과 같으면 아예 시작하지 않아요.
테스트는 테이블을 비우고 다시 채우기 때문에, 사람마다 Neon `test-이름` 브랜치를 따로 써요(docs/DEPLOY.md).
"""

import argparse
import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.config import get_settings, normalize_db_url

# 테스트·CI는 늘 데모 제공자(D-21). 개발용 .env가 AI_PROVIDER=llm이어도 실제 LLM을 부르지 않게 고정해요.
# 환경 변수가 .env보다 앞서요(pydantic-settings).
os.environ["AI_PROVIDER"] = "demo"
get_settings.cache_clear()

TEST_DB = normalize_db_url(os.environ.get("TEST_DATABASE_URL", ""))


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if TEST_DB:
        dev_db = get_settings().database_url
        if dev_db and dev_db == TEST_DB:
            raise pytest.UsageError(
                "TEST_DATABASE_URL이 DATABASE_URL과 같아요. 테스트는 Neon test 브랜치에서만 돌려요."
            )
        return
    if os.environ.get("REQUIRE_DB_TESTS") == "1":
        raise pytest.UsageError("REQUIRE_DB_TESTS=1인데 TEST_DATABASE_URL이 없어요.")
    db_items = [i for i in items if i.get_closest_marker("db")]
    if db_items:
        config.hook.pytest_deselected(items=db_items)
        items[:] = [i for i in items if not i.get_closest_marker("db")]
        config.stash[_SKIPPED_DB] = len(db_items)


_SKIPPED_DB = pytest.StashKey[int]()


def pytest_terminal_summary(terminalreporter: pytest.TerminalReporter) -> None:
    n = terminalreporter.config.stash.get(_SKIPPED_DB, 0)
    if n:
        terminalreporter.write_line(
            f"DB 테스트 {n}개를 돌리지 않았어요(TEST_DATABASE_URL 없음). CI에서는 돌아요.",
            yellow=True,
        )


@pytest.fixture
def client() -> Iterator[TestClient]:
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


@pytest.fixture(scope="session")
def db_engine() -> Iterator[Engine]:
    """테스트 DB에 마이그레이션을 끝까지 올린 엔진."""
    from alembic import command
    from alembic.config import Config

    api_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    opts = argparse.Namespace(x=[f"url={TEST_DB}"])
    cfg = Config(os.path.join(api_dir, "alembic.ini"), cmd_opts=opts)
    cfg.set_main_option("script_location", os.path.join(api_dir, "alembic"))
    command.upgrade(cfg, "head")
    engine = create_engine(TEST_DB)
    yield engine
    engine.dispose()


@pytest.fixture
def db(db_engine: Engine) -> Iterator[Session]:
    """테스트 하나 = 트랜잭션 하나. 끝나면 되돌려서 다음 테스트에 남지 않아요."""
    conn = db_engine.connect()
    tx = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        tx.rollback()
        conn.close()


@pytest.fixture
def db_client(db: Session) -> Iterator[TestClient]:
    """`db` 세션을 쓰는 API 클라이언트. 라우터의 DbSession이 이 테스트의 트랜잭션을 써요."""
    from app.db.session import get_db
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
