// 화면 이름은 UX 설계서 '6 레이블링'을 따른다. 장 상태 이름은 D-17.
import type { AiSuggestionKind, AiSuggestionStatus, ChapterStatus, Role, SuggestedEditStatus } from "@/types";

/** AI 제안 종류의 화면 이름(D-04, FR-24). 레이블링 L-44의 옛 이름(교정·교열·윤문)은 쓰지 않는다. */
export const KIND_LABEL: Record<AiSuggestionKind, string> = {
  spelling: "맞춤법",
  spacing: "띄어쓰기",
  notation: "표기 통일",
  polish: "윤문",
};

export const KIND_ORDER: AiSuggestionKind[] = ["spelling", "spacing", "notation", "polish"];

/** AI 제안 상태(L-35). */
export const AI_STATUS_LABEL: Record<AiSuggestionStatus, string> = {
  pending: "대기",
  applied: "적용됨",
  dismissed: "무시됨",
  sent: "보냄",
  merged: "반영됨",
  stale: "무효",
};

/** 수정 제안 상태(L-38, L-40). */
export const EDIT_STATUS_LABEL: Record<SuggestedEditStatus, string> = {
  pending: "대기",
  accepted: "수락됨",
  rejected: "거절됨",
  source_deleted: "원문 삭제됨",
};

/** 보낸 의견·수정 제안이 AI 제안에서 왔다는 표시(FR-29 ①, W4 결정). */
export const AI_ORIGIN_LABEL = "AI 제안에서 보냄";

export const ROLE_LABEL: Record<Role, string> = {
  editor: "편집자",
  author: "작가",
  designer: "디자이너",
};

export const CHAPTER_STATUS_LABEL: Record<ChapterStatus, string> = {
  editing: "수정 중",
  review_requested: "검토 요청",
  reviewed: "검토 완료",
};

/** 역할 링크의 화면 이름(L-19). */
export function roleLinkLabel(role: Role): string {
  return `${ROLE_LABEL[role]} 링크`;
}
