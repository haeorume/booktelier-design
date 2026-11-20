"""함께 작업(A-30, A-31). 몇 초 간격 새로 읽기(D-31, C-7)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import Role
from app.schemas.layout import Layout
from app.schemas.project import ChapterSummary

# 몇 초 간격의 잠정값(F4 계획, 11.21 확인). 화면은 web/src/data/에 같은 값을 둬요.
PRESENCE_TTL_SECONDS = 30  # 이 시간 안에 위치를 알린 사람만 접속자
CURSOR_OVERLAP_SECONDS = 5  # 커밋이 늦은 변경을 놓치지 않게 since보다 조금 앞부터 봐요


# A-30 접속자와 작업 위치
class PresenceIn(BaseModel):
    """지금 보는 장과 문단(문단 단위, FR-47 ③). 이벤트로 쌓지 않아요."""

    chapter_id: UUID
    paragraph_id: str | None = Field(default=None, min_length=1, max_length=100)


class Presence(BaseModel):
    """접속자 한 사람. 편집자는 이름 대신 '편집자'로 보여요(FR-19)."""

    participant_id: UUID
    role: Role
    display_name: str
    chapter_id: UUID | None
    paragraph_id: str | None
    seen_at: datetime


# A-31 바뀐 것 받기
class ChangesOut(BaseModel):
    """since 뒤에 바뀐 것. since가 없으면 장 전부와 조판 값.

    서버는 since보다 몇 초 앞부터 보므로 같은 변경이 두 번 올 수 있어요. 화면은 version으로 걸러요.
    """

    cursor: datetime = Field(description="다음 요청의 since")
    chapters: list[ChapterSummary] = Field(description="원고·상태가 바뀌었거나 새로 생긴 장")
    shared_chapter_ids: list[UUID] = Field(
        description="의견·수정 제안이 바뀐 장(A-22를 다시 읽어요)"
    )
    layout: Layout | None = Field(description="조판 값이 바뀌었으면 새 값, 아니면 null")
    presence: list[Presence] = Field(description="나를 뺀 지금 접속자와 각자 위치")
