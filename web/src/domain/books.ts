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
 * 검토 요청인 장의 수 + 다른 역할이 남긴 의견 중 편집자가 아직 열어 보지 않은 수.
 * 검토 요청은 검토 완료를 누르면, 의견은 카드를 열어 보면 줄어든다. AI 제안과 수정 제안은 세지 않는다.
 */
export function pendingTaskCount(chapters: Pick<Chapter, "status">[], unseenComments = 0): number {
  return chapters.filter((c) => c.status === "review_requested").length + unseenComments;
}
