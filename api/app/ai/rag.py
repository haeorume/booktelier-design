"""장 검토에 넣을 근거 자료 만들기(F6 RAG, D-26, db 탭 4번). 실시간 교정에는 쓰지 않아요(빨라야 해서).

1. 같은 책의 다른 장 중 마지막 임베딩 뒤 바뀐 장만 문단 단위로 다시 넣어요('정할 것' 23).
2. 검토할 장의 문단 글을 질의로 써서(정할 것 20 (가)) 규범과 다른 장 문단을 찾아요.
3. 거리가 가까운 순서로 겹치지 않게 골라 번호를 붙여요. LLM은 제안마다 이 번호를 근거로 적어요.

원고 글자는 로그에 남기지 않아요.
"""

import uuid
from typing import Any

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from app.ai.provider import EvidenceChunk
from app.ai.retriever import BookRetriever
from app.db import rag as rag_db
from app.db.models import Chapter
from app.db.rag import RagSession

# 근거로 넣을 조각 수(프롬프트 길이와 비용을 줄이려고 작게). 규범은 문단마다 2개, 다른 장은 2개를 찾아 고르는 거예요.
K_NORM = 2
K_CHAPTER = 2
MAX_NORM = 6
MAX_CHAPTER = 4
# 질의로 쓸 문단 수(긴 장도 임베딩 한 번에 들어가게)
MAX_QUERIES = 40


def _paragraphs(doc: dict[str, Any]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for p in doc.get("content") or []:
        pid = str((p.get("attrs") or {}).get("id") or "")
        text = "".join(str(t.get("text", "")) for t in p.get("content") or [])
        if pid and text.strip():
            out.append((pid, text))
    return out


def index_chapters(db: RagSession, chapter: Chapter, embeddings: Embeddings) -> int:
    """같은 책의 다른 장 중 바뀐 장만 다시 넣어요. 넣은 장 수를 돌려줘요."""
    stale = rag_db.stale_chapters(db, chapter.project_id, exclude=chapter.id)
    for ch in stale:
        paragraphs = _paragraphs(ch.doc)
        vectors = embeddings.embed_documents([t for _, t in paragraphs]) if paragraphs else []
        version = ch.version  # 문단을 읽은 버전. 그사이 바뀌면 replace_chapter가 넣지 않아요
        rag_db.replace_chapter(
            db,
            ch,
            version,
            [
                rag_db.NewChunk(
                    label=f"{ch.sort_order}장 {i}문단",
                    content=text,
                    embedding=vec,
                    paragraph_id=pid,
                )
                for i, ((pid, text), vec) in enumerate(zip(paragraphs, vectors, strict=True), 1)
            ],
        )
    return len(stale)


def pick(results: list[list[Document]]) -> list[EvidenceChunk]:
    """문단별 검색 결과를 합쳐 가까운 순서로 겹치지 않게 골라 번호를 붙여요."""
    best: dict[str, Document] = {}
    for docs in results:
        for d in docs:
            cid = str(d.metadata["chunk_id"])
            if cid not in best or d.metadata["distance"] < best[cid].metadata["distance"]:
                best[cid] = d
    ordered = sorted(best.values(), key=lambda d: float(d.metadata["distance"]))
    norms = [d for d in ordered if d.metadata["source"] == "norm"][:MAX_NORM]
    chapters = [d for d in ordered if d.metadata["source"] == "chapter"][:MAX_CHAPTER]
    return [
        EvidenceChunk(
            n=i,
            chunk_id=str(d.metadata["chunk_id"]),
            type=str(d.metadata["source"]),
            label=str(d.metadata["label"]),
            content=d.page_content,
        )
        for i, d in enumerate(norms + chapters, 1)
    ]


def build_context(db: RagSession, chapter: Chapter, embeddings: Embeddings) -> list[EvidenceChunk]:
    """장 검토 근거 자료. 실패는 부르는 쪽이 잡아 근거 없이 계속해요(NFR-03)."""
    index_chapters(db, chapter, embeddings)
    project_id: uuid.UUID = chapter.project_id
    retriever = BookRetriever(
        embeddings=embeddings,
        search=lambda v: rag_db.search(
            db,
            v,
            project_id=project_id,
            exclude_chapter=chapter.id,
            k_norm=K_NORM,
            k_chapter=K_CHAPTER,
        ),
    )
    queries = [t for _, t in _paragraphs(chapter.doc)][:MAX_QUERIES]
    return pick(retriever.retrieve_many(queries))
