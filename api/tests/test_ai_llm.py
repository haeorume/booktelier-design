"""F6 실제 LLM 제공자. 진짜 LLM은 부르지 않고 LangChain 가짜 모델로 답을 정해 줘요(D-21: 테스트는 늘 demo·가짜).

- LLM 답 → 제안: 원문을 원고에서 찾아 UTF-16 위치를 붙이고, 지어낸 원문·없는 문단은 버려요.
- 구조화 출력을 못 쓰는 모델이면 글(JSON)을 읽어요.
- 늦거나 실패하면 AiUnavailable(라우터가 503, NFR-03).
- 책 원칙(A-28)이 프롬프트에 들어가요.
"""

import json
from typing import Any

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from app.ai import prompts
from app.ai.demo import load
from app.ai.llm import Answer, Item, LlmProvider, parse_answer, to_proposals
from app.ai.provider import AiUnavailable, BookRules

DOC = load("manuscript.json")["chapter"]["doc"]
NO_RULES = BookRules()


def _answer(*items: dict[str, Any]) -> str:
    return json.dumps({"suggestions": list(items)}, ensure_ascii=False)


def _provider(*responses: str) -> LlmProvider:
    chat = FakeListChatModel(responses=list(responses))
    return LlmProvider(chat, chat, "fake")


class _Broken(FakeListChatModel):
    """시간 초과처럼 실패하는 모델."""

    def _call(self, *args: Any, **kwargs: Any) -> str:
        raise TimeoutError("늦었어요")


def test_live_check_finds_positions_in_utf16() -> None:
    p = _provider(
        _answer(
            {
                "paragraph_id": "para_02",
                "original": "한참동안",
                "replacement": "한참 동안",
                "kind": "spacing",
                "reason": "띄어 써요.",
            }
        )
    )
    result = p.live_check(DOC, ["para_02"], NO_RULES)
    assert len(result.proposals) == 1
    got = result.proposals[0]
    text = "".join(t["text"] for t in DOC["content"][1]["content"])
    assert text[got.start : got.end] == "한참동안"  # 한글은 UTF-16 한 칸이라 위치가 같아요
    assert got.target_role == "author"
    assert result.model == "fake"


def test_made_up_original_and_unknown_paragraph_are_dropped() -> None:
    p = _provider(
        _answer(
            {
                "paragraph_id": "para_02",
                "original": "원고에 없는 글",
                "replacement": "x",
                "kind": "polish",
                "reason": "r",
            },
            {
                "paragraph_id": "para_09",
                "original": "한참동안",
                "replacement": "한참 동안",
                "kind": "spacing",
                "reason": "r",
            },
            {
                "paragraph_id": "para_01",
                "original": "몇일",
                "replacement": "며칠",
                "kind": "spelling",
                "reason": "r",
            },
        )
    )
    # 실시간 교정은 고친 문단(para_02)만 봐요. para_01 제안도 버려요(D-18).
    assert p.live_check(DOC, ["para_02"], NO_RULES).proposals == []


def test_chapter_review_reads_code_fenced_json_and_caps_alternatives() -> None:
    body = _answer(
        {
            "paragraph_id": "para_03",
            "original": "모나리자를",
            "replacement": "〈모나리자〉를",
            "alternatives": ["「모나리자」를", "〈모나리자〉를", "『모나리자』를", "‘모나리자’를"],
            "kind": "notation",
            "reason": "작품 제목은 부호로 묶어요.",
        },
        {
            "paragraph_id": "para_01",
            "original": "몇일",
            "replacement": "며칠",
            "kind": "spelling",
            "reason": "바른 표기는 며칠이에요.",
        },
    )
    result = _provider(f"```json\n{body}\n```").chapter_review(DOC, NO_RULES)
    assert [(s.paragraph_id, s.kind, s.target_role) for s in result.proposals] == [
        ("para_03", "notation", "editor"),
        ("para_01", "spelling", "editor"),
    ]
    # 수정안과 같은 대안은 빼고 최대 2개(FR-24)
    assert result.proposals[0].alternatives == ["「모나리자」를", "『모나리자』를"]


def test_repeated_original_uses_occurrence_or_is_dropped() -> None:
    # Codex 검수(11.21): 뒤쪽만 고칠 때 앞쪽 맞는 글자에 붙으면 안 돼요(NFR-05)
    paragraphs = [("p", "그는 공부하는데 나는 잔다. 공부하는데 시간이 걸린다.")]

    def item(occurrence: int | None) -> Item:
        return Item(
            paragraph_id="p",
            original="공부하는데",
            replacement="공부하는 데",
            kind="spacing",
            reason="r",
            occurrence=occurrence,
        )

    second = to_proposals(Answer(suggestions=[item(2)]), paragraphs, "author")
    assert [p.start for p in second] == [16]
    # 몇 번째인지 모르거나 범위를 벗어나면 버려요
    assert to_proposals(Answer(suggestions=[item(None)]), paragraphs, "author") == []
    assert to_proposals(Answer(suggestions=[item(3)]), paragraphs, "author") == []


def test_failure_and_unreadable_answer_raise_ai_unavailable() -> None:
    broken = _Broken(responses=["x"])
    with pytest.raises(AiUnavailable):
        LlmProvider(broken, broken, "fake").live_check(DOC, ["para_02"], NO_RULES)
    with pytest.raises(AiUnavailable):
        _provider("설명만 있고 JSON이 없어요").chapter_review(DOC, NO_RULES)
    with pytest.raises(AiUnavailable):
        _provider('{"suggestions": [{"paragraph_id": "para_01", "kind": "typo"}]}').chapter_review(
            DOC, NO_RULES
        )
    # 맨 바깥 모양이 틀리면 '발견 없음'이 아니라 실패(FR-21 ②④, Codex 검수)
    one = {
        "paragraph_id": "para_01",
        "original": "몇일",
        "replacement": "며칠",
        "kind": "spelling",
        "reason": "r",
    }
    for wrong in (json.dumps([one], ensure_ascii=False), json.dumps(one, ensure_ascii=False)):
        with pytest.raises(AiUnavailable):
            _provider(wrong).chapter_review(DOC, NO_RULES)


def test_empty_paragraphs_do_not_call_llm() -> None:
    broken = _Broken(responses=["x"])
    p = LlmProvider(broken, broken, "fake")
    assert p.live_check(DOC, ["para_99"], NO_RULES).proposals == []


def test_book_rules_go_into_prompt() -> None:
    book = BookRules(rules=["외래어는 국립국어원 표기를 따른다"], keep=["~하였다"])
    prompt = prompts.chapter_review_prompt([("para_01", "본문")], book)
    assert "외래어는 국립국어원 표기를 따른다" in prompt
    assert "~하였다" in prompt
    assert "[para_01] 본문" in prompt
    assert "표기 원칙" not in prompts.live_check_prompt([("p", "본문")], NO_RULES)


def test_parse_answer_accepts_dict_and_model() -> None:
    assert parse_answer({"suggestions": []}).suggestions == []
    assert parse_answer(Answer(suggestions=[])).suggestions == []


def test_tests_always_use_demo_provider() -> None:
    # D-21: 개발용 .env가 llm이어도 테스트는 데모(conftest가 고정)
    from app.ai import get_provider
    from app.ai.demo import DemoProvider

    assert isinstance(get_provider(), DemoProvider)
