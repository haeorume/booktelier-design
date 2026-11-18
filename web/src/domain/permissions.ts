// 역할 권한은 이 표 한 곳에서만 정한다(D-14, D-15). 권한이 없으면 화면은 버튼을 숨긴다.
import type { Role } from "@/types";

const AUTHOR: readonly Role[] = ["author"];
const EDITOR: readonly Role[] = ["editor"];
const AUTHOR_EDITOR: readonly Role[] = ["author", "editor"];
const EDITOR_DESIGNER: readonly Role[] = ["editor", "designer"];
const ALL: readonly Role[] = ["editor", "author", "designer"];

export const PERMISSIONS = {
  // 원고를 직접 고치는 것은 작가만(D-14, FR-09 ④)
  edit_manuscript: AUTHOR,
  apply_ai_suggestion: AUTHOR, // FR-27 ①
  undo_ai_suggestion: AUTHOR, // FR-27 ③
  request_review: AUTHOR,
  accept_suggested_edit: AUTHOR, // 받은 사람(데모에서는 작가)
  reject_suggested_edit: AUTHOR, // FR-35
  // 편집자만
  run_chapter_review: EDITOR,
  send_ai_suggestion: EDITOR, // FR-29 ④ 작가 카드에는 보내기 없음
  create_suggested_edit: EDITOR, // FR-33
  complete_review: EDITOR,
  save_snapshot: EDITOR,
  // AI 제안 카드(디자이너는 AI 탭이 없음)
  view_ai_suggestions: AUTHOR_EDITOR,
  dismiss_ai_suggestion: AUTHOR_EDITOR,
  keep_ai_suggestion: AUTHOR_EDITOR,
  // 조판 설정은 편집자·디자이너, 작가는 값만 글자로 봄(FR-16 ③, D-15)
  change_layout: EDITOR_DESIGNER,
  // 세 역할 모두
  create_comment: ALL, // FR-32
  view_snapshots: ALL,
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof PERMISSIONS;

export function can(role: Role, action: Action): boolean {
  return (PERMISSIONS[action] as readonly Role[]).includes(role);
}
