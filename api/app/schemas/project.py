"""책·장·참여자 모델(A-01~A-03, A-10~A-15)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ChapterDoc, ChapterStatus, Role, TemplateId
from app.schemas.layout import Layout


class MeOut(BaseModel):
    """A-01·A-04. 토큰을 가진 사람."""

    kind: Literal["editor", "participant"]
    participant_id: UUID
    role: Role
    display_name: str
    project_id: UUID


class Participant(BaseModel):
    id: UUID
    project_id: UUID
    role: Role
    display_name: str
    created_at: datetime
    last_seen_at: datetime | None


class Project(BaseModel):
    id: UUID
    title: str
    template_id: TemplateId
    layout: Layout
    layout_updated_by: UUID | None
    layout_updated_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ChapterSummary(BaseModel):
    """장 목록의 한 줄. 원고(doc)는 빼요."""

    id: UUID
    project_id: UUID
    order: int  # DB 칸은 sort_order(order는 SQL 예약어, data-contract)
    title: str
    status: ChapterStatus
    version: int
    status_changed_at: datetime | None
    updated_at: datetime


class Chapter(ChapterSummary):
    doc: ChapterDoc


# A-02 책 만들기
class ProjectCreateIn(BaseModel):
    id: UUID  # 화면이 만든 UUID(D-27, C-5)
    title: str = Field(min_length=1, max_length=200)  # 비어 있으면 만들 수 없음(FR-01)
    template_id: TemplateId
    first_chapter_id: UUID
    # 이 브라우저의 익명 id. 편집자 참여자에 남겨요(data-contract participant.anon_id)
    anon_id: UUID
    # 발표용: 첫 장을 1차 예시 원고로 채워요(D-39). 기본은 빈 첫 장(FR-01 ①).
    start_with_sample: bool = False


class ProjectCreateOut(BaseModel):
    project: Project
    chapter: Chapter
    participant: Participant  # 책을 만든 편집자(정할 것 13 잠정값)
    editor_token: str  # 이 응답에서만 줘요. 서버는 해시만 저장(D-27)
    editor_url: str  # 편집자 링크(A-04로 들어오는 주소)


# A-03 내 책 목록
class ProjectListIn(BaseModel):
    """브라우저가 가진 편집자 토큰들. 맞지 않는 토큰은 응답에서 빠져요(D-38)."""

    editor_tokens: list[str] = Field(min_length=1, max_length=50)


class ParticipantBrief(BaseModel):
    id: UUID
    role: Role
    display_name: str


class ProjectCard(BaseModel):
    id: UUID
    title: str
    template_id: TemplateId
    stage: ChapterStatus  # 진행 단계. 장 상태에서 계산(FR-02, FR-12)
    participants: list[ParticipantBrief]
    todo_count: int  # 확인할 일 수. 서버가 first_view로 세요(FR-02 ②)
    updated_at: datetime
    first_chapter_id: UUID | None  # 카드를 누르면 여는 장(N-09: 없으면 첫 장)


# A-10 책 열기
class ProjectDetail(BaseModel):
    project: Project
    chapters: list[ChapterSummary]
    participants: list[Participant]


# A-12 원고 저장
class DocSaveIn(BaseModel):
    doc: ChapterDoc
    base_version: int = Field(ge=1)


class DocSaveOut(BaseModel):
    version: int
    updated_at: datetime


class ConflictOut(BaseModel):
    """409 여러 종류(AI 제안·수정 제안 처리). code로 화면이 안내를 골라요(C-3).

    - version_conflict: base_version이 최신이 아님. 이때만 latest(최신 장)가 와요(C-4).
    - source_changed: 원문이 먼저 바뀌었거나 지워짐
    - invalid_transition: 이미 처리된 제안
    - undo_unavailable: 바로 앞 동작이 아니라 실행 취소할 수 없음
    """

    code: Literal["version_conflict", "source_changed", "invalid_transition", "undo_unavailable"]
    message: str
    latest: Chapter | None = None


class VersionConflictOut(BaseModel):
    """409. 최신 원고를 같이 줘요(C-4, D-30)."""

    code: Literal["version_conflict"]
    message: str
    latest: Chapter


# A-13 장 추가
class ChapterCreateIn(BaseModel):
    id: UUID
    title: str = Field(min_length=1, max_length=200)


# A-14 장 상태 바꾸기
class ChapterStatusIn(BaseModel):
    to: ChapterStatus


# A-15 조판 값 바꾸기
class LayoutPatchIn(BaseModel):
    """바꾼 값만 보내요. 템플릿을 바꾸면 조판 값이 그 템플릿 기본값으로 돌아가요(FR-16 ④)."""

    template_id: TemplateId | None = None
    layout: Layout | None = None


class LayoutOut(BaseModel):
    template_id: TemplateId
    layout: Layout
    layout_updated_by: UUID
    layout_updated_at: datetime


# A-29 검토본
class SnapshotCreateIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)


class SnapshotSummary(BaseModel):
    id: UUID
    chapter_id: UUID
    version: int
    label: str
    created_by: UUID
    created_at: datetime


class Snapshot(SnapshotSummary):
    doc: ChapterDoc
