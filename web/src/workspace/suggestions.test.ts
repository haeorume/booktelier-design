import { describe, expect, it } from "vitest";
import { appliedRange, canUndo, changedParagraphs, paragraphTexts, placeSuggestions, replaceInDoc } from "./suggestions";
import { paragraphText } from "@/domain/anchor";
import { parseChapterDoc, parseChapterReviewResult, parseLiveCheckResult, type AiSuggestion } from "@/types";
import chapterReview from "@/fixtures/chapter_review.json";
import liveCheck from "@/fixtures/live_check.json";
import manuscript from "@/fixtures/manuscript.json";

const doc = parseChapterDoc(manuscript.chapter.doc);
const live = parseLiveCheckResult(liveCheck).suggestions;
const review = parseChapterReviewResult(chapterReview).suggestions;
const [pouring, spacing] = live; // '쏟아지는 것이 가능했고', '한참동안'

describe("placeSuggestions", () => {
  it("대기 제안을 원고 순서(문단, 시작 위치)로 늘어놓는다(FR-26 ①)", () => {
    const shuffled = [...review].reverse();
    const { placed, lost } = placeSuggestions(doc, shuffled);
    expect(lost).toEqual([]);
    expect(placed.map((p) => p.suggestion.original)).toEqual(["도착한지", "몇일", "모나리자를", "모나리자를 제대로 보지 못했다", "루부르"]);
  });

  it("대기가 아닌 제안은 보이지 않는다", () => {
    const dismissed: AiSuggestion = { ...pouring, status: "dismissed" };
    expect(placeSuggestions(doc, [dismissed, spacing]).placed.map((p) => p.suggestion.id)).toEqual([spacing.id]);
  });

  it("앞 문단에 글을 더해도 원래 문구를 가리킨다(QA-36, NFR-05 ①)", () => {
    const longer = replaceInDoc(doc, { paragraph_id: "para_01", start: 0, end: 0 }, "덧붙인 글. ");
    const { placed } = placeSuggestions(longer, live);
    expect(placed.every((p) => !p.relocated)).toBe(true); // 다른 문단이라 위치가 그대로
    const sameParagraph = replaceInDoc(doc, { paragraph_id: "para_02", start: 0, end: 0 }, "덧붙인 글. ");
    const moved = placeSuggestions(sameParagraph, live).placed;
    expect(moved.every((p) => p.relocated)).toBe(true);
    for (const p of moved) {
      expect(paragraphText(sameParagraph, "para_02")!.slice(p.anchor.start, p.anchor.end)).toBe(p.suggestion.original);
    }
  });

  it("제안이 걸린 문장을 먼저 고치면 그 제안은 lost(QA-35, NFR-04)", () => {
    const edited = replaceInDoc(doc, spacing.anchor, "한참 동안");
    const { placed, lost } = placeSuggestions(edited, live);
    expect(lost.map((s) => s.id)).toEqual([spacing.id]);
    expect(placed.map((p) => p.suggestion.id)).toEqual([pouring.id]);
  });
});

describe("적용과 실행 취소", () => {
  it("적용하면 그 자리가 수정안으로 바뀌고, 다른 제안은 원래 문구를 계속 가리킨다", () => {
    const after = replaceInDoc(doc, pouring.anchor, pouring.replacement);
    expect(paragraphText(after, "para_02")).toContain("햇빛이 그림 위로 쏟아졌고, 나는");
    const { placed, lost } = placeSuggestions(after, [{ ...pouring, status: "applied" }, spacing]);
    expect(lost).toEqual([]);
    expect(placed).toHaveLength(1);
    expect(placed[0].suggestion.id).toBe(spacing.id);
  });

  it("적용한 글자가 그대로 있을 때만 실행 취소할 수 있다(FR-27 ③)", () => {
    const after = replaceInDoc(doc, pouring.anchor, pouring.replacement);
    const last = { suggestion: pouring, inserted: appliedRange(pouring.anchor, pouring.replacement), insertedText: pouring.replacement };
    expect(canUndo(after, last)).toBe(true);
    const restored = replaceInDoc(after, last.inserted, pouring.original);
    expect(restored).toEqual(doc);
    const typedOver = replaceInDoc(after, last.inserted, "쏟아져");
    expect(canUndo(typedOver, last)).toBe(false);
  });
});

describe("바뀐 문단 찾기(D-18)", () => {
  it("글자가 바뀌었거나 새로 생긴 문단만", () => {
    const before = paragraphTexts(doc);
    const edited = replaceInDoc(doc, { paragraph_id: "para_02", start: 0, end: 0 }, "가");
    const added = { ...edited, content: [...edited.content, { type: "paragraph" as const, attrs: { id: "new" }, content: [] }] };
    expect(changedParagraphs(before, paragraphTexts(added))).toEqual(["para_02", "new"]);
    expect(changedParagraphs(before, paragraphTexts(doc))).toEqual([]);
  });
});
