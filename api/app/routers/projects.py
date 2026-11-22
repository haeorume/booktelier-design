"""책 API(A-02, A-03, A-07, A-08, A-10, A-13, A-15)."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, status

from app.ai.demo import sample_manuscript
from app.auth.permissions import Role
from app.auth.token import Me, require, require_project
from app.auth.tokens import hash_token, new_invite_token, new_secret_token
from app.db import chapters as chapter_db
from app.db import invites as invite_db
from app.db import participants as participant_db
from app.db import projects as project_db
from app.db.models import Project as ProjectRow
from app.db.session import DbSession
from app.errors import AppError
from app.routers import _convert
from app.schemas.common import ChapterStatus, error_responses
from app.schemas.invite import Invite, InviteCreateIn
from app.schemas.layout import Layout
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
    ProjectTitleIn,
)
from app.schemas.project import Project as ProjectOut
from app.templates import default_layout

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
    chapter_title, chapter_doc = (
        sample_manuscript() if body.start_with_sample else (FIRST_CHAPTER_TITLE, None)
    )
    project, chapter, editor = project_db.create(
        db,
        project_id=body.id,
        title=title,
        template_id=body.template_id,
        layout=default_layout(body.template_id).model_dump(exclude_none=True),
        chapter_id=body.first_chapter_id,
        chapter_title=chapter_title,
        chapter_doc=chapter_doc,
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
            first_chapter_id=row.first_chapter_id,
        )
        for row in project_db.cards_for_editors(db, editors)
    ]


def _project_of(db: DbSession, me: Me, project_id: UUID) -> ProjectRow:
    require_project(me, project_id)
    row = project_db.get(db, project_id)
    if row is None:
        raise AppError(404, "not_found", "책을 찾을 수 없어요")
    return row


@router.get(
    "/projects/{project_id}",
    summary="A-10 책 열기",
    response_model=ProjectDetail,
    responses=error_responses(401, 403, 404),
)
def get_project(project_id: UUID, me: Me, db: DbSession) -> ProjectDetail:
    """참여자 모두. 책, 장 목록(원고 없이), 참여자. 미리보기(PV-01)도 이것과 A-11을 써요(D-34)."""
    row = _project_of(db, me, project_id)
    return ProjectDetail(
        project=_convert.project(row),
        chapters=[_convert.chapter_summary(c) for c in chapter_db.list_by_project(db, project_id)],
        participants=[
            _convert.participant(p) for p in participant_db.list_by_project(db, project_id)
        ],
    )


@router.post(
    "/projects/{project_id}/chapters",
    summary="A-13 장 추가",
    response_model=Chapter,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(401, 403, 404, 409),
)
def create_chapter(project_id: UUID, body: ChapterCreateIn, me: Me, db: DbSession) -> Chapter:
    """편집자·작가(Q-20, FR-15). 새 장은 원고가 비어 있고 version 1, 순서는 마지막 다음이에요."""
    _project_of(db, me, project_id)
    require(me, "add_chapter")
    title = body.title.strip()
    if not title:
        raise AppError(422, "invalid_request", "title: 장 제목이 비어 있어요")
    row = chapter_db.create(db, project_id=project_id, chapter_id=body.id, title=title)
    return _convert.chapter(row)


def _merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """조판 값은 바꾼 칸만 와요. 여백·쪽 공통 설정처럼 안에 든 값도 칸 단위로 합쳐요."""
    out = dict(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


@router.patch(
    "/projects/{project_id}/layout",
    summary="A-15 조판 값 바꾸기",
    response_model=LayoutOut,
    responses=error_responses(401, 403, 404),
)
def patch_layout(project_id: UUID, body: LayoutPatchIn, me: Me, db: DbSession) -> LayoutOut:
    """편집자·디자이너(FR-16 ③). 바꾼 값만 보내요. 바꾼 사람과 시각은 서버가 정해요(C-6).

    템플릿을 바꾸면 조판 값(쪽 공통 설정 포함)이 그 템플릿 기본값으로 돌아가요(FR-16 ④).
    같은 요청에 layout도 있으면 기본값 위에 그 값을 얹어요.
    """
    _project_of(db, me, project_id)
    require(me, "change_layout")
    # 잠그고 최신 값으로 다시 읽은 뒤 합쳐요. 겹친 PATCH가 서로의 변경을 지우지 않게(Codex 검수 11.21).
    row = project_db.lock(db, project_id)
    if row is None:
        raise AppError(404, "not_found", "책을 찾을 수 없어요")
    template_id = body.template_id or row.template_id
    base: dict[str, Any]
    if body.template_id is not None and body.template_id != row.template_id:
        base = default_layout(body.template_id).model_dump(exclude_none=True)
    else:
        base = dict(row.layout or {})
    if body.layout is not None:
        base = _merge(base, body.layout.model_dump(exclude_unset=True))
    layout = Layout.model_validate(base)  # 모양 확인
    saved = project_db.update_layout(
        db,
        row,
        template_id=template_id,
        layout=layout.model_dump(exclude_none=True),
        by=me.participant_id,
    )
    assert saved.layout_updated_by is not None and saved.layout_updated_at is not None
    return LayoutOut(
        template_id=_convert.project(saved).template_id,
        layout=Layout.model_validate(saved.layout),
        layout_updated_by=saved.layout_updated_by,
        layout_updated_at=saved.layout_updated_at,
    )


@router.patch(
    "/projects/{project_id}",
    summary="A-36 책 제목 고치기",
    response_model=ProjectOut,
    responses=error_responses(401, 403, 404, 422),
)
def rename_project(project_id: UUID, body: ProjectTitleIn, me: Me, db: DbSession) -> ProjectOut:
    """편집자만(FR-55, D-42). 다른 참여자는 다음에 책을 열 때 새 제목을 봐요."""
    _project_of(db, me, project_id)
    require(me, "rename_project")
    title = body.title.strip()
    if not title:
        raise AppError(422, "invalid_request", "title: 비어 있어요")
    row = project_db.lock(db, project_id)
    if row is None:
        raise AppError(404, "not_found", "책을 찾을 수 없어요")
    return _convert.project(project_db.update_title(db, row, title))


def _editor_of(me: Me, project_id: UUID, db: DbSession) -> None:
    _project_of(db, me, project_id)
    require(me, "share_role_links")


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
