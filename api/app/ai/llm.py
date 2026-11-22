"""실제 LLM 제공자(F6, D-21). LangChain ChatOpenAI로 OpenAI 호환 API(엘리스 플랫폼)를 불러요.

- LLM은 '어느 문단의 어떤 글자를 무엇으로'만 답해요. 글자 위치(UTF-16, D-19)는 서버가 원고에서 찾아요.
  원고에 없는 원문이나 주지 않은 문단 id는 버려요(LLM이 지어낸 자리로 원고를 바꾸지 않게).
- 답이 늦거나 오류면 AiUnavailable을 내요. 부르는 쪽이 503으로 알리고 원고 저장은 막지 않아요(NFR-03).
- 원고 글자는 로그에 남기지 않아요. 실패 로그에는 종류와 문단 수만 적어요.
"""

import json
import logging
from collections.abc import Sequence
from typing import Any, Literal

import openai
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field, SecretStr, ValidationError

from app import docops
from app.ai import prompts
from app.ai.provider import AiUnavailable, BookRules, EvidenceChunk, Proposal, ReviewResult
from app.config import Settings

log = logging.getLogger(__name__)

Kind = Literal["spelling", "spacing", "notation", "polish"]


class Item(BaseModel):
    """LLM이 내는 고칠 거리 하나(FR-24)."""

    paragraph_id: str
    original: str = Field(min_length=1)
    replacement: str
    alternatives: list[str] = Field(default_factory=list)
    kind: Kind
    reason: str = Field(min_length=1)
    # 같은 문단에 같은 원문이 여럿이면 몇 번째인지(1부터). 하나뿐이면 비워도 돼요.
    occurrence: int | None = Field(default=None, ge=1)
    # 장 검토의 참고 자료 번호([근거 n]). 없으면 null(D-26).
    evidence: int | None = None


class Answer(BaseModel):
    """맨 바깥 모양은 늘 {"suggestions": [...]}. 이 칸이 없으면 '발견 없음'이 아니라 실패예요(FR-21 ②④)."""

    suggestions: list[Item]


def _paragraphs(doc: dict[str, Any], ids: list[str] | None) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for p in doc.get("content") or []:
        pid = str((p.get("attrs") or {}).get("id") or "")
        if not pid or (ids is not None and pid not in ids):
            continue
        text = "".join(str(t.get("text", "")) for t in p.get("content") or [])
        if text.strip():
            out.append((pid, text))
    return out


# 화면에 보일 근거 발췌 길이(글자)
EXCERPT = 200


def evidence_of(item: Item, evidence: Sequence[EvidenceChunk]) -> dict[str, Any] | None:
    """LLM이 적은 근거 번호 → evidence. 넣어 준 자료의 번호가 아니면 버려요(지어낸 근거 막기)."""
    chunk = next((e for e in evidence if e.n == item.evidence), None) if item.evidence else None
    if chunk is None:
        return None
    return {
        "type": chunk.type,
        "label": chunk.label,
        "excerpt": chunk.content[:EXCERPT],
        "chunk_id": chunk.chunk_id,
    }


def to_proposals(
    answer: Answer,
    paragraphs: list[tuple[str, str]],
    target_role: str,
    evidence: Sequence[EvidenceChunk] = (),
) -> list[Proposal]:
    """LLM 답 → 제안. 원문을 원고에서 찾아 UTF-16 위치를 붙여요(D-19).

    같은 문단에 같은 원문이 여럿이면 occurrence(몇 번째)로 고르고, 없거나 맞지 않으면 버려요.
    엉뚱한 자리에 붙으면 맞게 쓴 문장을 고치게 되기 때문이에요(NFR-05, Codex 검수 11.21).
    """
    texts = dict(paragraphs)
    out: list[Proposal] = []
    for item in answer.suggestions:
        text = texts.get(item.paragraph_id)
        if text is None or item.original == item.replacement:
            continue
        hits = docops.u16_find_all(text, item.original)
        if not hits:
            continue  # 원고에 없는 원문(지어낸 글자)은 버려요
        if len(hits) == 1:
            start = hits[0]
        elif item.occurrence is not None and item.occurrence <= len(hits):
            start = hits[item.occurrence - 1]
        else:
            continue  # 몇 번째인지 모르면 버려요
        alternatives = [
            a for a in item.alternatives if a and a not in (item.replacement, item.original)
        ]
        out.append(
            Proposal(
                paragraph_id=item.paragraph_id,
                start=start,
                end=start + docops.u16_len(item.original),
                original=item.original,
                replacement=item.replacement,
                alternatives=alternatives[:2],
                kind=item.kind,
                reason=item.reason.strip(),
                target_role=target_role,
                evidence=evidence_of(item, evidence),
            )
        )
    return out


