import { describe, expect, it } from "vitest";
import { PERMISSIONS, can, type Action } from "./permissions";
import type { Role } from "@/types";

// 기대 권한표(D-14, D-15, FR-09 ④, FR-16 ③, FR-27, FR-29 ④, FR-32, FR-33). 이 표가 바뀌면 문서 근거도 같이 바뀌어야 한다.
const EXPECTED: Record<Action, Role[]> = {
  edit_manuscript: ["author"],
  apply_ai_suggestion: ["author"],
  undo_ai_suggestion: ["author"],
  request_review: ["author"],
  accept_suggested_edit: ["author"],
  reject_suggested_edit: ["author"],
  run_chapter_review: ["editor"],
  send_ai_suggestion: ["editor"],
  create_suggested_edit: ["editor"],
  complete_review: ["editor"],
  save_snapshot: ["editor"],
  share_role_links: ["editor"],
  open_editor_home: ["editor"],
  view_ai_suggestions: ["author", "editor"],
  dismiss_ai_suggestion: ["author", "editor"],
  keep_ai_suggestion: ["author", "editor"],
  change_layout: ["editor", "designer"],
  create_comment: ["editor", "author", "designer"],
  view_snapshots: ["editor", "author", "designer"],
};

const ROLES: Role[] = ["editor", "author", "designer"];

describe("can(role, action)", () => {
  it("권한표의 행동이 기대 표와 같다", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED) as [Action, Role[]][])("%s", (action, roles) => {
    for (const role of ROLES) expect(can(role, action), `${role} → ${action}`).toBe(roles.includes(role));
  });

  it("원고를 직접 고치는 것은 작가만(D-14)", () => {
    expect(can("editor", "edit_manuscript")).toBe(false);
    expect(can("designer", "edit_manuscript")).toBe(false);
  });

  it("디자이너는 AI 제안을 보지 못한다", () => {
    expect(can("designer", "view_ai_suggestions")).toBe(false);
  });
});
