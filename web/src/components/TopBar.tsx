"use client";

import Link from "next/link";
import { can } from "@/domain/permissions";
import { ROLE_LABEL } from "@/domain/labels";
import type { Role } from "@/types";
import styles from "./TopBar.module.css";

interface Props {
  role: Role;
  bookTitle: string;
  chapterTitle: string;
  onShare: () => void;
}

/** 작업 공간 상단 바(WS-10). 권한이 없는 버튼은 숨긴다(D-15). */
export function TopBar({ role, bookTitle, chapterTitle, onShare }: Props) {
  return (
    <header className={styles.bar}>
      <nav className={styles.path} aria-label="경로">
        {can(role, "open_editor_home") && (
          <>
            <Link href="/home">편집자 홈</Link>
            <span aria-hidden="true">›</span>
          </>
        )}
        <span className={styles.book}>{bookTitle}</span>
        <span aria-hidden="true">›</span>
        <span>{chapterTitle}</span>
      </nav>
      <span className={styles.badge} data-testid="role-badge">
        {ROLE_LABEL[role]}
      </span>
      <div className={styles.tools}>
        {can(role, "share_role_links") && (
          <button type="button" className={styles.button} onClick={onShare}>
            공유
          </button>
        )}
      </div>
    </header>
  );
}
