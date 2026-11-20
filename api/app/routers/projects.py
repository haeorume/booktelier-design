"""책 API. A-02·A-03·A-07·A-08은 실제, A-10·A-13·A-15는 F3까지 가짜 응답(신원·책 범위 확인은 실제)."""

from uuid import UUID

from fastapi import APIRouter, status

from app.auth.permissions import Role
from app.auth.token import Me, require, require_project
from app.auth.tokens import hash_token, new_invite_token, new_secret_token
from app.db import invites as invite_db
from app.db import participants as participant_db
from app.db import projects as project_db
from app.db.session import DbSession
from app.errors import AppError
from app.routers import _convert, _fake
from app.schemas.common import ChapterStatus, error_responses
from app.schemas.invite import Invite, InviteCreateIn
from app.schemas.project import (
    Chapter,
    ChapterCreateIn,
    LayoutOut,
    LayoutPatchIn,
    ParticipantBrief,
    ProjectCard,
    ProjectCreateIn,
    ProjectCreateOut,
    ProjectDetail,
    ProjectListIn,
)

router = APIRouter(tags=["projects"])

# 책을 만든 편집자의 표시 이름(1차 createBook과 같음). 이름을 묻는 화면은 없어요.
EDITOR_NAME = "편집자"
# 첫 장 제목(11.21 정모 결정). 바꾸는 것은 장 제목 수정 기능에 맡겨요.
FIRST_CHAPTER_TITLE = "1장"


@router.post(
    "/projects",
    summary="A-02 책 만들기",
    response_model=ProjectCreateOut,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(409),
)
def create_project(body: ProjectCreateIn, db: DbSession) -> ProjectCreateOut:
    """누구나 불러요. 책, 빈 첫 장, 편집자 참여자를 만들고 편집자 토큰은 이 응답에서만 줘요(D-27)."""
    title = body.title.strip()
    if not title:  # 빈칸만 있어도 만들 수 없어요(FR-01 ③)
        raise AppError(422, "invalid_request", "title: 책 제목이 비어 있어요")
    token = new_secret_token()
    project, chapter, editor = project_db.create(
        db,
        project_id=body.id,
        title=title,
        template_id=body.template_id,
        chapter_id=body.first_chapter_id,
        chapter_title=FIRST_CHAPTER_TITLE,
        editor_name=EDITOR_NAME,
        editor_anon_id=body.anon_id,
        editor_token_hash=hash_token(token),
    )
    return ProjectCreateOut(
        project=_convert.project(project),
        chapter=_convert.chapter(chapter),
        participant=_convert.participant(editor),
        editor_token=token,
        editor_url=_convert.web_url(f"/e/{token}"),
    )


def _stage(statuses: list[str]) -> ChapterStatus:
    """책 진행 단계는 장 상태에서 계산해요(FR-02, FR-12). 검토 요청이 하나라도 있으면 검토 요청,
    장이 모두 검토 완료면 검토 완료, 아니면 수정 중."""
    if "review_requested" in statuses:
        return "review_requested"
    if statuses and all(s == "reviewed" for s in statuses):
        return "reviewed"
    return "editing"


def _role(value: str) -> Role:
    for r in ("editor", "author", "designer"):
        if r == value:
            return r
    raise AppError(500, "bad_role", "알 수 없는 역할이 있어요")


@router.post("/projects/list", summary="A-03 내 책 목록", response_model=list[ProjectCard])
def list_projects(body: ProjectListIn, db: DbSession) -> list[ProjectCard]:
    """브라우저가 가진 편집자 토큰들을 보내면 그 책 카드를 줘요(D-38).
    맞지 않는 토큰과 편집자가 아닌 토큰은 빠져요."""
    found = participant_db.find_many_by_token_hashes(
        db, [hash_token(t) for t in body.editor_tokens]
    )
    editors = [p for p in found if p.role == "editor"]
    return [
        ProjectCard(
            id=row.project.id,
            title=row.project.title,
            template_id=row.project.template_id,
            stage=_stage(row.chapter_statuses),
            participants=[
                ParticipantBrief(id=p.id, role=_role(p.role), display_name=p.display_name)
                for p in row.participants
            ],
            todo_count=row.todo_count,
            updated_at=row.project.updated_at,
        )
        for row in project_db.cards_for_editors(db, editors)
    ]


