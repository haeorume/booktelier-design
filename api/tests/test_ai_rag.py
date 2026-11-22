"""F6 RAG(D-26). 진짜 임베딩·LLM은 부르지 않고 LangChain 가짜 임베딩·가짜 모델을 써요.

- DB 없이: 근거 번호 → evidence, 조각 고르기, 검색기(BaseRetriever), 실패하면 근거 없이 계속
- DB(@pytest.mark.db): 같은 책만 찾기, 검토 중인 장 빼기, 바뀐 장만 다시 넣기
"""

import hashlib
import json
import uuid
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from sqlalchemy.orm import Session

from app.ai import prompts
from app.ai.demo import load
from app.ai.llm import LlmProvider
from app.ai.provider import BookRules, EvidenceChunk
from app.ai.rag import MAX_CHAPTER, MAX_NORM, build_context, pick
from app.ai.retriever import BookRetriever
from app.db import rag as rag_db
from app.db.models import Chapter
from tests.helpers import Book, auth, make_book

DOC = load("manuscript.json")["chapter"]["doc"]
EVIDENCE = [
    EvidenceChunk(
        n=1,
        chunk_id="c1",
        type="norm",
        label="한글 맞춤법 제42항",
        content="의존 명사는 띄어 쓴다.",
    ),
    EvidenceChunk(
        n=2, chunk_id="c2", type="chapter", label="2장 3문단", content="루브르에 다시 갔다."
    ),
]


class _FakeEmbeddings(Embeddings):
    """글자마다 정해진 1536차원 벡터(같은 글은 같은 벡터). numpy 없이 만들어요."""

    def embed_query(self, text: str) -> list[float]:
        seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest(), 16)
        return [((seed >> (i % 200)) % 1000) / 1000 + 0.001 for i in range(1536)]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_query(t) for t in texts]


FAKE = _FakeEmbeddings()


def _review(answer: dict[str, Any], evidence: list[EvidenceChunk]) -> Any:
    chat = FakeListChatModel(responses=[json.dumps(answer, ensure_ascii=False)])
    return LlmProvider(chat, chat, "fake").chapter_review(DOC, BookRules(), evidence)


def _item(evidence: int | None) -> dict[str, Any]:
    return {
        "paragraph_id": "para_01",
        "original": "도착한지",
        "replacement": "도착한 지",
        "kind": "spacing",
        "reason": "의존 명사는 띄어 써요.",
        "evidence": evidence,
    }


def test_evidence_number_becomes_evidence() -> None:
    got = _review({"suggestions": [_item(1)]}, EVIDENCE).proposals[0]
    assert got.evidence == {
        "type": "norm",
        "label": "한글 맞춤법 제42항",
        "excerpt": "의존 명사는 띄어 쓴다.",
        "chunk_id": "c1",
    }


def test_made_up_or_missing_evidence_is_none() -> None:
    # 넣어 주지 않은 번호(지어낸 근거)와 null은 근거 없음
    got = _review(
        {
            "suggestions": [
                _item(9),
                {**_item(None), "original": "몇일", "replacement": "며칠", "kind": "spelling"},
            ]
        },
        EVIDENCE,
    )
    assert [p.evidence for p in got.proposals] == [None, None]


def test_prompt_lists_numbered_evidence() -> None:
    prompt = prompts.chapter_review_prompt([("para_01", "본문")], BookRules(), EVIDENCE)
    assert "[근거 1] 어문 규범 · 한글 맞춤법 제42항" in prompt
    assert "[근거 2] 같은 책의 다른 장 · 2장 3문단" in prompt
    assert "참고 자료" not in prompts.chapter_review_prompt([("p", "본문")], BookRules())


def _doc(cid: str, source: str, d: float) -> Document:
    return Document(
        page_content=cid, metadata={"chunk_id": cid, "source": source, "label": cid, "distance": d}
    )


def test_pick_dedupes_keeps_nearest_and_caps() -> None:
    results = [
        [_doc("n1", "norm", 0.5), _doc("c1", "chapter", 0.4)],
        [_doc("n1", "norm", 0.2), _doc("n2", "norm", 0.3)],
        [_doc(f"x{i}", "norm", 0.9) for i in range(10)],
        [_doc(f"y{i}", "chapter", 0.9) for i in range(10)],
    ]
    picked = pick(results)
    assert [p.n for p in picked] == list(range(1, len(picked) + 1))
    norms = [p for p in picked if p.type == "norm"]
    assert len(norms) == MAX_NORM and len(picked) - len(norms) == MAX_CHAPTER
    assert [p.chunk_id for p in norms[:2]] == ["n1", "n2"]  # 가까운 순서, 겹친 n1은 한 번


