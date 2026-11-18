// 화면 이름은 UX 설계서 '6 레이블링'을 따른다. 장 상태 이름은 D-17.
import type { AiSuggestionKind, ChapterStatus, Role } from "@/types";

/** AI 제안 종류의 화면 이름(D-04, FR-24). 레이블링 L-44의 옛 이름(교정·교열·윤문)은 쓰지 않는다. */
export const KIND_LABEL: Record<AiSuggestionKind, string> = {
  spelling: "맞춤법",
  spacing: "띄어쓰기",
  notation: "표기 통일",
  polish: "윤문",
};

export const KIND_ORDER: AiSuggestionKind[] = ["spelling", "spacing", "notation", "polish"];

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
