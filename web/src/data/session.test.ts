import { describe, expect, it, vi } from "vitest";
import { createClientSession } from "./session";
import { MemoryStorage } from "./storage";

describe("ClientSession", () => {
  it("책마다 지금 참여자를 따로 기억한다", () => {
    const s = createClientSession(new MemoryStorage());
    s.setCurrentParticipantId("book-a", "p1");
    s.setCurrentParticipantId("book-b", "p2");
    expect(s.getCurrentParticipantId("book-a")).toBe("p1");
    expect(s.getCurrentParticipantId("book-b")).toBe("p2");
    expect(s.getCurrentParticipantId("book-c")).toBeNull();
  });

  it("패널 배치는 기본이 하나씩, 바꾸면 다시 열어도 남는다(D-10)", () => {
    const storage = new MemoryStorage();
    expect(createClientSession(storage).getPanelLayout()).toBe("single");
    createClientSession(storage).setPanelLayout("split");
    expect(createClientSession(storage).getPanelLayout()).toBe("split");
  });

  it("열어 본 의견은 책마다 기억한다", () => {
    const storage = new MemoryStorage();
    createClientSession(storage).markCommentSeen("b1", "c1");
    const s = createClientSession(storage);
    expect([...s.getSeenComments("b1")]).toEqual(["c1"]);
    expect(s.getSeenComments("b2").size).toBe(0);
  });

  it("바뀌면 구독자에게 알리고, 끊으면 알리지 않는다", () => {
    const s = createClientSession(new MemoryStorage());
    const listener = vi.fn();
    const off = s.subscribe(listener);
    const v0 = s.getVersion();
    s.setPanelLayout("split");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(s.getVersion()).not.toBe(v0);
    off();
    s.setCurrentParticipantId("b", "p");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
