import { describe, expect, it } from "vitest";
import { locate, paragraphText } from "./anchor";
import { parseChapterDoc, parseChapterReviewResult, parseLiveCheckResult, type ChapterDoc } from "@/types";
import chapterReview from "@/fixtures/chapter_review.json";
import liveCheck from "@/fixtures/live_check.json";
import manuscript from "@/fixtures/manuscript.json";

const doc = parseChapterDoc(manuscript.chapter.doc);
const all = [...parseLiveCheckResult(liveCheck).suggestions, ...parseChapterReviewResult(chapterReview).suggestions];

function withParagraph(base: ChapterDoc, id: string, text: string): ChapterDoc {
  return {
    ...base,
    content: base.content.map((p) => (p.attrs.id === id ? { ...p, content: [{ type: "text", text }] } : p)),
  };
}

describe("예시 데이터의 제안 위치", () => {
  it("제안은 모두 7개(실시간 교정 2 + 장 검토 5)", () => {
    expect(all).toHaveLength(7);
  });

  it.each(all.map((s) => [s.original, s] as const))("'%s'가 예시 원고의 그 자리 글자와 같다", (_, s) => {
    const text = paragraphText(doc, s.anchor.paragraph_id);
    expect(text).not.toBeNull();
    expect(text!.slice(s.anchor.start, s.anchor.end)).toBe(s.original);
    expect(locate(doc, s)).toEqual({ anchor: s.anchor, relocated: false });
  });
});

describe("locate: 위치가 어긋나면 original로 다시 찾는다(NFR-05)", () => {
  const s = all.find((x) => x.original === "한참동안")!;

  it("앞에 글을 더해도 원래 문구를 가리킨다", () => {
    const before = paragraphText(doc, "para_02")!;
    const moved = withParagraph(doc, "para_02", `덧붙인 문장. ${before}`);
    const found = locate(moved, s);
    expect(found?.relocated).toBe(true);
    expect(paragraphText(moved, "para_02")!.slice(found!.anchor.start, found!.anchor.end)).toBe("한참동안");
  });

  it("원문이 지워지면 다른 곳에 붙지 않고 null", () => {
    const fixed = withParagraph(doc, "para_02", paragraphText(doc, "para_02")!.replace("한참동안", "한참 동안"));
    expect(locate(fixed, s)).toBeNull();
  });

  it("다른 문단에 같은 문구가 있어도 거기 붙지 않는다", () => {
    const removed = withParagraph(doc, "para_02", "바뀐 문단.");
    const elsewhere = withParagraph(removed, "para_04", "한참동안 걸었다.");
    expect(locate(elsewhere, s)).toBeNull();
  });

  it("문단이 없으면 null", () => {
    expect(locate(doc, { ...s, anchor: { ...s.anchor, paragraph_id: "para_99" } })).toBeNull();
  });

  it("같은 문구가 여럿이면 처음 위치에 가장 가까운 것", () => {
    const text = "가나 한참동안 다라 한참동안 마바";
    const d = withParagraph(doc, "para_02", text);
    const near = locate(d, { anchor: { paragraph_id: "para_02", start: 12, end: 16 }, original: "한참동안" });
    expect(near?.anchor.start).toBe(text.lastIndexOf("한참동안"));
  });
});
