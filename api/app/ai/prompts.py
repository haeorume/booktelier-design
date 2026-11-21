"""LLM에 보내는 말(F6). 종류 이름과 뜻은 D-04, 카드 모양은 FR-24, 말투는 1차 예시 제안의 이유와 같아요.

원고 글자는 여기서 프롬프트로만 쓰고 로그·이벤트에 남기지 않아요(AGENTS.md 원고 안전).
"""

from app.ai.provider import BookRules

SYSTEM = """당신은 한국어 단행본 출판사의 교정·교열 편집자예요.
원고에서 고칠 거리를 찾아 JSON으로만 답해요. 설명 글은 쓰지 않아요.

종류(kind)는 넷 중 하나예요.
- spelling: 맞춤법(틀린 철자, 잘못된 형태). 예: 몇일 → 며칠
- spacing: 띄어쓰기. 예: 도착한지 → 도착한 지, 한참동안 → 한참 동안
- notation: 표기 통일과 문장 부호. 같은 책 안에서 같은 말을 다르게 쓴 것, 외래어 표기, 작품 제목 부호. 예: 루부르 → 루브르
- polish: 윤문. 번역 투나 어색한 문장을 자연스럽게. 뜻은 바꾸지 않아요.

지킬 것
- original은 원고 문단에 있는 글자를 한 글자도 바꾸지 말고 그대로 옮겨요. 고칠 곳만 짧게 잡아요(윤문은 구절까지).
- replacement는 original을 바꿀 글자예요. alternatives는 다른 수정안으로, 있을 때만 최대 2개예요.
- reason은 한두 문장, '~해요'체로 써요. 근거가 되는 규정(한글 맞춤법 제몇 항 등)을 알면 괄호로 붙여요.
- 확실하지 않으면 내지 않아요. 고칠 거리가 없으면 빈 목록이에요.
- 문단 id(paragraph_id)는 주어진 것만 써요.
- 같은 문단에 original과 같은 글자가 여러 번 나오면, 고칠 것이 몇 번째인지 occurrence(1부터)로 적어요.

답 모양(이 JSON 하나만, 다른 글 없이):
{"suggestions": [{"paragraph_id": "para_01", "original": "몇일", "replacement": "며칠",
  "alternatives": [], "kind": "spelling", "reason": "...", "occurrence": null}]}
고칠 거리가 없으면 {"suggestions": []}예요."""


def book_rules_text(book: BookRules) -> str:
    """책 원칙(A-28). 따를 원칙과 고치지 말 표현."""
    lines: list[str] = []
    if book.rules:
        lines.append("이 책의 표기 원칙(따라요):")
        lines += [f"- {r}" for r in book.rules]
    if book.keep:
        lines.append("이 책에서 그대로 두기로 한 표현(고치자고 하지 않아요):")
        lines += [f"- {k}" for k in book.keep]
    return "\n".join(lines)


def paragraphs_text(paragraphs: list[tuple[str, str]]) -> str:
    return "\n".join(f"[{pid}] {text}" for pid, text in paragraphs)


def live_check_prompt(paragraphs: list[tuple[str, str]], book: BookRules) -> str:
    """실시간 교정(D-18): 작가가 방금 고친 문단만. 맞춤법·띄어쓰기를 먼저 봐요."""
    rules = book_rules_text(book)
    return "\n\n".join(
        part
        for part in [
            "작가가 방금 고친 문단이에요. 이 문단 안에서만 고칠 거리를 찾아요.",
            rules,
            paragraphs_text(paragraphs),
        ]
        if part
    )


def chapter_review_prompt(paragraphs: list[tuple[str, str]], book: BookRules) -> str:
    """장 검토(FR-21): 장 전체. 문단 사이의 표기 통일도 봐요."""
    rules = book_rules_text(book)
    return "\n\n".join(
        part
        for part in [
            "편집자가 장 전체 검토를 요청했어요. 문단 사이에서 같은 말을 다르게 쓴 것(표기 통일)도 찾아요.",
            rules,
            paragraphs_text(paragraphs),
        ]
        if part
    )
