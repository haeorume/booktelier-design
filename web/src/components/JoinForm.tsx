"use client";

import { useState } from "react";
import { ROLE_LABEL } from "@/domain/labels";
import type { Role } from "@/types";
import styles from "./JoinForm.module.css";

interface Props {
  bookTitle: string;
  role: Role;
  onJoin: (name: string) => void | Promise<void>;
  /** 개발용 막대에서 열었을 때 닫기 */
  onCancel?: () => void;
}

/** 링크로 들어오기(JN-01). 책 제목과 받은 역할을 보여 주고 이름을 받는다(FR-06 ①②). */
export function JoinForm({ bookTitle, role, onJoin, onCancel }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const empty = name.trim().length === 0;

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (empty || busy) return;
        setBusy(true);
        try {
          await onJoin(name.trim());
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className={styles.book} data-testid="join-book-title">
        {bookTitle}
      </p>
      <p className={styles.role}>
        <span className={styles.badge} data-testid="join-role">
          {ROLE_LABEL[role]}
        </span>
        로 들어가요
      </p>
      <label className={styles.label}>
        이름
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
      </label>
      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.secondary} onClick={onCancel}>
            닫기
          </button>
        )}
        <button type="submit" className={styles.primary} disabled={empty || busy}>
          들어가기
        </button>
      </div>
    </form>
  );
}
