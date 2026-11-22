import { describe, expect, it, vi } from "vitest";
import { createDemoProvider } from "./demo-provider";
import chapterReview from "@/fixtures/chapter_review.json";
import liveCheck from "@/fixtures/live_check.json";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const me = "11111111-2222-4333-8444-555555555555";
// 브라우저에서 만든 장. 예시 JSON의 chapter_id와 다르다.
const chapter_id = "99999999-8888-4777-8666-555555555555";

describe("데모 제공자", () => {
  it("실시간 교정: 바뀐 문단이 para_02이면 예시 제안 2개를 돌려준다", async () => {
    const ai = createDemoProvider({ delayMs: 0 });
    const r = await ai.liveCheck({ chapter_id, paragraph_id: "para_02", text: "", base_version: 5, requester_participant_id: me });
    expect(r.suggestions.map((s) => s.original)).toEqual(liveCheck.suggestions.map((s) => s.original));
  });

  it("실시간 교정: 다른 문단이면 고칠 거리가 없다", async () => {
    const ai = createDemoProvider({ delayMs: 0 });
    const r = await ai.liveCheck({ chapter_id, paragraph_id: "para_04", text: "", base_version: 5, requester_participant_id: me });
    expect(r.suggestions).toEqual([]);
  });

  it("응답과 제안이 요청한 장·버전·참여자에 묶인다", async () => {
    const ai = createDemoProvider({ delayMs: 0 });
    const r = await ai.chapterReview({ chapter_id, base_version: 7, requester_participant_id: me });
    expect(r.chapter_id).toBe(chapter_id);
    expect(r.base_version).toBe(7);
    expect(r.suggestions).toHaveLength(5);
    for (const s of r.suggestions) {
      expect(s).toMatchObject({ chapter_id, base_version: 7, owner_participant_id: me });
      expect(s.id).toMatch(UUID);
    }
  });

  it("부를 때마다 제안 id가 새로 생겨 참여자끼리 겹치지 않는다", async () => {
    const ai = createDemoProvider({ delayMs: 0 });
    const a = await ai.chapterReview({ chapter_id, base_version: 1, requester_participant_id: me });
    const b = await ai.chapterReview({ chapter_id, base_version: 1, requester_participant_id: crypto.randomUUID() });
    const ids = new Set([...a.suggestions, ...b.suggestions].map((s) => s.id));
    expect(ids.size).toBe(10);
  });

  it("요청에 묶이는 값 말고는 예시 값 그대로다(D-19)", async () => {
    const before = JSON.stringify(chapterReview);
    const ai = createDemoProvider({ delayMs: 0 });
    const r = await ai.chapterReview({ chapter_id, base_version: 3, requester_participant_id: me });
    const unbound = (s: object) => ({ ...s, id: undefined, chapter_id: undefined, base_version: undefined, owner_participant_id: undefined });
    expect(r.suggestions.map(unbound)).toEqual(chapterReview.suggestions.map(unbound));
    expect(r.summary).toEqual(chapterReview.summary);
    expect(JSON.stringify(chapterReview)).toBe(before);
  });

  it("정한 시간만큼 기다린 뒤 돌려준다", async () => {
    const sleep = vi.fn(async () => {});
    const ai = createDemoProvider({ delayMs: 800, sleep });
    await ai.chapterReview({ chapter_id, base_version: 3, requester_participant_id: me });
    expect(sleep).toHaveBeenCalledWith(800);
  });

  it("네트워크를 부르지 않는다(D-06)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const ai = createDemoProvider({ delayMs: 0 });
    await ai.chapterReview({ chapter_id, base_version: 3, requester_participant_id: me });
    await ai.liveCheck({ chapter_id, paragraph_id: "para_02", text: "", base_version: 2, requester_participant_id: me });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
