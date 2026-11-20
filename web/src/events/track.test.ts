import { describe, expect, it } from "vitest";
import { createTracker, SESSION_TIMEOUT_MS } from "./track";
import { EVENT_NAMES, type EventName } from "./names";
import { createClientIdentityStore, createLocalStorageRepository, MemoryStorage } from "@/data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function setup(start = 1_763_445_600_000) {
  let clock = start;
  const repo = createLocalStorageRepository({ storage: new MemoryStorage() });
  const identity = createClientIdentityStore({ local: new MemoryStorage(), session: new MemoryStorage() });
  const tracker = createTracker({ sink: repo, identity, now: () => clock, path: () => "/p/abc" });
  return { repo, tracker, advance: (ms: number) => (clock += ms) };
}

describe("track: 공통 칸(QA-46)", () => {
  it("event_id·anon_id·session_id는 UUID, ts는 ms, path가 있다", async () => {
    const { repo, tracker } = setup();
    tracker.track("project_created");
    const [e] = await repo.listEvents();
    expect(e.event_id).toMatch(UUID);
    expect(e.anon_id).toMatch(UUID);
    expect(e.session_id).toMatch(UUID);
    expect(e.ts).toBe(1_763_445_600_000);
    expect(Number.isInteger(e.ts)).toBe(true);
    expect(e.path).toBe("/p/abc");
    expect(e.name).toBe("project_created");
  });

  it("props에는 늘 panel_layout이 들어간다(D-10)", async () => {
    const { repo, tracker } = setup();
    tracker.track("template_selected", { template_id: "essay" });
    tracker.setContext({ panel_layout: "split" });
    tracker.track("layout_changed");
    const [a, b] = await repo.listEvents();
    expect(a.props).toEqual({ template_id: "essay", panel_layout: "single" });
    expect(b.props).toEqual({ panel_layout: "split" });
  });

  it("지금 참여자·책·장·역할을 채운다", async () => {
    const { repo, tracker } = setup();
    expect(tracker.track("project_created")).toMatchObject({ participant_id: null, project_id: null, chapter_id: null, role: null });
    tracker.setContext({ participant_id: "p1", project_id: "b1", chapter_id: "c1", role: "author" });
    tracker.track("first_edit", { via: "direct" });
    const events = await repo.listEvents();
    expect(events[1]).toMatchObject({ participant_id: "p1", project_id: "b1", chapter_id: "c1", role: "author" });
  });

  it("events 탭의 확정 이름 19개, 잠정 1개, F2·F3 초안 6개만 받고, 그 밖의 이름은 막는다", () => {
    expect(EVENT_NAMES).toHaveLength(26);
    expect(new Set(EVENT_NAMES).size).toBe(26);
    const { tracker } = setup();
    expect(() => tracker.track("bookend_opened" as EventName)).toThrow();
  });
});

describe("session_id(정할 것 12)", () => {
  it("30분 안에는 같고, 30분 동안 이벤트가 없으면 새로 만든다", () => {
    const { tracker, advance } = setup();
    const a = tracker.track("screen_entered");
    advance(SESSION_TIMEOUT_MS - 1);
    const b = tracker.track("screen_left");
    advance(SESSION_TIMEOUT_MS);
    const c = tracker.track("screen_entered");
    expect(b.session_id).toBe(a.session_id);
    expect(c.session_id).not.toBe(a.session_id);
    expect(c.anon_id).toBe(a.anon_id);
  });
});
