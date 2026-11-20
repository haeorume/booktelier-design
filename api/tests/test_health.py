import pytest
from fastapi.testclient import TestClient

from app.config import normalize_db_url


def test_health_ok(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_neon_url_becomes_psycopg3() -> None:
    url = "postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/db?sslmode=require"
    assert normalize_db_url(url).startswith("postgresql+psycopg://u:p@ep-x")


def test_cors_allows_only_configured_origin(client: TestClient) -> None:
    ok = client.options(
        "/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.options(
        "/health",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in bad.headers


@pytest.mark.db
def test_health_db_sees_pgvector(db_client: TestClient) -> None:
    res = db_client.get("/health/db")
    assert res.status_code == 200
    assert res.json() == {"connected": True, "pgvector": True}
