"""조판 값(FR-16, FR-44, FR-45). 칸 이름만 정하고 값과 기본값은 F3에서 채워요(DESIGN.md 4장).

지금은 모든 칸이 선택값이에요. F3에서 템플릿 기본값을 정하면 필수로 바꿔요.
"""

from typing import Literal

from pydantic import BaseModel, Field


class Margins(BaseModel):
    """여백 4개(mm). 안쪽·바깥쪽은 펼침면 기준."""

    top: float | None = Field(default=None, ge=0)
    bottom: float | None = Field(default=None, ge=0)
    inner: float | None = Field(default=None, ge=0)
    outer: float | None = Field(default=None, ge=0)


class PageSide(BaseModel):
    """한쪽 면(왼쪽 또는 오른쪽)의 쪽 공통 설정(FR-44 ②)."""

    # 쪽 번호 위치(F7 확정, 11.21): 바깥쪽 아래 · 가운데 아래 · 없음. 머리말과 같이 '없음'도 값으로 둬요.
    page_number: Literal["bottom_outer", "bottom_center", "none"] | None = None
    header: Literal["none", "book_title", "chapter_title"] | None = None


class Running(BaseModel):
    """쪽 공통 설정: 쪽 번호와 머리말(FR-44)."""

    left: PageSide | None = None
    right: PageSide | None = None


class Layout(BaseModel):
    trim: str | None = None  # 판형
    margin: Margins | None = None
    binding: float | None = Field(default=None, ge=0)  # 제본 여백(mm)
    line_height: float | None = Field(default=None, gt=0)
    font_family: str | None = None  # FR-45, 라이선스를 확인한 웹 글꼴
    font_size: float | None = Field(default=None, gt=0)  # pt
    # 본문 문단 정렬(FR-16 ⑥, D-41, 11.22 사용자 의견). 장 제목·머리말은 그대로예요. 비어 있으면 왼쪽.
    text_align: Literal["left", "center", "right", "justify"] | None = None
    running: Running | None = None
