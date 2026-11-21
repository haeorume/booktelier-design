"""예시 원고 정답 7개와 실제 LLM 비교표(F6 끝났다는 기준, PLAN).

정답은 1차 예시 JSON(app/ai/fixtures): 장 검토 5개 + 실시간 교정 2개(para_02).
AI_PROVIDER와 상관없이 실제 LLM(LLM_BASE_URL, LLM_MODEL, LLM_API_KEY)을 불러요. 키는 api/.env에서 읽어요.

    cd api && uv run python scripts/compare_llm.py            # 표를 화면에
    cd api && uv run python scripts/compare_llm.py --out compare.md

판정: 같은 문단에서 정답 원문과 겹치는 제안이 있으면 '맞힘'(수정안까지 같으면 ○, 다르면 △), 없으면 '놓침'(×).
정답에 없는 제안은 '더 낸 것'으로 따로 적어요(틀렸다는 뜻은 아니에요. 사람이 봐요).
"""

import argparse
import io
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any

API_DIR = Path(__file__).resolve().parent.parent
if TYPE_CHECKING:
    from app.ai.provider import Proposal

KIND = {"spelling": "맞춤법", "spacing": "띄어쓰기", "notation": "표기 통일", "polish": "윤문"}


def _overlaps(p: "Proposal", expected: dict[str, Any]) -> bool:
    a = expected["anchor"]
    return p.paragraph_id == a["paragraph_id"] and p.start < a["end"] and a["start"] < p.end


def _rows(
    source: str, expected: list[dict[str, Any]], got: list["Proposal"]
) -> tuple[list[str], set[int]]:
    rows: list[str] = []
    used: set[int] = set()
    for e in expected:
        hit = next((i for i, p in enumerate(got) if i not in used and _overlaps(p, e)), None)
        if hit is None:
            mark, llm = "×", "(놓침)"
        else:
            used.add(hit)
            p = got[hit]
            same = (
                p.replacement == e["replacement"]
            )  # 띄어쓰기도 평가 대상이라 글자 그대로 비교해요
            mark = "○" if same else "△"
            llm = f"{p.original} → {p.replacement} ({KIND.get(p.kind, p.kind)})"
        rows.append(
            f"| {source} | {e['anchor']['paragraph_id']} | {e['original']} → {e['replacement']} "
            f"({KIND[e['kind']]}) | {llm} | {mark} |"
        )
    return rows, used


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", help="표를 쓸 Markdown 파일")
    args = parser.parse_args()

    sys.path.insert(0, str(API_DIR))
    from app.ai.demo import load  # 경로를 넣은 뒤에 불러요(dump_openapi.py와 같음)
    from app.ai.llm import LlmProvider
    from app.ai.provider import BookRules
    from app.config import get_settings

    settings = get_settings()
    provider = LlmProvider.from_settings(settings)
    doc = load("manuscript.json")["chapter"]["doc"]
    book = BookRules()

    live_expected = load("live_check.json")
    review_expected = load("chapter_review.json")["suggestions"]

    t0 = time.perf_counter()
    live = provider.live_check(doc, [live_expected["paragraph_id"]], book).proposals
    t1 = time.perf_counter()
    review = provider.chapter_review(doc, book).proposals
    t2 = time.perf_counter()

    lines = [
        f"# 예시 원고 정답 7개 비교 ({settings.llm_model})",
        "",
        f"실시간 교정 {t1 - t0:.1f}초, 장 검토 {t2 - t1:.1f}초",
        "",
        "| 어디서 | 문단 | 정답 | LLM | 판정 |",
        "| --- | --- | --- | --- | --- |",
    ]
    live_rows, live_used = _rows("실시간 교정", live_expected["suggestions"], live)
    review_rows, review_used = _rows("장 검토", review_expected, review)
    lines += live_rows + review_rows
    hits = sum(1 for r in live_rows + review_rows if r.endswith("○ |") or r.endswith("△ |"))
    exact = sum(1 for r in live_rows + review_rows if r.endswith("○ |"))
    lines += ["", f"맞힘 {hits}/7 (수정안까지 같음 {exact}/7)", "", "## 정답에 없이 더 낸 것", ""]
    extra = [p for i, p in enumerate(live) if i not in live_used] + [
        p for i, p in enumerate(review) if i not in review_used
    ]
    if not extra:
        lines.append("없음")
    for p in extra:
        lines.append(
            f"- {p.paragraph_id}: {p.original} → {p.replacement} ({KIND.get(p.kind, p.kind)}) — {p.reason}"
        )
    text = "\n".join(lines) + "\n"
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
