"""여러 API가 같이 쓰는 값. 이름과 값은 data-contract '2. 상태 값'의 확정 값(D-05)."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.errors import ErrorOut

Role = Literal["editor", "author", "designer"]  # D-02
InviteRole = Literal[
    "author", "designer"
]  # 편집자 링크는 초대 링크로 두지 않아요(data-contract role_link)
TemplateId = Literal["novel", "essay", "practical"]  # D-11
ChapterStatus = Literal["editing", "review_requested", "reviewed"]


def _is_none(v: object) -> bool:
    return v is None


# 원고 문서의 선택 칸은 값이 없으면 응답에서도 빼요. 화면이 보낸 원고와 받은 원고가 같은 모양이어야 해요.
class TextMark(BaseModel):
    type: str
    attrs: dict[str, Any] | None = Field(default=None, exclude_if=_is_none)


class TextNode(BaseModel):
    type: Literal["text"]
    text: str
    marks: list[TextMark] | None = Field(default=None, exclude_if=_is_none)


class ParagraphAttrs(BaseModel):
    id: str


class ParagraphNode(BaseModel):
    type: Literal["paragraph"]
    attrs: ParagraphAttrs
    content: list[TextNode] | None = Field(default=None, exclude_if=_is_none)


class ChapterDoc(BaseModel):
    """편집기 문서. 문단마다 id가 있어요(data-contract chapter.doc, P1)."""

    type: Literal["doc"]
    content: list[ParagraphNode] = Field(default_factory=list)


def error_responses(*codes: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI에 오류 모양 { code, message }를 적어요(C-3, D-35)."""
    text = {
        401: "토큰이 없거나 틀려요",
        403: "이 책이나 역할로는 할 수 없어요",
        404: "찾을 수 없어요",
        409: "그사이 바뀌었어요",
    }
    return {c: {"model": ErrorOut, "description": text.get(c, "오류")} for c in codes}
