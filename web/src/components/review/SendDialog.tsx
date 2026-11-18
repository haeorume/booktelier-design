"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { KIND_LABEL } from "@/domain/labels";
import type { SendMethod } from "@/data";
import type { AiSuggestion } from "@/types";
import styles from "./forms.module.css";

interface Props {
  suggestion: AiSuggestion;
  onSend: (input: { method: SendMethod; replacement: string; text: string }) => Promise<void>;
  onClose: () => void;
}

/**
 * 보내기 창(WS-05, FR-29). 의견으로 보낼지 수정 제안으로 보낼지 고르고, 수정 제안이면 수정안이나 대안을 고른다.
 * 보내는 문구는 수정 이유로 채워 두고 다듬어 보낸다. 문구가 비면 보낼 수 없다(CS-01).
 */
export function SendDialog({ suggestion: s, onSend, onClose }: Props) {
  const options = [s.replacement, ...s.alternatives];
  const [method, setMethod] = useState<SendMethod>("suggested_edit");
  const [choice, setChoice] = useState(0);
  const [text, setText] = useState(s.reason);
  const [busy, setBusy] = useState(false);
  const empty = text.trim().length === 0;

  return (
    <Dialog title="보내기" onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (empty || busy) return;
          setBusy(true);
          try {
            await onSend({ method, replacement: options[choice], text });
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className={styles.quote}>
          <span className={styles.kind}>{KIND_LABEL[s.kind]}</span> <del>{s.original}</del>
        </p>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>보내는 방식</legend>
          <label className={styles.radio}>
            <input type="radio" name="method" checked={method === "comment"} onChange={() => setMethod("comment")} />
            의견
          </label>
          <label className={styles.radio}>
            <input type="radio" name="method" checked={method === "suggested_edit"} onChange={() => setMethod("suggested_edit")} />
            수정 제안
          </label>
        </fieldset>
        {method === "suggested_edit" && (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>바꿀 말</legend>
            {options.map((o, i) => (
              <label key={i} className={styles.radio}>
                <input type="radio" name="replacement" checked={choice === i} onChange={() => setChoice(i)} />
                <strong>{o}</strong>
                {i > 0 && <span className={styles.tag}>대안</span>}
              </label>
            ))}
          </fieldset>
        )}
        <label className={styles.label}>
          보내는 문구
          <textarea className={styles.textarea} value={text} onChange={(e) => setText(e.target.value)} rows={4} />
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
