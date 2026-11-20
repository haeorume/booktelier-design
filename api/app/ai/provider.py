"""AI 제공자 인터페이스(D-21). AI_PROVIDER=demo(예시 JSON) / llm(F6). 테스트·CI·e2e는 늘 demo.

제공자는 원고를 받아 '고칠 거리'만 돌려줘요. 저장, 자리 맞추기, 같은 제안 거르기, 권한은 부르는 쪽
(app/routers·app/db)이 해요. 실패해도 원고 저장은 막지 않아요(NFR-03).
"""

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


class AiProvider(Protocol):
    def live_check(self, doc: dict[str, Any], paragraph_ids: list[str]) -> ReviewResult:
        """작가가 고친 문단만 본다(D-18). 실시간 교정에는 RAG를 쓰지 않는다(D-26)."""
        ...

    def chapter_review(self, doc: dict[str, Any]) -> ReviewResult:
        """편집자가 누른 장 검토(FR-21)."""
        ...
