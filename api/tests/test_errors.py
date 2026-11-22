from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.errors import AppError, install_error_handlers


def test_unknown_path_uses_error_shape(client: TestClient) -> None:
    # 오류 모양은 { code, message } 하나(api-needs C-3, D-35)
    res = client.get("/no-such-path")
    assert res.status_code == 404
    assert res.json()["code"] == "not_found"
    assert set(res.json()) == {"code", "message"}


def test_app_error_and_validation_use_error_shape() -> None:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/conflict")
    def conflict() -> None:
        raise AppError(409, "version_conflict", "원고가 그사이 바뀌었어요")

    @app.get("/needs-int")
    def needs_int(n: int) -> int:
        return n

    with TestClient(app) as c:
        r1 = c.get("/conflict")
        assert r1.status_code == 409
        assert r1.json() == {"code": "version_conflict", "message": "원고가 그사이 바뀌었어요"}
        r2 = c.get("/needs-int", params={"n": "x"})
        assert r2.status_code == 422
        assert r2.json()["code"] == "invalid_request"
