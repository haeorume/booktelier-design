import { describe, expect, it } from "vitest";
import type { components } from "@/types/api";
import { toSuggestion } from "./http-review";

type S = components["schemas"];

const base: S["AiSuggestion"] = {
  id: "s1",
  chapter_id: "c1",
  owner_participant_id: "p1",
  anchor: { paragraph_id: "para_01", start: 4, end: 8 },
  original: "도착한지",
  replacement: "도착한 지",
  alternatives: [],
  kind: "spacing",
  reason: "의존 명사는 띄어 써요.",
  evidence: null,
  source: "chapter_review",
  target_role: "editor",
  base_version: 1,
  status: "pending",
  created_at: "2026-11-22T00:00:00Z",
  decided_at: null,
};

describe("서버 AI 제안 → 화면(F6 근거)", () => {
  it("근거를 옮겨 담는다", () => {
    const evidence = { type: "norm" as const, label: "한글 맞춤법 제42항", excerpt: "의존 명사는 띄어 쓴다.", chunk_id: "k1" };
    expect(toSuggestion({ ...base, evidence }).evidence).toEqual(evidence);
  });

  it("근거가 없으면 null", () => {
    expect(toSuggestion(base).evidence).toBeNull();
  });
});
