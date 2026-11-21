"""AI 제공자 인터페이스(D-21). AI_PROVIDER=demo(예시 JSON) / llm(F6). 테스트·CI·e2e는 늘 demo.

제공자는 원고를 받아 '고칠 거리'만 돌려줘요. 저장, 자리 맞추기, 같은 제안 거르기, 권한은 부르는 쪽
(app/routers·app/db)이 해요. 실패해도 원고 저장은 막지 않아요(NFR-03).
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class Proposal:
    """제공자가 낸 고칠 거리 하나. 위치는 원고 기준(UTF-16, D-19)."""

    paragraph_id: str
    start: int
    end: int
    original: str
    replacement: str
    kind: str
    reason: str
    target_role: str
    alternatives: list[str] = field(default_factory=list)
    evidence: dict[str, Any] | None = None


@dataclass(frozen=True)
class ReviewResult:
    proposals: list[Proposal]
    model: str


@dataclass(frozen=True)
class BookRules:
    """책 원칙(표기 원칙, A-28, FR-31). LLM이 따르고(rules), 고치자고 하지 않아요(keep)."""

    rules: list[str] = field(default_factory=list)
    keep: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class EvidenceChunk:
    """장 검토 프롬프트에 [근거 n]으로 넣는 조각(RAG, D-26). 제안의 evidence가 이것을 가리켜요."""

    n: int
    chunk_id: str
    type: str  # norm(어문 규범) · chapter(같은 책의 다른 장)
    label: str
    content: str


class AiUnavailable(Exception):
    """AI가 답하지 않았어요(시간 초과, 오류, 읽을 수 없는 답). 부르는 쪽은 503으로 알리고 원고는 막지 않아요(NFR-03)."""


class AiProvider(Protocol):
    def live_check(
        self, doc: dict[str, Any], paragraph_ids: list[str], book: BookRules
    ) -> ReviewResult:
        """작가가 고친 문단만 본다(D-18). 실시간 교정에는 RAG를 쓰지 않는다(D-26)."""
        ...

    def chapter_review(
        self, doc: dict[str, Any], book: BookRules, evidence: Sequence[EvidenceChunk] = ()
    ) -> ReviewResult:
        """편집자가 누른 장 검토(FR-21). evidence는 RAG로 찾은 근거 자료(없으면 근거 없이)."""
        ...
