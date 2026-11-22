"""AI 층. LLM SDK·LangChain은 이 폴더에서만 import 해요(불변 규칙 R5).

- F5: 제공자 인터페이스와 데모 제공자(1차 예시 JSON)
- F6: 실제 LLM 제공자(LangChain), 검색은 `BaseRetriever`로 감싸고 SQL은 app/db의 함수를 불러요(D-26).
  langchain_postgres(PGVector 등)는 쓰지 않아요(불변 규칙 R15).
"""

from app.ai.demo import DemoProvider
from app.ai.provider import AiProvider
from app.config import get_settings


def get_provider() -> AiProvider:
    """AI_PROVIDER=llm이면 실제 LLM 제공자, 아니면 데모(D-21). 테스트·CI·e2e는 늘 demo.

    LLM 제공자는 쓸 때만 불러와요(LangChain을 서버 시작 때 읽지 않게).
    """
    settings = get_settings()
    if settings.ai_provider == "llm":
        from app.ai.llm import LlmProvider

        return LlmProvider.from_settings(settings)
    return DemoProvider()
