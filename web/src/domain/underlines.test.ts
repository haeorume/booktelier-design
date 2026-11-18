import { describe, expect, it } from "vitest";
import { mergeUnderlines } from "./underlines";
import { parseChapterReviewResult, parseLiveCheckResult } from "@/types";
import chapterReview from "@/fixtures/chapter_review.json";
import liveCheck from "@/fixtures/live_check.json";

const toPlaced = (list: { id: string; kind: never; anchor: never }[]) => list.map((s) => ({ id: s.id, kind: s.kind, anchor: s.anchor }));

describe("밑줄 합치기(D-12, FR-25)", () => {
  it("장 검토 예시: '모나리자를'과 '모나리자를 제대로 보지 못했다'는 밑줄 하나, 제안 둘(QA-28)", () => {
    const review = parseChapterReviewResult(chapterReview);
    const spans = mergeUnderlines(toPlaced(review.suggestions as never));
    const para03 = spans.filter((s) => s.paragraph_id === "para_03");
    expect(para03).toHaveLength(2); // 겹친 자리 하나 + '루부르' 하나
    const overlap = para03.find((s) => s.start === 21)!;
    expect(overlap.end).toBe(37);
    expect(overlap.suggestion_ids).toHaveLength(2);
    expect(overlap.kind).toBe("polish"); // 같은 자리에서 시작하면 더 긴 쪽의 종류
    expect(spans).toHaveLength(4); // 5개 제안 → 밑줄 4개
  });

  it("실시간 교정 예시: 겹치지 않는 두 제안은 밑줄 둘", () => {
    const spans = mergeUnderlines(toPlaced(parseLiveCheckResult(liveCheck).suggestions as never));
    expect(spans.map((s) => [s.start, s.end, s.kind])).toEqual([
      [57, 69, "polish"],
      [85, 89, "spacing"],
    ]);
  });

  it("닿기만 하면 합치지 않고, 줄줄이 겹치면 모두 하나로 합친다", () => {
    const a = (id: string, start: number, end: number) => ({ id, kind: "spelling" as const, anchor: { paragraph_id: "p", start, end } });
    expect(mergeUnderlines([a("1", 0, 3), a("2", 3, 5)])).toHaveLength(2);
    const chain = mergeUnderlines([a("1", 0, 4), a("2", 3, 8), a("3", 7, 10)]);
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({ start: 0, end: 10, suggestion_ids: ["1", "2", "3"] });
  });
});
