"""오류 모양은 { code, message } 한 가지예요(api-needs C-3, D-35). 화면은 code로 안내 문구를 골라요.

라우터와 db·auth 함수는 `AppError(상태, code, message)`로 오류를 내요.
FastAPI가 내는 404·405·422도 여기서 같은 모양으로 바꿔 보내요.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorOut(BaseModel):
    code: str
    message: str


class AppError(Exception):
    """서버가 일부러 내는 오류. 예: 401 unauthorized, 403 forbidden, 409 version_conflict."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


_DEFAULT_CODES = {
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
}


def _body(code: str, message: str) -> dict[str, str]:
    return ErrorOut(code=code, message=message).model_dump()


async def _app_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return JSONResponse(status_code=exc.status_code, content=_body(exc.code, exc.message))


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code = _DEFAULT_CODES.get(exc.status_code, "http_error")
    return JSONResponse(status_code=exc.status_code, content=_body(code, str(exc.detail)))


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = exc.errors()
    first = errors[0] if errors else {}
    where = ".".join(str(p) for p in first.get("loc", []))
    message = f"{where}: {first.get('msg', '요청 모양이 맞지 않아요')}"
    return JSONResponse(status_code=422, content=_body("invalid_request", message))


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
