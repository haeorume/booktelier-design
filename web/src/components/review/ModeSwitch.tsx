"use client";

import styles from "./ReviewPanel.module.css";

interface Props {
  /** 지금 보이는 패널 */
  current: "review" | "layout";
  /** '검토 패널'을 눌렀을 때. 없으면 눌리지 않아요. */
  onReview?: () => void;
  /** '조판 설정'을 눌렀을 때. 없으면 눌리지 않아요. */
  onLayout?: () => void;
}

/**
 * 오른쪽 독 맨 위의 검토 패널/조판 설정 스위치(시안 .br-mode-switch).
 * 상단 바의 '조판 설정' 버튼과 이름이 겹치지 않게 탭(role="tab")으로 둬요.
 */
export function ModeSwitch({ current, onReview, onLayout }: Props) {
  const item = (mode: "review" | "layout", label: string, onClick?: () => void) => {
    const on = current === mode;
    return (
      <button
        type="button"
        role="tab"
        className={styles.modeButton}
        aria-selected={on}
        disabled={!on && !onClick}
        onClick={on ? undefined : onClick}
      >
        {label}
      </button>
    );
  };
  return (
    <div className={styles.modeSwitch} role="tablist" aria-label="오른쪽 작업 패널">
      {item("review", "검토 패널", onReview)}
      {item("layout", "조판 설정", onLayout)}
    </div>
  );
}
