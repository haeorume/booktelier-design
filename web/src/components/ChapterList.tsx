import Link from "next/link";
import { CHAPTER_STATUS_LABEL } from "@/domain/labels";
import type { Chapter } from "@/types";
import styles from "./ChapterList.module.css";

/** 원고 구조(WS-20). 장 제목과 장 상태 배지, 지금 보는 장 표시(FR-11, FR-12). */
export function ChapterList({ projectId, chapters, currentId }: { projectId: string; chapters: Chapter[]; currentId: string }) {
  return (
    <nav className={styles.panel} aria-label="원고 구조">
      <p className={styles.heading}>원고 구조</p>
      <ul className={styles.list}>
        {chapters.map((c) => (
          <li key={c.id}>
            <Link href={`/p/${projectId}/c/${c.id}`} className={styles.item} aria-current={c.id === currentId ? "page" : undefined}>
              <span className={styles.title}>{c.title}</span>
              <span className={styles.badge} data-testid="chapter-status">
                {CHAPTER_STATUS_LABEL[c.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
