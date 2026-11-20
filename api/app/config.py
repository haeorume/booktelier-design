"""설정. 값은 환경 변수나 api/.env에서 읽어요(.env는 저장소에 올리지 않아요).

이름과 뜻은 api/.env.example 과 docs/DEPLOY.md 의 환경 변수 표가 원본이에요.
"""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_db_url(url: str) -> str:
    """Neon이 주는 `postgresql://` 주소를 psycopg 3 드라이버 주소로 바꿔요(D-24)."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["local", "test", "production"] = "local"
    database_url: str = ""
    # 쉼표로 여러 개. 웹 주소만 넣어요(예: https://booktelier.vercel.app,http://localhost:3000)
    cors_origins: str = "http://localhost:3000"
    # demo = 예시 JSON을 돌려주는 데모 제공자, llm = 실제 LLM(F6). e2e와 CI는 늘 demo.
    ai_provider: Literal["demo", "llm"] = "demo"

    @field_validator("database_url")
    @classmethod
    def _normalize(cls, v: str) -> str:
        return normalize_db_url(v) if v else v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