@router.get(
    "/projects/{project_id}",
    summary="A-10 책 열기",
    response_model=ProjectDetail,
    responses=error_responses(401, 403, 404),
)
def get_project(project_id: UUID, me: Me) -> ProjectDetail:
    """F3까지 가짜 응답. 신원과 책 범위는 실제로 확인해요."""
    require_project(me, project_id)
    return ProjectDetail(
        project=_fake.project(project_id),
        chapters=[_fake.chapter_summary()],
        participants=_fake.participants(),
    )


@router.post(
    "/projects/{project_id}/chapters",
    summary="A-13 장 추가",
    response_model=Chapter,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(401, 403, 404, 409),
)
def create_chapter(project_id: UUID, body: ChapterCreateIn, me: Me) -> Chapter:
    """편집자·작가(Q-20). F3까지 가짜 응답. 새 장은 원고가 비어 있고 version 1이에요."""
    require_project(me, project_id)
    ch = _fake.chapter(body.id, body.title)
    return ch.model_copy(
        update={
            "project_id": project_id,
            "order": 2,
            "version": 1,
            "doc": ch.doc.model_copy(update={"content": []}),
        }
    )


@router.patch(
    "/projects/{project_id}/layout",
    summary="A-15 조판 값 바꾸기",
    response_model=LayoutOut,
    responses=error_responses(401, 403, 404),
)
def patch_layout(project_id: UUID, body: LayoutPatchIn, me: Me) -> LayoutOut:
    """편집자·디자이너(FR-16 ③). F3까지 가짜 응답. 바꾼 사람과 시각은 서버가 정해요(C-6)."""
    require_project(me, project_id)
    require(me, "change_layout")
    layout = _fake.LAYOUT
    if body.layout is not None:
        layout = layout.model_copy(update=body.layout.model_dump(exclude_unset=True))
    return LayoutOut(
        template_id=body.template_id or "essay",
        layout=layout,
        layout_updated_by=me.participant_id,
        layout_updated_at=_fake.T1,
    )


def _editor_of(me: Me, project_id: UUID, db: DbSession) -> None:
    require_project(me, project_id)
    require(me, "share_role_links")
    if project_db.get(db, project_id) is None:
        raise AppError(404, "not_found", "책을 찾을 수 없어요")


@router.get(
    "/projects/{project_id}/invites",
    summary="A-07 초대 링크 목록",
    response_model=list[Invite],
    responses=error_responses(401, 403, 404),
)
def list_invites(project_id: UUID, me: Me, db: DbSession) -> list[Invite]:
    """편집자만. 다시 복사할 수 있게 주소를 같이 줘요(D-37). 취소한 링크도 상태와 함께 와요."""
    _editor_of(me, project_id, db)
    return [_convert.invite(r) for r in invite_db.list_by_project(db, project_id)]


@router.post(
    "/projects/{project_id}/invites",
    summary="A-08 초대 링크 만들기",
    response_model=Invite,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(401, 403, 404),
)
def create_invite(project_id: UUID, body: InviteCreateIn, me: Me, db: DbSession) -> Invite:
    """편집자만. 그 역할의 쓸 수 있는 링크가 이미 있으면 그것을 돌려줘요(링크가 쌓이지 않게)."""
    _editor_of(me, project_id, db)
    token = new_invite_token()
    row = invite_db.create_or_get_active(
        db, project_id=project_id, role=body.role, token=token, token_hash=hash_token(token)
    )
    return _convert.invite(row)
