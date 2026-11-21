"""데모 제공자(D-21). 1차 예시 JSON(fixtures/, web/src/fixtures와 글자 하나 다르지 않음, D-19)을 돌려줘요.

- 실시간 교정: 예시는 para_02 하나에 대한 것이에요. 고친 문단 목록에 그 문단이 있으면 그 제안들을, 없으면 빈 목록.
- 장 검토: 예시의 제안 전부.
요청에 묶이는 값(id, 장, 버전, 주인)은 부르는 쪽이 붙여요. 네트워크를 쓰지 않아요.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.ai.provider import BookRules, Proposal, ReviewResult

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@lru_cache
def load(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    return data


def _proposals(raw: list[dict[str, Any]]) -> list[Proposal]:
    return [
        Proposal(
            paragraph_id=s["anchor"]["paragraph_id"],
            start=s["anchor"]["start"],
            end=s["anchor"]["end"],
            original=s["original"],
            replacement=s["replacement"],
            alternatives=list(s.get("alternatives") or [])[:2],
            kind=s["kind"],
            reason=s["reason"],
            target_role=s["target_role"],
        )
        for s in raw
    ]


class DemoProvider:
    model = "demo"

    def live_check(
        self, doc: dict[str, Any], paragraph_ids: list[str], book: BookRules
    ) -> ReviewResult:
        fixture = load("live_check.json")
        if fixture["paragraph_id"] not in paragraph_ids:
            return ReviewResult([], self.model)
        return ReviewResult(_proposals(fixture["suggestions"]), self.model)

    def chapter_review(self, doc: dict[str, Any], book: BookRules) -> ReviewResult:
        return ReviewResult(_proposals(load("chapter_review.json")["suggestions"]), self.model)


def sample_manuscript() -> tuple[str, dict[str, Any]]:
    """발표용 예시 원고(1차와 같음, D-39). 제목과 문서."""
    chapter = load("manuscript.json")["chapter"]
    return chapter["title"], chapter["doc"]
