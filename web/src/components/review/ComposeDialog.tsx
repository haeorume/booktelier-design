"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { KIND_LABEL, KIND_ORDER } from "@/domain/labels";
import type { AiSuggestionKind } from "@/types";
import styles from "./forms.module.css";

export type ComposeKind = "comment" | "suggested_edit";

interface Props {
  kind: ComposeKind;
  quote: string;
  /** 수정 제안이면 이유(비워도 됨, Q-22)와 종류(FR-33)도 함께 */
  onSubmit: (text: string, extra: { reason: string | null; kind: AiSuggestionKind | null }) => Promise<void>;
  onClose: () => void;
}

/**
 * 지면에서 고른 글자에 의견 남기기(FR-32) / 수정 제안하기(FR-33, 편집자만).
 * 의견은 내용, 수정 제안은 바꿀 내용과 이유·종류를 받는다. 내용이 비어 있으면 보낼 수 없다.
 */
export function ComposeDialog({ kind, quote, onSubmit, onClose }: Props) {
  const [text, setText] = useState(kind === "suggested_edit" ? quote : "");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [kind_, setKind] = useState<AiSuggestionKind | "">("");
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
            await onSubmit(kind === "comment" ? text.trim() : text, { reason: reason.trim() || null, kind: kind_ || null });
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
        {kind === "suggested_edit" && (
          <>
            <label className={styles.label}>
              수정 이유
              <textarea className={styles.textarea} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="비워도 돼요" />
            </label>
            <label className={styles.label}>
              종류
              <select className={styles.input} value={kind_} onChange={(e) => setKind(e.target.value as AiSuggestionKind | "")}>
                <option value="">고르지 않음</option>
                {KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
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
