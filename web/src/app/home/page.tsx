"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookDeps, lastActivityTs, myEditorProjects, unseenCommentCount } from "@/data";
import { bookStage, pendingTaskCount } from "@/domain/books";
import { CHAPTER_STATUS_LABEL } from "@/domain/labels";
import type { ChapterStatus, Project } from "@/types";
import styles from "./page.module.css";

interface Card {
  project: Project;
  firstChapterId: string | null;
  stage: ChapterStatus;
  pending: number;
  lastTs: number | null;
}

function formatTs(ts: number | null, fallbackIso: string): string {
  const d = ts === null ? new Date(fallbackIso) : new Date(ts);
  return d.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 편집자 홈(HM-01). 이 브라우저가 만든 책만 보인다(FR-02, FR-07). */
export default function EditorHome() {
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    let alive = true;
    const deps = bookDeps();
    (async () => {
      const projects = await myEditorProjects(deps);
      const result: Card[] = [];
      for (const project of projects) {
        const chapters = await deps.repo.listChapters(project.id);
        result.push({
          project,
          firstChapterId: chapters[0]?.id ?? null,
          stage: bookStage(chapters),
          pending: pendingTaskCount(chapters, await unseenCommentCount(deps, project.id)),
          lastTs: await lastActivityTs(deps, project.id),
        });
      }
      if (alive) setCards(result);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.brand}>Booktelier(북틀리에)</p>
        <h1 className={styles.title}>편집자 홈</h1>
        <Link className={styles.newBook} href="/?new=1">
          새 책 만들기
        </Link>
      </header>
      {cards === null ? null : cards.length === 0 ? (
        <section className={styles.empty} data-testid="home-empty">
          <p>아직 만든 책이 없어요.</p>
          <Link className={styles.newBook} href="/?new=1">
            새 책 만들기
          </Link>
        </section>
      ) : (
        <ul className={styles.cards}>
          {cards.map((c) => (
            <li key={c.project.id}>
              <Link className={styles.card} href={c.firstChapterId ? `/p/${c.project.id}/c/${c.firstChapterId}` : "#"} data-testid="book-card">
                <span className={styles.cardTitle}>{c.project.title}</span>
                <span className={styles.stage}>{CHAPTER_STATUS_LABEL[c.stage]}</span>
                <span className={styles.meta}>
                  확인할 일 <strong data-testid="pending-count">{c.pending}</strong>
                </span>
                <span className={styles.meta}>최근 변경 {formatTs(c.lastTs, c.project.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
