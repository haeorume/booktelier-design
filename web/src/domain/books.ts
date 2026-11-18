// 편집자 홈 책 카드에 보이는 값(FR-02). 화면과 상관없는 계산만 둔다.
import type { Chapter, ChapterStatus } from "@/types";

/**
 * 책의 진행 단계. 장 상태에서 계산한다(FR-12 비고).
 * 검토 요청인 장이 하나라도 있으면 '검토 요청', 모든 장이 검토 완료면 '검토 완료', 그 밖에는 '수정 중'.
 */
export function bookStage(chapters: Pick<Chapter, "status">[]): ChapterStatus {
  if (chapters.some((c) => c.status === "review_requested")) return "review_requested";
  if (chapters.length > 0 && chapters.every((c) => c.status === "reviewed")) return "reviewed";
  return "editing";
}

/**
 * 확인할 일: 사람이 보낸 일 중 아직 확인하지 않은 것(FR-02 ②).
 * W2에서는 검토 요청인 장의 수만 센다. 의견은 W4에서 더한다. AI 제안과 수정 제안은 세지 않는다.
 */
export function pendingTaskCount(chapters: Pick<Chapter, "status">[]): number {
  return chapters.filter((c) => c.status === "review_requested").length;
}