def parse_answer(raw: Any) -> Answer:
    """구조화 출력이면 그대로, 글이면 JSON을 읽어요. 코드 블록(```json)도 벗겨요."""
    if isinstance(raw, Answer):
        return raw
    if isinstance(raw, dict):
        return Answer.model_validate(raw)
    text = str(getattr(raw, "content", raw)).strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("\n") + 1 :] if "\n" in text else text
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("JSON이 없어요")
    return Answer.model_validate(json.loads(text[start : end + 1]))


class LlmProvider:
    """AI_PROVIDER=llm. 모델과 주소는 설정에서(LLM_BASE_URL, LLM_MODEL, LLM_API_KEY)."""

    def __init__(self, live: BaseChatModel, review: BaseChatModel, model: str) -> None:
        self._live = live
        self._review = review
        self.model = model

    @classmethod
    def from_settings(cls, settings: Settings) -> "LlmProvider":
        from langchain_openai import ChatOpenAI

        if not settings.llm_base_url or not settings.llm_api_key.get_secret_value():
            raise AiUnavailable("LLM 주소나 키가 없어요(LLM_BASE_URL, LLM_API_KEY)")

        def make(timeout: float) -> BaseChatModel:
            return ChatOpenAI(
                model=settings.llm_model,
                base_url=settings.llm_base_url,
                api_key=SecretStr(settings.llm_api_key.get_secret_value()),
                timeout=timeout,
                max_retries=1,
                # temperature는 넣지 않아요. gpt-6.2-sol 같은 추론 모델은 기본값(1)만 받아요(11.21 실제 호출 확인).
            )

        return cls(
            make(settings.llm_timeout_live), make(settings.llm_timeout_review), settings.llm_model
        )

    def _ask(self, chat: BaseChatModel, prompt: str, what: str, paragraphs: int) -> Answer:
        messages = [SystemMessage(prompts.SYSTEM), HumanMessage(prompt)]
        try:
            # 구조화 출력(JSON 스키마)을 먼저 써요. 엘리스 쪽이 받지 않으면 글로 받아 직접 읽어요.
            try:
                raw = chat.with_structured_output(Answer, method="json_schema").invoke(messages)
            except (ValueError, NotImplementedError, TypeError, openai.BadRequestError):
                raw = chat.invoke(messages)
            return parse_answer(raw)
        except (ValidationError, ValueError, json.JSONDecodeError) as e:
            log.warning(
                "LLM 답을 읽지 못했어요: %s, 문단 %d개 (%s)", what, paragraphs, type(e).__name__
            )
            raise AiUnavailable("AI 답을 읽지 못했어요") from e
        except Exception as e:  # 시간 초과·연결·인증 오류. 원고는 막지 않아요(NFR-03)
            log.warning("LLM 호출 실패: %s, 문단 %d개 (%s)", what, paragraphs, type(e).__name__)
            raise AiUnavailable("AI가 지금 답하지 않아요") from e

    def live_check(
        self, doc: dict[str, Any], paragraph_ids: list[str], book: BookRules
    ) -> ReviewResult:
        paragraphs = _paragraphs(doc, paragraph_ids)
        if not paragraphs:
            return ReviewResult([], self.model)
        answer = self._ask(
            self._live,
            prompts.live_check_prompt(paragraphs, book),
            "live_check",
            len(paragraphs),
        )
        return ReviewResult(to_proposals(answer, paragraphs, "author"), self.model)

    def chapter_review(
        self, doc: dict[str, Any], book: BookRules, evidence: Sequence[EvidenceChunk] = ()
    ) -> ReviewResult:
        paragraphs = _paragraphs(doc, None)
        if not paragraphs:
            return ReviewResult([], self.model)
        answer = self._ask(
            self._review,
            prompts.chapter_review_prompt(paragraphs, book, evidence),
            "chapter_review",
            len(paragraphs),
        )
        return ReviewResult(to_proposals(answer, paragraphs, "editor", evidence), self.model)
