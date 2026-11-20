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

    # 쪽 번호 위치. 값 목록은 F3에서 정해요(None이면 쪽 번호 없음).
    page_number: str | None = None
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
    running: Running | None = None
