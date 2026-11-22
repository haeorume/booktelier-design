import { describe, expect, it } from "vitest";
import { bookStage, pendingTaskCount } from "./books";
import type { ChapterStatus } from "@/types";

const chapters = (...s: ChapterStatus[]) => s.map((status) => ({ status }));

describe("책 카드의 진행 단계와 확인할 일(FR-02)", () => {
  it("검토 요청인 장이 있으면 '검토 요청'이고 그 수만큼 확인할 일이 있다", () => {
    const c = chapters("editing", "review_requested", "review_requested");
    expect(bookStage(c)).toBe("review_requested");
    expect(pendingTaskCount(c)).toBe(2);
  });

  it("모든 장이 검토 완료면 '검토 완료', 확인할 일은 0", () => {
    const c = chapters("reviewed", "reviewed");
    expect(bookStage(c)).toBe("reviewed");
    expect(pendingTaskCount(c)).toBe(0);
  });

  it("열어 보지 않은 의견도 확인할 일에 더한다", () => {
    expect(pendingTaskCount(chapters("review_requested", "editing"), 2)).toBe(3);
    expect(pendingTaskCount(chapters("reviewed"), 0)).toBe(0);
  });

  it("그 밖에는 '수정 중'", () => {
    expect(bookStage(chapters("editing", "reviewed"))).toBe("editing");
    expect(bookStage([])).toBe("editing");
  });
});
