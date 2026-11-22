// 확정 값만 둔다. data-contract '2. 상태 값'의 '확정 값 (정모)' 칸(D-05), 종류는 D-04.

export const ROLES = ["editor", "author", "designer"] as const;
export type Role = (typeof ROLES)[number];

export const AI_SUGGESTION_KINDS = ["spelling", "spacing", "notation", "polish"] as const;
export type AiSuggestionKind = (typeof AI_SUGGESTION_KINDS)[number];

export const AI_SUGGESTION_SOURCES = ["live_check", "chapter_review"] as const;
export type AiSuggestionSource = (typeof AI_SUGGESTION_SOURCES)[number];

export const AI_SUGGESTION_STATUSES = ["pending", "applied", "dismissed", "sent", "merged", "stale"] as const;
export type AiSuggestionStatus = (typeof AI_SUGGESTION_STATUSES)[number];

export const CHAPTER_STATUSES = ["editing", "review_requested", "reviewed"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

// source_deleted는 규칙만 두고 구현은 2차(data-contract P5).
export const SUGGESTED_EDIT_STATUSES = ["pending", "accepted", "rejected", "source_deleted"] as const;
export type SuggestedEditStatus = (typeof SUGGESTED_EDIT_STATUSES)[number];

export const COMMENT_STATUSES = ["open", "resolved"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const STYLE_RULE_TYPES = ["rule", "keep"] as const;
export type StyleRuleType = (typeof STYLE_RULE_TYPES)[number];

// 템플릿 3종(D-11). 코드 값은 W1에서 정함(소설·에세이·실용서).
export const TEMPLATE_IDS = ["novel", "essay", "practical"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const PANEL_LAYOUTS = ["single", "split"] as const;
export type PanelLayout = (typeof PANEL_LAYOUTS)[number];

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}
