"use client";

import { useState } from "react";
import styles from "./TopBar.module.css";

interface Props {
  title: string;
  /** 고칠 수 있으면 넘겨요(편집자만, A-36·FR-55). 없으면 글자로만 보여요. */
  onRename?: (title: string) => Promise<void>;
}

/**
 * 상단 바 경로의 책 제목. 편집자는 눌러서 그 자리에서 고쳐요(11.22 사용자 의견, D-42).
 * Enter나 칸 밖을 누르면 저장하고 Esc는 취소예요. 비우면 저장하지 않고 원래 제목으로 돌아가요.
 */
export function BookTitle({ title, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (!onRename) return <span className={styles.book}>{title}</span>;

  async function save() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === title || !onRename) {
      setDraft(title);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
      setError(false);
    } catch {
      setDraft(title);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <input
        className={styles.titleInput}
        aria-label="책 제목"
        value={draft}
        maxLength={200}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          // 한글을 조합하는 중의 Enter·Esc는 글자 확정용이에요. 저장·취소로 받지 않아요(Codex 검수 11.22).
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(title);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`${styles.book} ${styles.titleButton}`}
      // 이름은 제목 글자 그대로 두고, 고칠 수 있다는 안내는 설명(title)으로 붙여요(새 책 만들기의 '책 제목' 칸과 이름이 겹치지 않게).
      title={error ? "제목을 바꾸지 못했어요. 다시 해 주세요." : "눌러서 책 제목 고치기"}
      disabled={busy}
      data-testid="book-title"
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
    >
      {title}
    </button>
  );
}
