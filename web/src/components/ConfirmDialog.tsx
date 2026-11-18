"use client";

import { Dialog } from "./Dialog";
import styles from "./review/forms.module.css";

/** 확인 창(CS-13). 브라우저 confirm 대신 쓴다. */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p>{body}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          닫기
        </button>
        <button type="button" className={styles.primary} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
