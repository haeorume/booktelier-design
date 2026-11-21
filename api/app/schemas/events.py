"""이벤트(A-33)와 퍼널·작업 지표(A-34). 칸은 events 탭 '1. 공통 칸', 지표는 db 탭 5번·FR-40·FR-49.

이벤트에는 원고 글자를 넣지 않아요(S-09). 추가 정보(props)의 글자 길이를 짧게 막아요.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import Role

# 추가 정보 글자 값 하나의 최대 길이. 이름·종류·역할 같은 짧은 값만 담아요(원고 문장이 들어오지 않게, S-09).
PROPS_TEXT_MAX = 80
PROPS_KEYS_MAX = 20
# 이벤트별로 지표가 숫자로 읽는 추가 정보 칸
NUMBER_PROPS: dict[str, tuple[str, ...]] = {"review_completed": ("pending_edits",)}


class EventIn(BaseModel):
    """화면이 남긴 행동 하나(events 탭 '1. 공통 칸'). server_ts는 서버가 정해요."""

    event_id: UUID
    name: str = Field(min_length=1, max_length=60)
    ts: int = Field(ge=0, description="브라우저 시각(ms)")
    anon_id: UUID
    session_id: UUID
    participant_id: UUID | None = None
    project_id: UUID | None = None
    chapter_id: UUID | None = None
    role: Role | None = None
    path: str = Field(min_length=1, max_length=300)
    props: dict[str, Any] = Field(default_factory=dict)
    chapter_version: int | None = Field(default=None, ge=1)
    target_type: Literal["ai_suggestion", "suggested_edit", "comment"] | None = None
    target_id: UUID | None = None
    status_after: str | None = Field(default=None, max_length=40)

    @field_validator("props")
    @classmethod
    def _short_props(cls, v: dict[str, Any]) -> dict[str, Any]:
        """추가 정보는 짧은 값만(S-09). 글자가 길거나 칸이 많으면 받지 않아요."""
        if len(v) > PROPS_KEYS_MAX:
            raise ValueError(f"props: 칸은 {PROPS_KEYS_MAX}개까지예요")
        for key, value in v.items():
            if isinstance(value, str) and len(value) > PROPS_TEXT_MAX:
                raise ValueError(f"props.{key}: 글자는 {PROPS_TEXT_MAX}자까지예요(원고 글자 금지)")
            if isinstance(value, dict | list):
                raise ValueError(f"props.{key}: 값은 글자·숫자·참거짓만 받아요")
        return v

    @model_validator(mode="after")
    def _known_numbers(self) -> "EventIn":
        """지표가 숫자로 셈하는 칸은 숫자만(Codex 검수 11.22). 잘못 오면 지표 화면(A-34) 전체가 깨져요."""
        for key in NUMBER_PROPS.get(self.name, ()):
            value = self.props.get(key)
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, int) or value < 0
            ):
                raise ValueError(f"props.{key}: 0 이상의 정수여야 해요")
        return self


class EventsIn(BaseModel):
    """묶어서 보내요(A-33). 화면을 떠날 때는 sendBeacon(text/plain)으로 와요."""

    events: list[EventIn] = Field(min_length=1, max_length=50)


class EventsOut(BaseModel):
    """받은 수와 새로 저장한 수. 같은 event_id가 다시 오면 저장하지 않아요."""

    received: int
    stored: int


class FunnelRow(BaseModel):
    """퍼널 한 단계(FR-40). 도달: 그 단계 이벤트가 있는 책 수, 이탈: 직전 단계엔 왔지만 여기엔 없는 책 수."""

    step: int
    label: str
    event: str
    role: Role | None
    reached: int
    dropped: int


class Kpi(BaseModel):
    """작업 지표 하나(FR-49, db 탭 5번). value가 null이면 셀 건이 없거나 계산 방법이 정해지지 않았어요."""

    key: str
    label: str
    value: float | None
    unit: Literal["분", "%"]
    count: int = Field(description="계산에 쓴 건수(분모)")
    note: str | None = None


class MetricsOut(BaseModel):
    """A-34. 서버가 받은 이벤트와 DB 표로 셈해요."""

    generated_at: datetime
    events_total: int
    funnel: list[FunnelRow]
    kpis: list[Kpi]
