"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookDeps } from "@/data";
import { StatusBadge } from "@/components/StatusBadge";
import { ThemeToggle } from "@/components/Theme";
import type { ProjectCard } from "@/types";
import styles from "./page.module.css";
import { Logo } from "@/components/Logo";

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
        <p className={styles.brand}>
          <Logo size="lg" withName />
        </p>
        <h1 className={styles.title}>편집자 홈</h1>
        <Link className={styles.newBook} href="/?new=1">
          새 책 만들기
        </Link>
        <ThemeToggle />
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
                {/* 표지: 제목 글자를 명조로 얹은 색 면(DESIGN.md 6장, 사진 없음) */}
                <span className={styles.cover} aria-hidden="true">
                  {c.title}
                </span>
                <span className={styles.info}>
                  <span className={styles.cardTitle}>{c.title}</span>
                  <StatusBadge status={c.stage} />
                  <span className={styles.meta}>
                    확인할 일 <strong data-testid="pending-count">{c.todo_count}</strong>
                  </span>
                  <span className={styles.meta}>참여자 {c.participants.length}명</span>
                  <span className={styles.meta}>최근 변경 {formatTs(c.updated_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
