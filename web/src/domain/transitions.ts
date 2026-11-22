// 상태 전이. 표에 없는 전이는 막는다(D-05, NFR-15 ③).
import type { AiSuggestion, Chapter, SuggestedEdit } from "@/types";
import type { AiSuggestionStatus, ChapterStatus, SuggestedEditStatus } from "@/types";

export class TransitionError extends Error {
  constructor(target: string, from: string, action: string) {
    super(`${target}: '${from}' 상태에서는 '${action}'을 할 수 없어요`);
    this.name = "TransitionError";
  }
}

type Table<S extends string, A extends string> = Record<S, Partial<Record<A, S>>>;

function next<S extends string, A extends string>(table: Table<S, A>, from: S, action: A): S | null {
  return table[from][action] ?? null;
}

// AI 제안 ------------------------------------------------------------------
// apply: 작가가 적용 / undo_apply: 적용 직후 실행 취소(마지막 1회, FR-27 ③)
// dismiss: 무시 / send: 의견·수정 제안으로 보냄 / keep: 이 표현 유지(FR-30)
// invalidate: 원고가 먼저 바뀌어 무효 / merge: 보낸 수정 제안이 수락됨
export const AI_SUGGESTION_ACTIONS = ["apply", "undo_apply", "dismiss", "send", "keep", "invalidate", "merge"] as const;
export type AiSuggestionAction = (typeof AI_SUGGESTION_ACTIONS)[number];

const AI_SUGGESTION_TABLE: Table<AiSuggestionStatus, AiSuggestionAction> = {
  pending: { apply: "applied", dismiss: "dismissed", send: "sent", keep: "stale", invalidate: "stale" },
  applied: { undo_apply: "pending" },
  sent: { merge: "merged" },
  dismissed: {},
  merged: {},
  stale: {},
};

export function nextAiSuggestionStatus(from: AiSuggestionStatus, action: AiSuggestionAction): AiSuggestionStatus | null {
  return next(AI_SUGGESTION_TABLE, from, action);
}

export function transitionAiSuggestion(s: AiSuggestion, action: AiSuggestionAction): AiSuggestion {
  const to = nextAiSuggestionStatus(s.status, action);
  if (!to) throw new TransitionError("AI 제안", s.status, action);
  return { ...s, status: to };
}

// 장 ------------------------------------------------------------------------
export const CHAPTER_ACTIONS = ["request_review", "complete_review"] as const;
export type ChapterAction = (typeof CHAPTER_ACTIONS)[number];

const CHAPTER_TABLE: Table<ChapterStatus, ChapterAction> = {
  editing: { request_review: "review_requested" },
  review_requested: { complete_review: "reviewed" },
  // '검토 완료'인 장에서도 다시 검토를 요청할 수 있다(FR-13 ①).
  reviewed: { request_review: "review_requested" },
};

export function nextChapterStatus(from: ChapterStatus, action: ChapterAction): ChapterStatus | null {
  return next(CHAPTER_TABLE, from, action);
}

export function transitionChapter(c: Chapter, action: ChapterAction): Chapter {
  const to = nextChapterStatus(c.status, action);
  if (!to) throw new TransitionError("장", c.status, action);
  return { ...c, status: to };
}

// 수정 제안 -----------------------------------------------------------------
export const SUGGESTED_EDIT_ACTIONS = ["accept", "reject"] as const;
export type SuggestedEditAction = (typeof SUGGESTED_EDIT_ACTIONS)[number];

const SUGGESTED_EDIT_TABLE: Table<SuggestedEditStatus, SuggestedEditAction> = {
  pending: { accept: "accepted", reject: "rejected" },
  accepted: {},
  rejected: {},
  source_deleted: {},
};

export function nextSuggestedEditStatus(from: SuggestedEditStatus, action: SuggestedEditAction): SuggestedEditStatus | null {
  return next(SUGGESTED_EDIT_TABLE, from, action);
}

export function transitionSuggestedEdit(e: SuggestedEdit, action: SuggestedEditAction): SuggestedEdit {
  const to = nextSuggestedEditStatus(e.status, action);
  if (!to) throw new TransitionError("수정 제안", e.status, action);
  return { ...e, status: to };
}
