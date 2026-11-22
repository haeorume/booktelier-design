"""설정. 값은 환경 변수나 api/.env에서 읽어요(.env는 저장소에 올리지 않아요).

이름과 뜻은 api/.env.example 과 docs/DEPLOY.md 의 환경 변수 표가 원본이에요.
"""

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator
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
    # 웹 주소 하나. 편집자 링크(/e/…)와 초대 링크(/j/…)를 이 주소로 만들어요(11.21 정모 결정).
    web_url: str = "http://localhost:3000"
    # demo = 예시 JSON을 돌려주는 데모 제공자, llm = 실제 LLM(F6). e2e와 CI는 늘 demo.
    ai_provider: Literal["demo", "llm"] = "demo"
    # 실제 LLM(F6). OpenAI 호환 API(엘리스 플랫폼). 주소 끝에 /v1. 키는 .env와 배포 환경 변수에만.
    llm_base_url: str = ""
    llm_model: str = "openai/gpt-6.2-sol"
    llm_api_key: SecretStr = SecretStr("")
    # 기다리는 시간(초). 실시간 교정은 짧게(작가가 쓰는 중), 장 검토는 길게(편집자가 누르고 기다림).
    llm_timeout_live: float = 15
    llm_timeout_review: float = 90
    # 임베딩(F6 RAG, 조각 2). 규범·원고·검색 질의를 같은 모델로(db 탭 '임베딩 모델').
    embedding_base_url: str = ""
    embedding_model: str = "openai/text-embedding-3-small"
    embedding_api_key: SecretStr = SecretStr("")

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
