"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isTourActive, TOUR_ACTIVITY_EVENT } from "@/components/tour-start";
import styles from "./HomeHero.module.css";

/**
 * 편집자 홈 맨 위 띠(시안 #be-store-hero). 시안은 출간 도서 사진을 넘기지만, 사진은 쓰지 않고(R10)
 * 색 면 위에 명조 제목을 얹은 책 그림으로 그려요. 넘김 단추·점·멈춤은 시안처럼 움직여요.
 */
const SLIDES = [
  { eyebrow: "BOOKTELIER ORIGINALS", title: "서로 다른 언어, 같은 마음", lead: "크리에이터의 이야기가 한 권의 책이 되기까지.", cover: "같은 마음" },
  { eyebrow: "BOOKTELIER COLLECTION", title: "AI 시대를 읽는 새로운 시선", lead: "하나의 아이디어에서 완성된 출판물까지.", cover: "새로운 시선" },
  { eyebrow: "BOOKTELIER NEW ARRIVALS", title: "열두 달의 이야기를 책으로", lead: "다양한 경험을 오래 남는 기록으로 만듭니다.", cover: "열두 달의 이야기" },
  { eyebrow: "BOOKTELIER BESTSELLERS", title: "나답게 살아가는 이야기", lead: "작가와 함께 만들어가는 한 권의 가능성.", cover: "나답게 살아가는 이야기" },
] as const;

const INTERVAL_MS = 6000;

export function HomeHero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tourLock, setTourLock] = useState(false);

  useEffect(() => {
    const onTour = () => setTourLock(isTourActive());
    onTour();
    window.addEventListener(TOUR_ACTIVITY_EVENT, onTour);
    return () => window.removeEventListener(TOUR_ACTIVITY_EVENT, onTour);
  }, []);

  useEffect(() => {
    if (paused || tourLock || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, tourLock]);

  const go = (n: number) => setIndex((n + SLIDES.length) % SLIDES.length);
  const slide = SLIDES[index];

  return (
    <section className={styles.hero} data-slide={index + 1} aria-roledescription="carousel" aria-label="북틀리에 소개">
      <article className={styles.slide} aria-roledescription="slide" aria-label={`${index + 1} / ${SLIDES.length}`}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>{slide.eyebrow}</span>
          <h2 className={styles.title}>{slide.title}</h2>
          <p className={styles.lead}>{slide.lead}</p>
          <div className={styles.actions}>
            <a className={styles.deep} href="#home-shelf">
              내가 맡은 책 보기 <span aria-hidden="true">↓</span>
            </a>
            <Link className={styles.ghost} href="/?new=1">
              새 책 만들기
            </Link>
          </div>
        </div>
        <div className={styles.art} aria-hidden="true">
          <span className={styles.book}>
            <span className={styles.bookBrand}>BOOKTELIER</span>
            <strong className={styles.bookTitle}>{slide.cover}</strong>
            <i className={styles.bookRule} />
            <small className={styles.bookFoot}>북틀리에 시리즈</small>
          </span>
        </div>
      </article>
      <div className={styles.footer}>
        <div className={styles.controls}>
          <button type="button" className={styles.control} onClick={() => go(index - 1)} aria-label="이전 소개">
            ‹
          </button>
          <div className={styles.dots}>
            {SLIDES.map((s, i) => (
              <button key={s.eyebrow} type="button" className={styles.dot} aria-current={i === index} aria-label={`${i + 1}번째 소개`} onClick={() => go(i)} />
            ))}
          </div>
          <button type="button" className={styles.control} onClick={() => go(index + 1)} aria-label="다음 소개">
            ›
          </button>
          <button type="button" className={styles.control} onClick={() => setPaused((p) => !p)} aria-label={paused ? "넘기기 다시 시작" : "넘기기 멈춤"} aria-pressed={paused}>
            {paused ? "▶" : "Ⅱ"}
          </button>
          <span className={styles.count}>
            {index + 1} / {SLIDES.length}
          </span>
        </div>
        <span className={styles.credit}>표지는 그림으로 그렸어요 · 시제품 구성</span>
      </div>
    </section>
  );
}
