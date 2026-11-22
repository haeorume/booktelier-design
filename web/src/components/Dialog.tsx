"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Dialog.module.css";

/** 창(CS-13). Esc나 바깥 클릭으로 닫히고, 열리면 포커스가 창 안으로 간다. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // 포커스는 창이 처음 열릴 때 한 번만 옮겨요. 작업 공간은 함께 작업 때문에 몇 초마다 다시 그려지는데,
  // 그때마다 옮기면 '수정 이유'를 쓰는 중에도 첫 칸으로 끌려가요(11.22 사용자 의견).
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("textarea, input, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div ref={box} className={styles.dialog} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
