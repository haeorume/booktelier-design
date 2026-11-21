"""RAG 조각 읽기·쓰기(D-26, db 탭 4번). 검색은 pgvector 코사인 거리로 하고, 같은 책만 걸러요.

LangChain은 여기서 쓰지 않아요. app/ai/retriever.py가 이 함수를 BaseRetriever로 감싸요.
langchain-postgres(PGVector)는 쓰지 않아요(R15): 표는 Alembic이, 거르는 조건은 이 SQL이 맡아요.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import ColumnElement, Select, delete, func, select
from sqlalchemy.orm import Session, aliased

from app.db.models import Chapter, RagChunk

# app/ai가 세션을 넘겨받을 때 쓰는 이름. sqlalchemy를 app/db 밖에서 import 하지 않게(R6).
RagSession = Session


@dataclass(frozen=True)
class NewChunk:
    label: str
    content: str
    embedding: list[float]
    paragraph_id: str | None = None


@dataclass(frozen=True)
class Found:
    """검색으로 찾은 조각. 거리(distance)는 작을수록 비슷해요(코사인 거리 0~2)."""

    chunk_id: uuid.UUID
    source: str
    label: str
    content: str
    chapter_id: uuid.UUID | None
    paragraph_id: str | None
    distance: float


def replace_norms(db: Session, chunks: Sequence[NewChunk]) -> int:
    """어문 규범을 통째로 바꿔요. 규범이 바뀔 때만 스크립트로 불러요(scripts/seed_norms.py)."""
    db.execute(delete(RagChunk).where(RagChunk.source == "norm"))
    for c in chunks:
        db.add(
            RagChunk(
                id=uuid.uuid4(),
                source="norm",
                label=c.label,
                content=c.content,
                embedding=c.embedding,
            )
        )
    db.commit()
    return len(chunks)


def stale_chapters(db: Session, project_id: uuid.UUID, exclude: uuid.UUID) -> list[Chapter]:
    """마지막으로 임베딩한 뒤 바뀐(또는 한 번도 넣지 않은) 같은 책의 다른 장('정할 것' 23)."""
    indexed = (
        select(RagChunk.chapter_id, func.max(RagChunk.chapter_version).label("v"))
        .where(RagChunk.source == "chapter", RagChunk.project_id == project_id)
        .group_by(RagChunk.chapter_id)
        .subquery()
    )
    rows = db.execute(
        select(Chapter, indexed.c.v)
        .outerjoin(indexed, indexed.c.chapter_id == Chapter.id)
        .where(Chapter.project_id == project_id, Chapter.id != exclude)
        .order_by(Chapter.sort_order)
    ).all()
    return [ch for ch, v in rows if v is None or v != ch.version]


def replace_chapter(
    db: Session, chapter: Chapter, version: int, chunks: Sequence[NewChunk]
) -> bool:
    """장의 조각을 version의 문단으로 바꿔요(db 탭 4번). 넣었으면 True. 커밋은 여기서 해요.

    두 장 검토가 같은 장을 동시에 넣지 않게 장을 잠그고(FOR UPDATE) 버전을 다시 봐요(Codex 검수 11.21).
    - 그사이 장이 바뀌었으면(version이 지금 버전과 다름) 넣지 않아요. 다음 장 검토가 새 버전으로 넣어요.
    - 이미 이 버전이 들어 있으면 건너뛰어요(앞 요청이 넣었음).
    - 지울 때는 버전과 상관없이 그 장의 조각을 모두 지워 옛 조각이 섞이지 않게 해요.
    """
    current = db.scalar(select(Chapter.version).where(Chapter.id == chapter.id).with_for_update())
    if current is None or current != version:
        db.rollback()
        return False
    done = db.scalar(
        select(func.count())
        .select_from(RagChunk)
        .where(
            RagChunk.source == "chapter",
            RagChunk.chapter_id == chapter.id,
            RagChunk.chapter_version == version,
        )
    )
    if done:
        db.rollback()
        return False
    db.execute(
        delete(RagChunk).where(RagChunk.source == "chapter", RagChunk.chapter_id == chapter.id)
    )
    for c in chunks:
        db.add(
            RagChunk(
                id=uuid.uuid4(),
                source="chapter",
                project_id=chapter.project_id,
                chapter_id=chapter.id,
                chapter_version=version,
                paragraph_id=c.paragraph_id,
                label=c.label,
                content=c.content,
                embedding=c.embedding,
            )
        )
    db.commit()
    return True


def search(
    db: Session,
    embedding: list[float],
    *,
    project_id: uuid.UUID,
    exclude_chapter: uuid.UUID,
    k_norm: int,
    k_chapter: int,
) -> list[Found]:
    """규범 k_norm개 + 같은 책의 다른 장 문단 k_chapter개. 다른 책 원고는 절대 섞지 않아요(data-contract)."""

    # 먼저 조건으로 걸러 낸 뒤(MATERIALIZED) 그 안에서 거리를 재는 정확 검색이에요.
    # 전역 HNSW 색인을 타면 가까운 후보를 먼저 뽑고 조건을 나중에 걸어, 다른 책 조각이 후보를 채우면
    # 같은 책 조각이 있어도 결과가 비어요(Codex 검수 11.21). 한 책의 조각은 수백 개라 정확 검색으로 충분해요.
    def nearest(where: list[ColumnElement[bool]], k: int) -> Select[RagChunk, float]:
        pool = select(RagChunk).where(*where).cte("pool").prefix_with("MATERIALIZED")
        chunk = aliased(RagChunk, pool)
        distance = chunk.embedding.cosine_distance(embedding)
        return select(chunk, distance.label("d")).order_by(distance).limit(k)

    norm = nearest([RagChunk.source == "norm"], k_norm)
    chapter = nearest(
        [
            RagChunk.source == "chapter",
            RagChunk.project_id == project_id,
            RagChunk.chapter_id != exclude_chapter,
        ],
        k_chapter,
    )
    out: list[Found] = []
    for stmt in (norm, chapter):
        for row, d in db.execute(stmt).all():
            out.append(
                Found(
                    chunk_id=row.id,
                    source=row.source,
                    label=row.label,
                    content=row.content,
                    chapter_id=row.chapter_id,
                    paragraph_id=row.paragraph_id,
                    distance=float(d),
                )
            )
    return out
