import { describe, expect, it } from "vitest";
import { computeFunnel, FUNNEL_STEPS } from "./funnel";
import { EVENT_NAMES } from "@/events/names";
import type { Role, TrackedEvent } from "@/types";

let n = 0;
function ev(project: string, name: string, role: Role | null = null, props: Record<string, unknown> = {}): TrackedEvent {
  n += 1;
  return {
    event_id: `e${n}`,
    name,
    ts: n,
    anon_id: "a",
    session_id: "s",
    participant_id: null,
    project_id: project,
    chapter_id: null,
    role,
    path: "/",
    props: { panel_layout: "single", ...props },
  };
}

/** 한 책이 13단계를 모두 지난 기록 */
function fullRun(project: string): TrackedEvent[] {
  return [
    ev(project, "project_created", "editor"),
    ev(project, "template_selected", "editor"),
    ev(project, "role_link_copied", "editor", { role: "author" }),
    ev(project, "role_link_copied", "editor", { role: "designer" }),
    ev(project, "role_link_opened", "author", { role: "author" }),
    ev(project, "participant_joined", "author", { role: "author" }),
    ev(project, "first_edit", "author"),
    ev(project, "review_requested", "author"),
    ev(project, "chapter_review_run", "editor"),
    ev(project, "ai_suggestion_sent", "editor"),
    ev(project, "suggested_edit_accepted", "author"),
    ev(project, "snapshot_saved", "editor"),
    ev(project, "role_link_opened", "designer", { role: "designer" }),
    ev(project, "participant_joined", "designer", { role: "designer" }),
    ev(project, "layout_changed", "designer"),
  ];
}

describe("퍼널(FR-40)", () => {
  it("13단계이고, 단계마다 events 탭의 이름을 쓴다", () => {
    expect(FUNNEL_STEPS.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    for (const s of FUNNEL_STEPS) expect(EVENT_NAMES as readonly string[]).toContain(s.event);
  });

  it("한 번 끝까지 돌면 13단계 도달 수가 모두 1이고 이탈은 0이다(QA-45)", () => {
    const rows = computeFunnel(fullRun("b1"));
    expect(rows.map((r) => r.reached)).toEqual(Array(13).fill(1));
    expect(rows.map((r) => r.dropped)).toEqual(Array(13).fill(0));
  });

  it("같은 이벤트가 여러 번 남아도 책 하나로 센다", () => {
    const rows = computeFunnel([...fullRun("b1"), ev("b1", "layout_changed", "editor"), ev("b1", "first_edit", "author")]);
    expect(rows[12].reached).toBe(1);
    expect(rows[5].reached).toBe(1);
  });

  it("5단계와 12단계는 participant_joined를 역할로 나눠 센다(정할 것 14)", () => {
    const rows = computeFunnel([ev("b1", "participant_joined", "designer", { role: "designer" })]);
    expect(rows[4].reached).toBe(0);
    expect(rows[11].reached).toBe(1);
  });

  it("4단계는 작가로 연 것만 센다", () => {
    expect(computeFunnel([ev("b1", "role_link_opened", "designer", { role: "designer" })])[3].reached).toBe(0);
    expect(computeFunnel([ev("b1", "role_link_opened", "author", { role: "author" })])[3].reached).toBe(1);
  });

  it("이탈 수는 직전 단계에는 왔지만 이 단계에는 오지 않은 책의 수다", () => {
    const events = [
      ...fullRun("b1"),
      ev("b2", "project_created", "editor"),
      ev("b2", "template_selected", "editor"),
      ev("b3", "project_created", "editor"),
      ev("b3", "template_selected", "editor"),
      ev("b3", "role_link_copied", "editor", { role: "author" }),
    ];
    const rows = computeFunnel(events);
    expect(rows[0]).toMatchObject({ reached: 3, dropped: 0 });
    expect(rows[1]).toMatchObject({ reached: 3, dropped: 0 }); // 1·2단계는 늘 같다(정할 것 6)
    expect(rows[2]).toMatchObject({ reached: 2, dropped: 1 });
    expect(rows[3]).toMatchObject({ reached: 1, dropped: 1 });
  });

  it("책이 없는 이벤트는 세지 않는다", () => {
    expect(computeFunnel([{ ...ev("x", "project_created"), project_id: null }])[0].reached).toBe(0);
  });
});
