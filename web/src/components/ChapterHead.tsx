"use client";

import { can } from "@/domain/permissions";
import type { Chapter, Role } from "@/types";
import styles from "./ChapterHead.module.css";
import { StatusBadge } from "./StatusBadge";

interface Props {
  chapter: Chapter;
  role: Role;
  busy: boolean;
  onRequestReview: () => void;
  onCompleteReview: () => void;
}

/**
 * 장 머리(WS-31). 장 상태와 상태 바꾸기 버튼.
 * 작가: 검토 요청(검토 요청 중에는 누를 수 없음, FR-13 ①). 편집자: 검토 완료(검토 요청일 때만, FR-14 ①).
 * 버튼을 누를 수 없는 것은 권한이 아니라 장 상태 때문이라 숨기지 않고 잠근다. 권한이 없는 역할에는 버튼이 없다(D-15).
 */
export function ChapterHead({ chapter, role, busy, onRequestReview, onCompleteReview }: Props) {
  return (
    <div className={styles.head}>
      <StatusBadge status={chapter.status} testId="chapter-head-status" />
      {can(role, "request_review") && (
        <button type="button" className={styles.button} disabled={busy || chapter.status === "review_requested"} onClick={onRequestReview}>
          검토 요청
        </button>
      )}
      {can(role, "complete_review") && (
        <button type="button" className={styles.button} disabled={busy || chapter.status !== "review_requested"} onClick={onCompleteReview}>
          검토 완료
        </button>
      )}
    </div>
  );
}
