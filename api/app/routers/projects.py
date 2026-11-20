"""책 API(A-02, A-03, A-07, A-08, A-10, A-13, A-15). 지금은 가짜 응답(D-25)."""

from uuid import UUID

from fastapi import APIRouter, status

from app.auth.token import BearerToken
from app.routers import _fake
from app.schemas.common import error_responses
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


@router.post(
    "/projects",
    summary="A-02 책 만들기",
    response_model=ProjectCreateOut,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(409),
)
def create_project(body: ProjectCreateIn) -> ProjectCreateOut:
    """누구나 불러요. 편집자 참여자와 편집자 토큰을 같이 만들고, 토큰은 이 응답에서만 줘요(D-27)."""
    parts = _fake.participants()
    return ProjectCreateOut(
        project=_fake.project(body.id, body.title).model_copy(
            update={"template_id": body.template_id}
        ),
        chapter=_fake.chapter(body.first_chapter_id, "1장"),
        participant=parts[0].model_copy(update={"project_id": body.id}),
        editor_token=_fake.FAKE_TOKEN,
        editor_url=_fake.web_url(f"/e/{_fake.FAKE_TOKEN}"),
    )


@router.post(
    "/projects/list",
    summary="A-03 내 책 목록",
    response_model=list[ProjectCard],
)
def list_projects(body: ProjectListIn) -> list[ProjectCard]:
    """브라우저가 가진 편집자 토큰들을 보내면 그 책 카드를 줘요(D-38). 맞지 않는 토큰은 빠져요."""
    return [
        ProjectCard(
            id=_fake.PROJECT_ID,
            title="파리에서 보낸 일주일",
            template_id="essay",
            stage="editing",
            participants=[
                ParticipantBrief(id=p.id, role=p.role, display_name=p.display_name)
                for p in _fake.participants()
            ],
            todo_count=2,
            updated_at=_fake.T1,
        )
    ]


@router.get(
    "/projects/{project_id}",
    summary="A-10 책 열기",
    response_model=ProjectDetail,
    responses=error_responses(401, 403, 404),
)
def get_project(project_id: UUID, _token: BearerToken) -> ProjectDetail:
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
def create_chapter(project_id: UUID, body: ChapterCreateIn, _token: BearerToken) -> Chapter:
    """편집자·작가(Q-20). 새 장은 원고가 비어 있고 version 1이에요."""
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
def patch_layout(project_id: UUID, body: LayoutPatchIn, _token: BearerToken) -> LayoutOut:
    """편집자·디자이너. 바꾼 값만 보내요. 바꾼 사람과 시각은 서버가 정해요(C-6)."""
    layout = _fake.LAYOUT
    if body.layout is not None:
        layout = layout.model_copy(update=body.layout.model_dump(exclude_unset=True))
    return LayoutOut(
        template_id=body.template_id or "essay",
        layout=layout,
        layout_updated_by=_fake.DESIGNER_ID,
        layout_updated_at=_fake.T1,
    )


@router.get(
    "/projects/{project_id}/invites",
    summary="A-07 초대 링크 목록",
    response_model=list[Invite],
    responses=error_responses(401, 403, 404),
)
def list_invites(project_id: UUID, _token: BearerToken) -> list[Invite]:
    """편집자만. 다시 복사할 수 있게 주소를 같이 줘요(D-37)."""
    return [
        _fake.invite(_fake.INVITE_AUTHOR_ID, "author"),
        _fake.invite(_fake.INVITE_DESIGNER_ID, "designer"),
    ]


@router.post(
    "/projects/{project_id}/invites",
    summary="A-08 초대 링크 만들기",
    response_model=Invite,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(401, 403, 404),
)
def create_invite(project_id: UUID, body: InviteCreateIn, _token: BearerToken) -> Invite:
    """편집자만."""
    return _fake.invite(_fake.INVITE_AUTHOR_ID, body.role)
