// events 탭 '2. 이벤트'의 이름. 확정 19개 + 잠정 1개(suggested_edit_rejected) + v0.4 초안 중 F2~F5에서 쓰는 것. 이 밖의 이름은 남기지 않는다.
export const EVENT_NAMES = [
  // 퍼널 1~13단계
  "project_created",
  "template_selected",
  "role_link_copied",
  "role_link_opened",
  "participant_joined",
  "first_edit",
  "review_requested",
  "chapter_review_run",
  "ai_suggestion_sent",
  "suggested_edit_accepted",
  "snapshot_saved",
  "layout_changed",
  // AI 제안
  "ai_suggestion_shown",
  "ai_suggestion_applied",
  "ai_suggestion_dismissed",
  "ai_suggestion_merged",
  "ai_suggestion_kept",
  // 잠정(W4): 확정 목록에 없어 더했다. events 탭에 반영되면 이 주석을 지운다.
  "suggested_edit_rejected",
  // 참여·원고(events 탭 v0.4 혜린 초안 11.20, F2·F3)
  "chapter_added",
  "invite_link_created",
  "invite_link_rotated",
  "invite_link_revoked",
  "editor_link_opened",
  "save_failed",
  // F5(events 탭 v0.4 혜린 초안 11.20)
  "review_completed",
  "comment_resolved",
  "comment_reopened",
  // F4(events 탭 v0.4 혜린 초안 11.20)
  "presence_jumped",
  // 체류
  "screen_entered",
  "screen_left",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