def test_retriever_wraps_search_as_documents() -> None:
    seen: list[int] = []

    def search(vector: list[float]) -> list[rag_db.Found]:
        seen.append(len(vector))
        return [
            rag_db.Found(
                chunk_id=uuid.uuid4(),
                source="norm",
                label="한글 맞춤법 제2항",
                content="문장의 각 단어는 띄어 씀을 원칙으로 한다.",
                chapter_id=None,
                paragraph_id=None,
                distance=0.1,
            )
        ]

    retriever = BookRetriever(embeddings=FAKE, search=search)
    docs = retriever.invoke("한참동안 서 있었다")  # LangChain Runnable 방식
    assert docs[0].metadata["label"] == "한글 맞춤법 제2항"
    assert len(retriever.retrieve_many(["가", "나", "다"])) == 3
    assert seen == [1536] * 4


def test_rag_failure_falls_back_to_no_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import suggestions as router

    class _Settings:
        ai_provider = "llm"

    class _Db:
        rolled_back = False

        def rollback(self) -> None:
            self.rolled_back = True

    def broken(*_: Any) -> Any:
        raise TimeoutError("임베딩이 늦었어요")

    monkeypatch.setattr(router, "get_settings", lambda: _Settings())
    monkeypatch.setattr("app.ai.embeddings.make_embeddings", broken)
    db = _Db()
    assert router._rag_context(cast(Any, db), cast(Any, object())) == []
    assert db.rolled_back


def test_demo_provider_skips_rag() -> None:
    from app.routers import suggestions as router

    assert router._rag_context(cast(Any, None), cast(Any, None)) == []


# ---- DB: 같은 책만, 검토 중인 장 빼기, 바뀐 장만 다시 넣기 ----


def _chapter(db: Session, book: Book, chapter_id: str) -> Chapter:
    row = db.get(Chapter, uuid.UUID(chapter_id))
    assert row is not None
    return row


def _add_chapter(c: TestClient, book: Book, text: str) -> str:
    cid = str(uuid.uuid4())
    made = c.post(
        f"/projects/{book.project_id}/chapters",
        json={"id": cid, "title": "2장"},
        headers=auth(book.author),
    )
    assert made.status_code == 201, made.text
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "attrs": {"id": "q1"},
                "content": [{"type": "text", "text": text}],
            }
        ],
    }
    saved = c.put(
        f"/chapters/{cid}/doc", json={"doc": doc, "base_version": 1}, headers=auth(book.author)
    )
    assert saved.status_code == 200, saved.text
    return cid


@pytest.mark.db
def test_context_only_from_same_book_and_other_chapters(db_client: TestClient, db: Session) -> None:
    mine = make_book(db_client, sample=True)
    other = make_book(db_client, "다른 책", sample=True)
    second = _add_chapter(db_client, mine, "루브르 박물관에 다시 갔다.")
    _add_chapter(db_client, other, "다른 책의 비밀 원고.")
    rag_db.replace_norms(
        db,
        [
            rag_db.NewChunk(
                label="한글 맞춤법 제42항",
                content="의존 명사는 띄어 쓴다.",
                embedding=FAKE.embed_query("x"),
            )
        ],
    )
    context = build_context(db, _chapter(db, mine, mine.chapter_id), FAKE)
    labels = {c.label for c in context}
    assert "한글 맞춤법 제42항" in labels
    chapters = [c for c in context if c.type == "chapter"]
    assert chapters and all(c.label.startswith("2장") for c in chapters)
    assert "다른 책의 비밀 원고." not in [
        c.content for c in context
    ]  # 다른 책은 절대 섞이지 않아요
    # 검토 중인 장(1장)은 근거로 오지 않아요
    first_texts = {"".join(t["text"] for t in p.get("content", [])) for p in DOC["content"]}
    assert not first_texts & {c.content for c in context}
    assert second  # 2장이 넣어졌어요


