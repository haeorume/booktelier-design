import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

pytestmark = pytest.mark.db


def test_pgvector_extension_is_on(db: Session) -> None:
    got = db.execute(text("SELECT extname FROM pg_extension WHERE extname = 'vector'")).scalar()
    assert got == "vector"
