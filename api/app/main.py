from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import ErrorOut, install_error_handlers
from app.routers import chapters, health, invites, me, projects, shared, suggestions


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
    app.include_router(health.router)
    for r in (
        me.router,
        projects.router,
        chapters.router,
        invites.router,
        suggestions.router,
        shared.router,
    ):
        app.include_router(r)
    return app


app = create_app()