@pytest.mark.db
def test_only_changed_chapters_are_reindexed(db_client: TestClient, db: Session) -> None:
    book = make_book(db_client, sample=True)
    second = _add_chapter(db_client, book, "처음 글.")
    first = _chapter(db, book, book.chapter_id)
    assert [c.id for c in rag_db.stale_chapters(db, first.project_id, exclude=first.id)] == [
        uuid.UUID(second)
    ]
    build_context(db, first, FAKE)
    assert rag_db.stale_chapters(db, first.project_id, exclude=first.id) == []
    # 2장을 고치면 다시 넣을 대상이 돼요
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "attrs": {"id": "q1"},
                "content": [{"type": "text", "text": "고친 글."}],
            }
        ],
    }
    saved = db_client.put(
        f"/chapters/{second}/doc", json={"doc": doc, "base_version": 2}, headers=auth(book.author)
    )
    assert saved.status_code == 200, saved.text
    assert [c.id for c in rag_db.stale_chapters(db, first.project_id, exclude=first.id)] == [
        uuid.UUID(second)
    ]


def test_search_filters_before_distance() -> None:
    # Codex 검수(11.21): HNSW가 후보를 먼저 뽑고 조건을 나중에 걸면 같은 책 조각이 빠져요.
    # 조건으로 먼저 거르는(MATERIALIZED) 정확 검색인지 SQL로 확인해요.
    from sqlalchemy.dialects import postgresql

    captured: list[Any] = []

    class _Db:
        def execute(self, stmt: Any) -> Any:
            captured.append(stmt)

            class _R:
                def all(self) -> list[Any]:
                    return []

            return _R()

    rag_db.search(
        cast(Any, _Db()),
        [0.1] * 1536,
        project_id=uuid.uuid4(),
        exclude_chapter=uuid.uuid4(),
        k_norm=2,
        k_chapter=2,
    )
    for stmt in captured:
        sql = str(stmt.compile(dialect=postgresql.dialect()))
        assert "AS MATERIALIZED" in sql
        assert "FROM pool ORDER BY" in sql


@pytest.mark.db
def test_replace_chapter_is_serialized_and_skips_same_version(
    db_client: TestClient, db: Session
) -> None:
    book = make_book(db_client, sample=True)
    ch = _chapter(db, book, book.chapter_id)
    chunk = rag_db.NewChunk(label="1장 1문단", content="글", embedding=FAKE.embed_query("글"))
    assert rag_db.replace_chapter(db, ch, ch.version, [chunk]) is True
    # 같은 버전을 또 넣으려 하면 건너뛰어요(동시 요청이 중복을 만들지 않게)
    assert rag_db.replace_chapter(db, ch, ch.version, [chunk]) is False
    # 그사이 장이 바뀌었으면(옛 버전) 넣지 않아요
    assert rag_db.replace_chapter(db, ch, ch.version - 1, [chunk]) is False
    from app.db.models import RagChunk

    count = db.query(RagChunk).filter(RagChunk.chapter_id == ch.id).count()
    assert count == 1


@pytest.mark.db
def test_rereview_updates_evidence_on_existing_pending(db_client: TestClient, db: Session) -> None:
    # Codex 검수(11.21): 근거 없이 만든 대기 제안을 다시 검토하면 새 근거가 붙어요
    from app.ai.provider import Proposal
    from app.db import suggestions as ai_db

    book = make_book(db_client, sample=True)
    ch = _chapter(db, book, book.chapter_id)
    me = db_client.get("/me", headers=auth(book.editor)).json()["participant_id"]

    def proposal(evidence: dict[str, Any] | None) -> Proposal:
        return Proposal(
            paragraph_id="para_01",
            start=4,
            end=8,
            original="도착한지",
            replacement="도착한 지",
            kind="spacing",
            reason="r",
            target_role="editor",
            evidence=evidence,
        )

    ev = {"type": "norm", "label": "한글 맞춤법 제42항", "excerpt": "의존 명사", "chunk_id": "c1"}
    first = ai_db.save_proposals(
        db, ch, owner=uuid.UUID(me), source="chapter_review", proposals=[proposal(None)], model="m"
    )
    again = ai_db.save_proposals(
        db, ch, owner=uuid.UUID(me), source="chapter_review", proposals=[proposal(ev)], model="m"
    )
    assert first[0].id == again[0].id
    assert again[0].evidence == ev
    # 이번에 못 찾았으면 예전 근거를 남겨요
    kept = ai_db.save_proposals(
        db, ch, owner=uuid.UUID(me), source="chapter_review", proposals=[proposal(None)], model="m"
    )
    assert kept[0].evidence == ev
