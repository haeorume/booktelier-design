import { describe, expect, it } from "vitest";
import type { TrackedEvent } from "@/types";
import { createEventShipper, groupForShipping, SHIP_BATCH } from "./event-shipper";
import { ApiError, type HttpClient } from "./http";

function ev(i: number, project_id: string | null = "b1"): TrackedEvent {
  return {
    event_id: `e${i}`,
    name: "first_edit",
    ts: i,
    anon_id: "a",
    session_id: "s",
    participant_id: null,
    project_id,
    chapter_id: null,
    role: null,
    path: "/",
    props: { panel_layout: "single" },
    chapter_version: 3,
  };
}

const tokens = (id: string) => (id === "b1" ? "tok-1" : null);

describe("이벤트 서버로 보내기(A-33, F8)", () => {
  it("같은 책(같은 토큰)끼리, 50개씩 묶는다", () => {
    const events = [...Array.from({ length: SHIP_BATCH + 1 }, (_, i) => ev(i)), ev(99, null)];
    const groups = groupForShipping(events, tokens);
    expect(groups.map((g) => [g.token, g.events.length])).toEqual([
      ["tok-1", SHIP_BATCH],
      ["tok-1", 1],
      [null, 1],
    ]);
  });

  it("보내기가 실패하면 쌓아 두었다가 다음에 다시 보낸다", async () => {
    const sent: unknown[] = [];
    let fail = true;
    const http: HttpClient = {
      async request(_m, _p, opts) {
        if (fail) throw new ApiError(0, "network", "끊김");
        sent.push(opts?.body);
        return null as never;
      },
    };
    const ship = createEventShipper({ http, tokenFor: tokens, url: "/events" });
    ship.enqueue(ev(1));
    await ship.flush();
    expect(ship.pending()).toBe(1);
    fail = false;
    await ship.flush();
    expect(ship.pending()).toBe(0);
    expect(sent).toHaveLength(1);
    expect((sent[0] as { events: { chapter_version: number }[] }).events[0].chapter_version).toBe(3);
  });

  it("화면을 떠날 때는 sendBeacon(text/plain)으로 남은 것을 보낸다", () => {
    const beacons: Blob[] = [];
    const ship = createEventShipper({
      http: { request: async () => null as never },
      tokenFor: tokens,
      url: "https://api.example/events",
      beacon: (_url, body) => {
        beacons.push(body);
        return true;
      },
    });
    ship.enqueue(ev(1));
    ship.flushOnLeave();
    expect(beacons).toHaveLength(1);
    expect(beacons[0].type).toBe("text/plain;charset=utf-8");
    expect(ship.pending()).toBe(0);
  });

  it("보내는 중에 페이지를 닫아도 그 묶음을 sendBeacon에 싣는다(Codex 검수)", async () => {
    const beacons: string[] = [];
    let release: () => void = () => {};
    const http: HttpClient = {
      request: () =>
        new Promise((resolve) => {
          release = () => resolve(null as never);
        }),
    };
    const ship = createEventShipper({
      http,
      tokenFor: tokens,
      url: "/events",
      beacon: (_url, body) => {
        void body.text().then((t) => beacons.push(t));
        return true;
      },
    });
    ship.enqueue(ev(1));
    const sending = ship.flush(); // 응답을 기다리는 중
    ship.enqueue(ev(2));
    ship.flushOnLeave();
    release();
    await sending;
    await new Promise((r) => setTimeout(r, 0));
    const ids = beacons.flatMap((t) => (JSON.parse(t) as { events: { event_id: string }[] }).events.map((e) => e.event_id));
    expect(ids.sort()).toEqual(["e1", "e2"]);
  });
});
