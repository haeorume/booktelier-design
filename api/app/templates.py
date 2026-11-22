"""템플릿 3종(D-11)의 기본 조판 값. DESIGN.md 4장 '템플릿 잠정값'(Q-24, 오름님 값이 오기 전).

판형은 "폭x높이"(mm) 글자. 웹 domain/templates.ts의 parseTrim과 같은 모양이에요.
책을 만들 때(A-02)와 템플릿을 바꿀 때(A-15, FR-16 ④) 이 값으로 채워요.
쪽 공통 설정(머리말·쪽 번호)도 템플릿 값 묶음에 들어가요(11.21 정모 결정).
"""

from app.schemas.common import TemplateId
from app.schemas.layout import Layout, Margins, PageSide, Running

SERIF = "Noto Serif KR"
SANS = "Noto Sans KR"


def _running() -> Running:
    # 머리말은 왼쪽 쪽에 책 제목, 오른쪽 쪽에 장 제목. 쪽 번호는 바깥쪽 아래(DESIGN.md 4장)
    return Running(
        left=PageSide(page_number="bottom_outer", header="book_title"),
        right=PageSide(page_number="bottom_outer", header="chapter_title"),
    )


def default_layout(template_id: TemplateId) -> Layout:
    if template_id == "novel":
        return Layout(
            trim="127x188",
            margin=Margins(top=18, bottom=20, inner=17, outer=14),
            binding=3,
            line_height=1.75,
            font_family=SERIF,
            font_size=10,
            running=_running(),
            text_align="left",
        )
    if template_id == "essay":
        return Layout(
            trim="148x210",
            margin=Margins(top=20, bottom=22, inner=20, outer=16),
            binding=3,
            line_height=1.8,
            font_family=SERIF,
            font_size=10.5,
            running=_running(),
            text_align="left",
        )
    return Layout(
        trim="152x225",
        margin=Margins(top=20, bottom=20, inner=18, outer=16),
        binding=3,
        line_height=1.65,
        font_family=SANS,
        font_size=10,
        running=_running(),
        text_align="left",
    )
