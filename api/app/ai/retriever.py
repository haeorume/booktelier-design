"""검색기(D-26). app/db/rag.py의 SQL 검색을 LangChain BaseRetriever로 감싸요.

- 질의 글 → 임베딩(같은 모델) → pgvector 코사인 거리 검색 → Document 목록
- Document.metadata에 조각 id·종류·라벨을 실어 근거(evidence)로 쓸 수 있게 해요.
- DB 세션은 요청 하나에 묶여 있어 여러 스레드에서 쓰면 안 돼요. 그래서 여러 질의는 retrieve_many로
  임베딩을 한 번에 만들고 검색은 차례로 해요(BaseRetriever.batch는 스레드를 써서 쓰지 않아요).
"""

from collections.abc import Callable, Sequence

from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.retrievers import BaseRetriever
from pydantic import ConfigDict

from app.db.rag import Found

Search = Callable[[list[float]], list[Found]]


def to_document(f: Found) -> Document:
    return Document(
        page_content=f.content,
        metadata={
            "chunk_id": str(f.chunk_id),
            "source": f.source,
            "label": f.label,
            "chapter_id": str(f.chapter_id) if f.chapter_id else None,
            "paragraph_id": f.paragraph_id,
            "distance": f.distance,
        },
    )


class BookRetriever(BaseRetriever):
    """같은 책의 다른 장과 어문 규범에서 비슷한 조각을 찾아요. 거르는 조건은 search(app/db/rag.py)가 걸어요."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    embeddings: Embeddings
    search: Search

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> list[Document]:
        return [to_document(f) for f in self.search(self.embeddings.embed_query(query))]

    def retrieve_many(self, queries: Sequence[str]) -> list[list[Document]]:
        """여러 질의(문단들). 임베딩은 한 번에 만들고 검색은 한 세션에서 차례로 해요."""
        if not queries:
            return []
        vectors = self.embeddings.embed_documents(list(queries))
        return [[to_document(f) for f in self.search(v)] for v in vectors]
