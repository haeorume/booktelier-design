"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Dialog.module.css";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 넓은 창(시안 .bf-modal-wide, 800px). 기본은 540px. */
  wide?: boolean;
  /**
   * 머리 오른쪽 X를 '닫기' 버튼으로 읽히게 할지. 창 아래에 '닫기' 버튼이 따로 있으면 X는 마우스용 장식이라
   * 보조기기에서 숨겨요(같은 이름의 버튼이 둘이면 헷갈려요).
   */
  closeLabel?: boolean;
}

/**
 * 창(CS-13, 시안 .bf-modal). 머리(제목 + X)와 본문으로 나뉘어요.
 * Esc나 바깥 클릭으로 닫히고, 열리면 포커스가 창 안 첫 입력 칸이나 버튼으로 가요(X는 건너뛰어요).
 */
export function Dialog({ title, onClose, children, wide, closeLabel }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // 포커스는 창이 처음 열릴 때 한 번만 옮겨요. 작업 공간은 함께 작업 때문에 몇 초마다 다시 그려지는데,
  // 그때마다 옮기면 '수정 이유'를 쓰는 중에도 첫 칸으로 끌려가요(11.22 사용자 의견).
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>("textarea, input, select, button:not([data-dialog-x])") ?? box.current?.querySelector<HTMLElement>("button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div ref={box} className={styles.dialog} data-wide={wide || undefined} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {closeLabel ? (
            <button type="button" className={styles.x} data-dialog-x onClick={onClose} aria-label="닫기">
              <Icon name="close" />
            </button>
          ) : (
            <button type="button" className={styles.x} data-dialog-x onClick={onClose} aria-hidden="true" tabIndex={-1}>
              <Icon name="close" />
            </button>
          )}
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
