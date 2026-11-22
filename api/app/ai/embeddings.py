"""임베딩(F6 RAG). LangChain OpenAIEmbeddings로 OpenAI 호환 API(엘리스)의 text-embedding-3-small을 불러요.

규범·원고·검색 질의를 모두 같은 모델로 임베딩해요(db 탭 '임베딩 모델'). 차원은 1536(rag_chunk.embedding).
"""

from langchain_core.embeddings import Embeddings
from pydantic import SecretStr

from app.ai.provider import AiUnavailable
from app.config import Settings


def make_embeddings(settings: Settings) -> Embeddings:
    from langchain_openai import OpenAIEmbeddings

    key = settings.embedding_api_key.get_secret_value()
    if not settings.embedding_base_url or not key:
        raise AiUnavailable("임베딩 주소나 키가 없어요(EMBEDDING_BASE_URL, EMBEDDING_API_KEY)")
    return OpenAIEmbeddings(
        model=settings.embedding_model,
        openai_api_base=settings.embedding_base_url,
        openai_api_key=SecretStr(key),
        # 모델 이름이 'openai/…'라 tiktoken이 토큰 수를 셀 수 없어요. 글을 그대로 보내요(조각은 짧아요).
        check_embedding_ctx_length=False,
        request_timeout=20,
        max_retries=1,
    )
