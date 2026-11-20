"""원고 문서의 글자 위치 다루기. 웹 domain/anchor.ts·workspace/suggestions.ts와 같은 규칙이에요.

위치(anchor)는 문단 id + 그 문단의 서식 제외 텍스트 기준 글자 위치(0부터, end 미포함)이고, 단위는
JS 문자열 인덱스(UTF-16 코드 단위)예요(data-contract anchor, D-19). 파이썬 str은 코드 포인트 단위라
이모지처럼 BMP 밖 글자가 있으면 자리가 어긋나요. 그래서 여기서는 UTF-16으로 바꿔서 자르고 찾아요.
원고 글자는 로그에 남기지 않아요.
"""

from dataclasses import dataclass
from typing import Any

Doc = dict[str, Any]


@dataclass(frozen=True)
class Anchor:
    paragraph_id: str
    start: int
    end: int

    def as_dict(self) -> dict[str, Any]:
        return {"paragraph_id": self.paragraph_id, "start": self.start, "end": self.end}


def _u16(text: str) -> bytes:
    return text.encode("utf-16-le", "surrogatepass")


def _str(b: bytes) -> str:
    return b.decode("utf-16-le", "surrogatepass")


def u16_len(text: str) -> int:
    return len(_u16(text)) // 2


def u16_slice(text: str, start: int, end: int) -> str:
    return _str(_u16(text)[start * 2 : end * 2])


def u16_find_all(text: str, needle: str) -> list[int]:
    """needle이 나오는 모든 자리(UTF-16 단위). 겹쳐도 다 찾아요(JS indexOf(n, i + 1)과 같음)."""
    hay, sub = _u16(text), _u16(needle)
    if not sub:
        return []
    out: list[int] = []
    i = hay.find(sub)
    while i != -1:
        if i % 2 == 0:
            out.append(i // 2)
        i = hay.find(sub, i + 1)
    return out


def paragraph_text(doc: Doc, paragraph_id: str) -> str | None:
    for p in doc.get("content", []):
        if p.get("attrs", {}).get("id") == paragraph_id:
            return "".join(t.get("text", "") for t in (p.get("content") or []))
    return None


def locate(doc: Doc, anchor: Anchor, original: str) -> Anchor | None:
    """지금 원고에서 그 글자의 자리. 자리가 맞으면 그대로, 어긋나면 같은 문단에서 original로 다시 찾고
    (여럿이면 처음 자리에 가장 가까운 것), 못 찾으면 None(원문이 지워짐 → 무효, NFR-05 ②)."""
    if not original:
        return None
    text = paragraph_text(doc, anchor.paragraph_id)
    if text is None:
        return None
    if u16_slice(text, anchor.start, anchor.end) == original:
        return anchor
    hits = u16_find_all(text, original)
    if not hits:
        return None
    best = min(hits, key=lambda i: abs(i - anchor.start))
    return Anchor(anchor.paragraph_id, best, best + u16_len(original))


def replace(doc: Doc, anchor: Anchor, text: str) -> Doc:
    """문단 한 곳의 글자를 바꾼 새 문서. 문단은 서식 없는 글자 하나로 합쳐요(D-13, 웹 replaceInDoc과 같음)."""
    out = []
    for p in doc.get("content", []):
        if p.get("attrs", {}).get("id") != anchor.paragraph_id:
            out.append(p)
            continue
        before = paragraph_text(doc, anchor.paragraph_id) or ""
        b = _u16(before)
        nxt = _str(b[: anchor.start * 2]) + text + _str(b[anchor.end * 2 :])
        q = {k: v for k, v in p.items() if k != "content"}
        if nxt:
            q["content"] = [{"type": "text", "text": nxt}]
        out.append(q)
    return {**doc, "content": out}
