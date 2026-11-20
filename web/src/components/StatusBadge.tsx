import { CHAPTER_STATUS_LABEL } from "@/domain/labels";
import type { ChapterStatus } from "@/types";
import styles from "./StatusBadge.module.css";

/**
 * 장 상태 배지(DESIGN.md 5장, FR-12). 점 + 낱말. 수정 중 회색, 검토 요청 주황, 검토 완료 초록이고
 * 낱말을 늘 같이 써서 색만으로 구분하지 않아요. 줄바꿈하지 않아요.
 */
export function StatusBadge({ status, testId }: { status: ChapterStatus; testId?: string }) {
  return (
    <span className={styles.badge} data-status={status} data-testid={testId}>
      {CHAPTER_STATUS_LABEL[status]}
    </span>
  );
}
