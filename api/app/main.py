from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import ErrorOut, install_error_handlers
from app.routers import chapters, events, health, invites, live, me, projects, shared, suggestions


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Booktelier API",
        version="0.1.0",
        # 422도 { code, message }로 보내니 계약에도 그렇게 적어요(C-3, D-35).
        # 이렇게 두면 FastAPI가 기본 HTTPValidationError를 더하지 않아요.
        responses={422: {"model": ErrorOut, "description": "요청 모양이 맞지 않아요"}},
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type"],
    )
    install_error_handlers(app)

    @app.middleware("http")
    async def beacon_as_json(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """화면을 떠날 때 sendBeacon은 CORS 사전 요청을 피하려고 text/plain으로 보내요(A-33).
        /events에 한해 JSON으로 읽게 바꿔요. 다른 경로는 건드리지 않아요."""
        if request.method == "POST" and request.url.path == "/events":
            headers = [(k, v) for k, v in request.scope["headers"] if k != b"content-type"]
            request.scope["headers"] = [*headers, (b"content-type", b"application/json")]
        return await call_next(request)

    app.include_router(health.router)
    for r in (
        me.router,
        projects.router,
        chapters.router,
        invites.router,
        suggestions.router,
        shared.router,
        live.router,
        events.router,
    ):
        app.include_router(r)
    return app


app = create_app()
