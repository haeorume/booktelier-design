"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import styles from "./forms.module.css";

export type ComposeKind = "comment" | "suggested_edit";

interface Props {
  kind: ComposeKind;
  quote: string;
  onSubmit: (text: string) => Promise<void>;
  onClose: () => void;
}

/**
 * 지면에서 고른 글자에 의견 남기기(FR-32) / 수정 제안하기(FR-33, 편집자만).
 * 의견은 내용, 수정 제안은 바꿀 내용을 받는다. 비어 있으면 보낼 수 없다.
 */
export function ComposeDialog({ kind, quote, onSubmit, onClose }: Props) {
  const [text, setText] = useState(kind === "suggested_edit" ? quote : "");
  const [busy, setBusy] = useState(false);
  const empty = text.trim().length === 0 || (kind === "suggested_edit" && text === quote);
  const title = kind === "comment" ? "의견 남기기" : "수정 제안하기";

  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (empty || busy) return;
          setBusy(true);
          try {
            await onSubmit(kind === "comment" ? text.trim() : text);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className={styles.quote}>“{quote}”</p>
        <label className={styles.label}>
          {kind === "comment" ? "의견" : "바꿀 내용"}
          <textarea className={styles.textarea} value={text} onChange={(e) => setText(e.target.value)} rows={kind === "comment" ? 4 : 2} />
        </label>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            닫기
          </button>
          <button type="submit" className={styles.primary} disabled={empty || busy}>
            보내기
          </button>
        </div>
      </form>
    </Dialog>
  );
}
