"use client";

import { can } from "@/domain/permissions";
import type { Chapter, Role } from "@/types";
import styles from "./ChapterHead.module.css";
import { Icon } from "./Icon";
import { StatusBadge } from "./StatusBadge";

interface Props {
  chapter: Chapter;
  role: Role;
  busy: boolean;
  onRequestReview: () => void;
  onCompleteReview: () => void;
  /** 검토본(WS-03). 볼 수 있는 역할만 넘어와요. */
  onSnapshots?: () => void;
}

/** 장 상태(WS-31). 작업 머리의 상태 줄에 놓여요(시안 .bf-workflow-status). */
export function ChapterStatus({ chapter }: { chapter: Chapter }) {
  return <StatusBadge status={chapter.status} testId="chapter-head-status" />;
}

/**
 * 장 머리 단추(WS-31, 시안 .bf-workflow-actions). 장 상태 바꾸기와 검토본.
 * 작가: 검토 요청(검토 요청 중에는 누를 수 없음, FR-13 ①). 편집자: 검토 완료(검토 요청일 때만, FR-14 ①).
 * 버튼을 누를 수 없는 것은 권한이 아니라 장 상태 때문이라 숨기지 않고 잠근다. 권한이 없는 역할에는 버튼이 없다(D-15).
 */
export function ChapterActions({ chapter, role, busy, onRequestReview, onCompleteReview, onSnapshots }: Props) {
  return (
    <div className={styles.head}>
      {can(role, "request_review") && (
        <button type="button" className={styles.button} disabled={busy || chapter.status === "review_requested"} onClick={onRequestReview}>
          <Icon name="arrow" size="xs" />
          검토 요청
        </button>
      )}
      {can(role, "complete_review") && (
        <button type="button" className={styles.button} disabled={busy || chapter.status !== "review_requested"} onClick={onCompleteReview}>
          <Icon name="check" size="xs" />
          검토 완료
        </button>
      )}
      {onSnapshots && (
        <button type="button" className={styles.button} onClick={onSnapshots}>
          <Icon name="history" size="xs" />
          검토본
        </button>
      )}
    </div>
  );
}
