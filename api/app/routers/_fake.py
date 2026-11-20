"""가짜 응답(D-25). F1 두 번째 조각부터 A-10~A-15(F3 몫)만 남았어요. 웹이 서버를 기다리지 않고 계약대로 만들 수 있게 고정 예시를 돌려줘요.

F1 두 번째 조각부터 라우터가 app/db 함수를 부르게 되면서 하나씩 지워요. 이 파일이 비면 지워요.
id는 data-contract '4. 필드'의 예시 값이에요.
"""

from datetime import UTC, datetime
from uuid import UUID

from app.schemas.common import ChapterDoc, ParagraphAttrs, ParagraphNode, TextNode
from app.schemas.layout import Layout, Margins, PageSide, Running
from app.schemas.project import Chapter, ChapterSummary, Participant, Project

PROJECT_ID = UUID("0b9f6c2e-7d41-4a8e-9c53-1f2e3d4a5b6c")
CHAPTER_ID = UUID("3f1c9a52-6b0e-4d7a-9e21-5c8b7a0d4e11")
EDITOR_ID = UUID("6a2d8e14-3b7c-4f90-a1e5-9d0c2b4f6a81")
AUTHOR_ID = UUID("8c4f1a37-5e2d-4b68-9f03-7a1e6d2c5b94")
DESIGNER_ID = UUID("2e7b9c05-1d4a-4e36-8b72-c3f5a0d9e167")


T0 = datetime(2026, 11, 21, 9, 0, tzinfo=UTC)
T1 = datetime(2026, 11, 21, 9, 30, tzinfo=UTC)
CHAPTER_VERSION = 3

LAYOUT = Layout(
    trim="128x188",
    margin=Margins(top=20, bottom=22, inner=20, outer=16),
    binding=5,
    line_height=1.7,
    font_family="Noto Serif KR",
    font_size=10.5,
    running=Running(
        left=PageSide(page_number="bottom_outer", header="book_title"),
        right=PageSide(page_number="bottom_outer", header="chapter_title"),
    ),
)


def project(project_id: UUID = PROJECT_ID, title: str = "파리에서 보낸 일주일") -> Project:
    return Project(
        id=project_id,
        title=title,
        template_id="essay",
        layout=LAYOUT,
        layout_updated_by=None,
        layout_updated_at=None,
        created_at=T0,
        updated_at=T1,
    )


def doc() -> ChapterDoc:
    return ChapterDoc(
        type="doc",
        content=[
            ParagraphNode(
                type="paragraph",
                attrs=ParagraphAttrs(id="para_01"),
                content=[
                    TextNode(type="text", text="첫날 아침, 숙소 창문을 열자 빵 굽는 냄새가 났다.")
                ],
            ),
            ParagraphNode(
                type="paragraph",
                attrs=ParagraphAttrs(id="para_02"),
                content=[TextNode(type="text", text="골목 끝 빵집 앞에는 벌써 줄이 서 있었다.")],
            ),
        ],
    )


def chapter_summary(
    chapter_id: UUID = CHAPTER_ID, title: str = "1장 파리에서 보낸 첫 주", order: int = 1
) -> ChapterSummary:
    return ChapterSummary(
        id=chapter_id,
        project_id=PROJECT_ID,
        order=order,
        title=title,
        status="editing",
        version=CHAPTER_VERSION,
        status_changed_at=None,
        updated_at=T1,
    )


def chapter(chapter_id: UUID = CHAPTER_ID, title: str = "1장 파리에서 보낸 첫 주") -> Chapter:
    return Chapter(**chapter_summary(chapter_id, title).model_dump(), doc=doc())


def participants() -> list[Participant]:
    return [
        Participant(
            id=EDITOR_ID,
            project_id=PROJECT_ID,
            role="editor",
            display_name="이편집",
            created_at=T0,
            last_seen_at=T1,
        ),
        Participant(
            id=AUTHOR_ID,
            project_id=PROJECT_ID,
            role="author",
            display_name="김작가",
            created_at=T0,
            last_seen_at=T1,
        ),
        Participant(
            id=DESIGNER_ID,
            project_id=PROJECT_ID,
            role="designer",
            display_name="박디자인",
            created_at=T0,
            last_seen_at=None,
        ),
    ]
