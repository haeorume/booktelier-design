import { describe, expect, it } from "vitest";
import type { ChapterDoc } from "@/types";
import { changedParagraphIndexes, mergeChapters } from "./live";

function doc(...paras: [string, string][]): ChapterDoc {
  return { type: "doc", content: paras.map(([id, text]) => ({ type: "paragraph", attrs: { id }, content: [{ type: "text", text }] })) };
}

describe("changedParagraphIndexes", () => {
  it("문단 순서가 같으면 바뀐 문단 번호만", () => {
    expect(changedParagraphIndexes(doc(["a", "1"], ["b", "2"]), doc(["a", "1"], ["b", "2!"]))).toEqual([1]);
  });
  it("문단이 늘거나 순서가 바뀌면 null", () => {
    expect(changedParagraphIndexes(doc(["a", "1"]), doc(["a", "1"], ["b", "2"]))).toBeNull();
    expect(changedParagraphIndexes(doc(["a", "1"], ["b", "2"]), doc(["b", "2"], ["a", "1"]))).toBeNull();
  });
});

describe("mergeChapters", () => {
  const ch = (id: string, order: number, version: number, status = "editing") => ({ id, order, version, status });

  it("새 장을 순서대로 더하고 버전이 같거나 높으면 바꾼다", () => {
    const out = mergeChapters([ch("1", 1, 3), ch("2", 2, 1)], [ch("3", 3, 1), ch("1", 1, 3, "review_requested")]);
    expect(out.map((c) => `${c.id}:${c.status}`)).toEqual(["1:review_requested", "2:editing", "3:editing"]);
  });

  it("내 쪽 버전이 앞서면 옛 값으로 되돌리지 않는다", () => {
    expect(mergeChapters([ch("1", 1, 5)], [ch("1", 1, 4)])[0].version).toBe(5);
  });
});
