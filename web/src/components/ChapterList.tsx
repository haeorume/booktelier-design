"use client";

import Link from "next/link";
import { useState } from "react";
import type { Chapter } from "@/types";
import styles from "./ChapterList.module.css";
import { StatusBadge } from "./StatusBadge";

interface Props {
  projectId: string;
  chapters: Pick<Chapter, "id" | "title" | "status">[];
  currentId: string;
  /** 장 추가(FR-15). 편집자·작가만 받는다(Q-20). 없으면 버튼을 숨긴다(D-15). */
  onAdd?: (title: string) => Promise<void>;
}

/** 원고 구조(WS-20). 장 제목과 장 상태 배지, 지금 보는 장 표시(FR-11, FR-12), 장 추가(FR-15). */
export function ChapterList({ projectId, chapters, currentId, onAdd }: Props) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    const name = title.trim();
    if (!name || !onAdd || busy) return;
    setBusy(true);
    try {
      await onAdd(name);
      setTitle("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <nav className={styles.panel} aria-label="원고 구조">
      <p className={styles.heading}>원고 구조</p>
      <ul className={styles.list}>
        {chapters.map((c) => (
          <li key={c.id}>
            <Link href={`/p/${projectId}/c/${c.id}`} className={styles.item} aria-current={c.id === currentId ? "page" : undefined} title={c.title}>
              <span className={styles.title}>{c.title}</span>
              <StatusBadge status={c.status} testId="chapter-status" />
            </Link>
          </li>
        ))}
      </ul>
      {onAdd &&
        (adding ? (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="장 제목" aria-label="새 장 제목" maxLength={100} autoFocus />
            <span className={styles.formButtons}>
              <button type="button" onClick={() => setAdding(false)}>
                닫기
              </button>
              <button type="submit" disabled={!title.trim() || busy}>
                추가
              </button>
            </span>
          </form>
        ) : (
          <button type="button" className={`${styles.item} ${styles.add}`} onClick={() => setAdding(true)}>
            <span aria-hidden="true">+ </span>장 추가
          </button>
        ))}
    </nav>
  );
}
