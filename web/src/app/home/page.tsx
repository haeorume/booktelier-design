"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookDeps } from "@/data";
import { CHAPTER_STATUS_LABEL } from "@/domain/labels";
import type { ProjectCard } from "@/types";
import styles from "./page.module.css";

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 편집자 홈(HM-01). 이 브라우저가 만든 책만 보인다(FR-02, FR-07). */
export default function EditorHome() {
  const [cards, setCards] = useState<ProjectCard[] | null>(null);

  useEffect(() => {
    let alive = true;
    // 확인할 일과 진행 단계는 서버가 센다(A-03, FR-02 ②).
    bookDeps()
      .library.myBooks()
      .then((list) => alive && setCards(list))
      .catch(() => alive && setCards([]));
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
            <li key={c.id}>
              <Link className={styles.card} href={c.first_chapter_id ? `/p/${c.id}/c/${c.first_chapter_id}` : "#"} data-testid="book-card">
                <span className={styles.cardTitle}>{c.title}</span>
                <span className={styles.stage}>{CHAPTER_STATUS_LABEL[c.stage]}</span>
                <span className={styles.meta}>
                  확인할 일 <strong data-testid="pending-count">{c.todo_count}</strong>
                </span>
                <span className={styles.meta}>참여자 {c.participants.length}명</span>
                <span className={styles.meta}>최근 변경 {formatTs(c.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
