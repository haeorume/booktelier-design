"""AI 제안·의견·수정 제안·처음 본 기록·표기 원칙(A-16~A-28). 이름과 상태 값은 data-contract 확정 값(D-05)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import Role

Kind = Literal["spelling", "spacing", "notation", "polish"]  # D-04
AiStatus = Literal["pending", "applied", "dismissed", "sent", "merged", "stale"]
EditStatus = Literal["pending", "accepted", "rejected", "source_deleted"]
CommentStatus = Literal["open", "resolved"]


class Anchor(BaseModel):
    """문단 id + 서식 제외 텍스트 기준 글자 위치. start 포함, end 제외, UTF-16 단위(D-19)."""

    paragraph_id: str = Field(min_length=1)
    start: int = Field(ge=0)
    end: int = Field(ge=0)


class Evidence(BaseModel):
    """AI 제안의 근거(RAG, D-26, data-contract ai_suggestion.evidence). 못 찾으면 evidence가 null이고 화면은 '근거 없음'."""

    type: Literal["norm", "chapter"]  # 어문 규범 조항 · 같은 책의 다른 장 문단
    label: str  # 예: 한글 맞춤법 제42항, 3장 2문단
    excerpt: str
    chunk_id: str


class AiSuggestion(BaseModel):
    """보내기 전까지 주인만 봐요(D-29)."""

    id: UUID
    chapter_id: UUID
    owner_participant_id: UUID
    anchor: Anchor
    original: str
    replacement: str
    alternatives: list[str]
    kind: Kind
    reason: str
    evidence: Evidence | None
    source: Literal["live_check", "chapter_review"]
    target_role: Role
    base_version: int
    status: AiStatus
    created_at: datetime
    decided_at: datetime | None


# A-16 실시간 교정
class LiveCheckIn(BaseModel):
    """원문은 보내지 않아요. 서버가 저장본을 읽어요(C-9)."""

    paragraph_ids: list[str] = Field(min_length=1, max_length=200)
    base_version: int = Field(ge=1)


# A-17 장 검토
class ReviewIn(BaseModel):
    base_version: int = Field(ge=1)


class ReviewOut(BaseModel):
    """종류별 개수는 지금 원고에서 자리를 찾은 제안으로 세요(FR-21 ②, FR-22)."""

    summary: dict[Kind, int]
    suggestions: list[AiSuggestion]


# A-20 처리
class ApplyIn(BaseModel):
    """choice 0은 수정안, 1·2는 대안(FR-27 ①)."""

    choice: int = Field(default=0, ge=0, le=2)
    base_version: int = Field(ge=1)


class UndoIn(BaseModel):
    base_version: int = Field(ge=1)


class AiActionOut(BaseModel):
    suggestion: AiSuggestion
    chapter_version: int | None  # 원고를 바꿨으면 새 버전(apply·undo)


class Comment(BaseModel):
    id: UUID
    chapter_id: UUID
    author_id: UUID
    parent_id: UUID | None
    anchor: Anchor | None  # 답글은 비움
    original: str | None
    body: str
    status: CommentStatus
    ai_origin_id: UUID | None
    created_at: datetime
    resolved_at: datetime | None
    resolved_by: UUID | None


class SuggestedEdit(BaseModel):
    id: UUID
    chapter_id: UUID
    author_id: UUID
    anchor: Anchor
    original: str
    replacement: str
    reason: str | None
    kind: Kind | None
    status: EditStatus
    ai_origin_id: UUID | None
    base_version: int
    created_at: datetime
    decided_at: datetime | None
    decided_by: UUID | None


# A-21 보내기
class SendIn(BaseModel):
    as_: Literal["comment", "suggested_edit"] = Field(alias="as")
    text: str = Field(min_length=1, max_length=2000)  # 다듬은 문구(의견 본문 또는 수정 이유)
    choice: int = Field(default=0, ge=0, le=2)  # 수정 제안으로 보낼 때 고른 수정안

    model_config = {"populate_by_name": True}


class SendOut(BaseModel):
    """수정 제안이면 카드 하나(설명용 의견 없음, FR-29 ⑤)."""

    suggestion: AiSuggestion
    comment: Comment | None
    suggested_edit: SuggestedEdit | None


# A-22 함께 봄
class SharedOut(BaseModel):
    """자리는 지금 원고에서 다시 찾은 값이에요(NFR-05). 원문이 지워진 수정 제안은 source_deleted."""

    comments: list[Comment]
    suggested_edits: list[SuggestedEdit]
    # 지금 보는 사람이 처음 본 기록(A-27)이 있는 의견·수정 제안 id. 확인할 일 표시에 써요(FR-02 ②).
    seen: list[UUID]


# A-23 의견
class CommentIn(BaseModel):
    id: UUID
    body: str = Field(min_length=1, max_length=2000)
    anchor: Anchor | None = None
    original: str | None = None
    parent_id: UUID | None = None


# A-25 수정 제안
class SuggestedEditIn(BaseModel):
    id: UUID
    anchor: Anchor
    original: str = Field(min_length=1)
    replacement: str
    reason: str | None = Field(default=None, max_length=2000)  # 비워도 돼요(Q-22)
    kind: Kind | None = None


# A-26 수락
class AcceptIn(BaseModel):
    base_version: int = Field(ge=1)


class AcceptOut(BaseModel):
    suggested_edit: SuggestedEdit
    chapter_version: int
    merged_ai_suggestion_id: UUID | None  # 원래 AI 제안이 반영됨이 됐으면 그 id


# A-27 처음 본 기록
class ViewIn(BaseModel):
    target_type: Literal["comment", "suggested_edit"]
    target_id: UUID


# A-28 표기 원칙
class StyleRuleIn(BaseModel):
    type: Literal["rule", "keep"]
    text: str = Field(min_length=1, max_length=200)


class StyleRule(BaseModel):
    id: UUID
    project_id: UUID
    type: Literal["rule", "keep"]
    text: str
    created_by: UUID
    created_at: datetime
