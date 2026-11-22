import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveCheck, LIVE_CHECK_DELAY_MS, type LiveCheckStatus } from "./live-check";
import { createDemoProvider, type AiProvider } from "@/ai";

const texts: Record<string, string> = { para_01: "가", para_02: "나", para_03: "다" };

function setup(provider: AiProvider = createDemoProvider({ delayMs: 0, sleep: async () => {} })) {
  const calls: string[] = [];
  const statuses: LiveCheckStatus[] = [];
  const found: string[][] = [];
  const spied: AiProvider = {
    liveCheck: (req) => {
      calls.push(req.paragraph_id);
      return provider.liveCheck(req);
    },
    chapterReview: provider.chapterReview,
  };
  const lc = createLiveCheck({
    provider: spied,
    chapterId: "c1",
    requesterId: "me",
    getText: (id) => texts[id] ?? null,
    getVersion: () => 4,
    onStatus: (s) => statuses.push(s),
    onSuggestions: (list) => found.push(list.map((s) => s.original)),
  });
  return { lc, calls, statuses, found };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("실시간 교정(FR-20, D-18)", () => {
  it("입력을 멈추고 1.5초가 지나야 보낸다", async () => {
    const { lc, calls } = setup();
    lc.markChanged(["para_02"]);
    await vi.advanceTimersByTimeAsync(LIVE_CHECK_DELAY_MS - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(["para_02"]);
  });

  it("계속 입력하면 기다리는 시간을 처음부터 다시 잰다", async () => {
    const { lc, calls } = setup();
    lc.markChanged(["para_02"]);
    await vi.advanceTimersByTimeAsync(1000);
    lc.markChanged(["para_02"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toEqual(["para_02"]);
  });

  it("바뀐 문단만, 한 번씩 보낸다", async () => {
    const { lc, calls } = setup();
    lc.markChanged(["para_02"]);
    lc.markChanged(["para_02", "para_03"]);
    await vi.advanceTimersByTimeAsync(LIVE_CHECK_DELAY_MS);
    expect(calls).toEqual(["para_02", "para_03"]);
  });

  it("분석 중을 알리고 제안을 넘긴 뒤 비운다", async () => {
    const { lc, statuses, found } = setup();
    lc.markChanged(["para_02"]);
    await vi.advanceTimersByTimeAsync(LIVE_CHECK_DELAY_MS);
    expect(statuses).toEqual(["analyzing", "idle"]);
    expect(found).toEqual([["쏟아지는 것이 가능했고", "한참동안"]]);
  });

  it("실패하면 분석 실패, 다시 시도하면 그 문단만 다시 보낸다(FR-20 ③)", async () => {
    let fail = true;
    const demo = createDemoProvider({ delayMs: 0, sleep: async () => {} });
    const flaky: AiProvider = {
      liveCheck: (req) => (fail ? Promise.reject(new Error("실패")) : demo.liveCheck(req)),
      chapterReview: demo.chapterReview,
    };
    const { lc, calls, statuses, found } = setup(flaky);
    lc.markChanged(["para_02"]);
    await vi.advanceTimersByTimeAsync(LIVE_CHECK_DELAY_MS);
    expect(statuses.at(-1)).toBe("failed");
    expect(found).toEqual([]);

    fail = false;
    await lc.retry();
    expect(calls).toEqual(["para_02", "para_02"]);
    expect(statuses.at(-1)).toBe("idle");
    expect(found).toHaveLength(1);
  });

  it("dispose 뒤에는 보내지 않는다", async () => {
    const { lc, calls } = setup();
    lc.markChanged(["para_02"]);
    lc.dispose();
    await vi.advanceTimersByTimeAsync(LIVE_CHECK_DELAY_MS * 2);
    expect(calls).toEqual([]);
  });
});
