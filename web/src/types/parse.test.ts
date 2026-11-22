import { describe, expect, it } from "vitest";
import { ContractError, parseAiSuggestion, parseChapterDoc, parseChapterReviewResult, parseLiveCheckResult } from "./parse";
import chapterReview from "@/fixtures/chapter_review.json";
import liveCheck from "@/fixtures/live_check.json";
import manuscript from "@/fixtures/manuscript.json";

describe("예시 JSON이 data-contract 타입에 맞는다", () => {
  it("실시간 교정", () => {
    const r = parseLiveCheckResult(liveCheck);
    expect(r.suggestions.map((s) => s.kind)).toEqual(["polish", "spacing"]);
  });

  it("장 검토", () => {
    const r = parseChapterReviewResult(chapterReview);
    expect(r.suggestions).toHaveLength(5);
    expect(r.summary).toEqual({ spelling: 1, spacing: 1, notation: 2, polish: 1 });
  });

  it("예시 원고는 문단마다 id가 있다", () => {
    const doc = parseChapterDoc(manuscript.chapter.doc);
    expect(doc.content.map((p) => p.attrs.id)).toEqual(["para_01", "para_02", "para_03", "para_04"]);
  });
});

describe("확정 값이 아니면 거절한다", () => {
  const base = liveCheck.suggestions[0];

  it.each(["correction", "copyedit", "layout"])("옛 종류 이름 %s(D-04)", (kind) => {
    expect(() => parseAiSuggestion({ ...base, kind })).toThrow(ContractError);
  });

  it("옛 상태 이름 open(D-05)", () => {
    expect(() => parseAiSuggestion({ ...base, status: "open" })).toThrow(ContractError);
  });

  it("대안은 최대 2개", () => {
    expect(() => parseAiSuggestion({ ...base, alternatives: ["a", "b", "c"] })).toThrow(ContractError);
  });

  it("viewer 역할(D-02)", () => {
    expect(() => parseAiSuggestion({ ...base, target_role: "viewer" })).toThrow(ContractError);
  });
});
