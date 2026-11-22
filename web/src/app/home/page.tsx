"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookDeps } from "@/data";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/StatusBadge";
import { ROLE_LABEL } from "@/domain/labels";
import { TEMPLATES } from "@/domain/templates";
import type { ProjectCard, Role } from "@/types";
import { HomeHero } from "./HomeHero";
import { ServiceHeader } from "./ServiceHeader";
import { StartGuide } from "./StartGuide";
import styles from "./page.module.css";

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 표지 색 네 가지(시안 책 카드). 책 id로 늘 같은 색을 골라요. */
function coverOf(id: string): 1 | 2 | 3 | 4 {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ((h % 4) + 1) as 1 | 2 | 3 | 4;
}

/** 편집자 홈(HM-01, 시안 11.22 '#home'). 이 브라우저가 만든 책만 보인다(FR-02, FR-07). */
export default function EditorHome() {
  const [cards, setCards] = useState<ProjectCard[] | null>(null);
  const server = bookDeps().library.source === "server";

  useEffect(() => {
    let alive = true;
    // 확인할 일과 진행 단계는 서버가 센다(A-03, FR-02 ②).
    const show = (list: ProjectCard[]) => {
      if (!alive) return;
      setCards(list);
    };
    bookDeps()
      .library.myBooks()
      .then(show)
      .catch(() => show([]));
    return () => {
      alive = false;
    };
  }, []);

  const todo = (cards ?? []).reduce((n, c) => n + c.todo_count, 0);
  const first = (cards ?? []).find((c) => c.first_chapter_id);
  const workspaceHref = first?.first_chapter_id ? `/p/${first.id}/c/${first.first_chapter_id}` : null;

  return (
    <div className={styles.page}>
      <ServiceHeader role="editor" homeLink themeToggle />
      <main className={styles.main}>
        <HomeHero />

        <div className={styles.head}>
          <div>
            <span className={styles.eyebrow}>EDITOR’S DESK</span>
            <h1 className={styles.title}>
              <span className={styles.srOnly}>편집자 홈 · </span>
              오늘도, 한 권에 더 가까이.
            </h1>
            <p className={styles.lead}>여러 작가와 디자이너의 작업을, 책 한 권씩 이어갑니다</p>
          </div>
          <Link className={styles.primary} href="/?new=1" data-tour="new-book">
            <Icon name="plus" className={styles.buttonIcon} />새 책 만들기
          </Link>
        </div>

        <section id="home-intro" className={styles.intro} aria-labelledby="home-intro-title" data-tour="home-flow">
          <div className={styles.introCopy}>
            <span className={styles.eyebrowSm}>A BLANK PAGE, A SHARED START</span>
            <h2 id="home-intro-title">
              빈 첫 장에서,
              <br />
              함께 만드는 한 권으로.
            </h2>
            <p>
              편집자가 책을 만들고 초대장을 건넵니다.
              <br />
              작가는 글을, 디자이너는 지면을, 같은 책 위에서.
            </p>
            <Link className={`${styles.primary} ${styles.primarySm}`} href="/?new=1">
              <Icon name="plus" className={styles.buttonIcon} />새 책 만들기
            </Link>
            <small className={styles.steps}>
              <span>1 책 만들기</span>
              <i aria-hidden="true">→</i>
              <span>2 빈 원고 열기</span>
              <i aria-hidden="true">→</i>
              <span>3 참여자 초대</span>
            </small>
          </div>
          <div className={styles.roleMap} aria-hidden="true">
            <div className={styles.mapEditor}>
              <span className={styles.mapAvatar}>나</span>
              <strong>편집자</strong>
              <span className={styles.mapTags}>
                <b>
                  <Icon name="edit" size="xs" />
                  Edit
                </b>
                <b>
                  <Icon name="layout" size="xs" />
                  Layout
                </b>
              </span>
              <small>빈 원고에서 초대장 발급</small>
            </div>
            <div className={styles.mapArrow}>
              <span>
                <Icon name="right" size="sm" />
              </span>
              <small>초대</small>
            </div>
            <div className={styles.mapGuests}>
              <div data-role="author">
                <span className={styles.guestDot}>A</span>
                <span className={styles.guestText}>
                  <strong>작가</strong>
                  <small>원고 작성과 AI 제안</small>
                </span>
                <b>Edit</b>
              </div>
              <div data-role="designer">
                <span className={styles.guestDot}>D</span>
                <span className={styles.guestText}>
                  <strong>디자이너</strong>
                  <small>북디자인과 조판</small>
                </span>
                <b>Layout</b>
              </div>
            </div>
          </div>
        </section>

        <StartGuide workspaceHref={workspaceHref} />

        <section id="home-shelf" className={styles.shelfHead} aria-labelledby="home-shelf-title">
          <div className={styles.shelfTitle}>
            <h2 id="home-shelf-title">내가 맡은 책</h2>
            <span>{cards?.length ?? 0}</span>
          </div>
          <p>
            검토 요청과 새 의견 <strong>{todo}건</strong>
          </p>
        </section>
        <div className={styles.context}>
          <span>
            <Icon name="book" size="sm" />
            진행 중인 책을 열어 협업 화면을 살펴보세요.
          </span>
          <span>{cards ? `이 ${server ? "편집자 링크" : "브라우저"}에서 만든 책 ${cards.length}권` : ""}</span>
        </div>

        {cards === null ? null : cards.length === 0 ? (
          <section className={styles.empty} data-testid="home-empty">
            <span className={styles.newIcon} aria-hidden="true">
              <Icon name="book" />
            </span>
            <strong>아직 만든 책이 없어요.</strong>
            <p>빈 첫 장을 열고 함께할 사람을 초대하세요.</p>
            <Link className={`${styles.primary} ${styles.primarySm}`} href="/?new=1">
              <Icon name="plus" className={styles.buttonIcon} />새 책 만들기
            </Link>
          </section>
        ) : (
          <ul className={styles.cards}>
            {cards.map((c) => {
              const template = TEMPLATES[c.template_id];
              const others = c.participants.filter((p) => p.role !== "editor");
              const people = [{ id: "me", role: "editor" as Role, display_name: "나" }, ...others];
              return (
                <li key={c.id}>
                  <Link className={styles.card} href={c.first_chapter_id ? `/p/${c.id}/c/${c.first_chapter_id}` : "#"} data-testid="book-card">
                    {/* 표지: 제목 글자를 명조로 얹은 색 면(DESIGN.md 6장, 시안 .bf-book-cover, 사진 없음) */}
                    <span className={styles.cover} data-cover={coverOf(c.id)} aria-hidden="true">
                      <span className={styles.coverBrand}>BOOKTELIER</span>
                      <strong className={styles.coverTitle}>{c.title}</strong>
                      <i className={styles.coverRule} />
                      <small className={styles.coverKind}>{template?.label}</small>
                    </span>
                    <span className={styles.info}>
                      <span className={styles.top}>
                        <StatusBadge status={c.stage} size="lg" />
                        <span className={styles.arrow} aria-hidden="true">
                          <Icon name="right" />
                        </span>
                      </span>
                      <span className={styles.cardTitle}>{c.title}</span>
                      <span className={styles.cardMeta}>
                        {template?.label} · {template?.layout.trim.replace("x", "×")}mm
                      </span>
                      <span className={styles.people}>
                        <span className={styles.peopleLabel}>
                          참여자 <b>{c.participants.length}</b>
                        </span>
                        <span className={styles.chips}>
                          {people.map((p) => (
                            <span key={p.id} className={styles.person}>
                              <span className={styles.personDot} data-role={p.role} aria-hidden="true">
                                {p.display_name.slice(0, 1)}
                              </span>
                              <span>
                                {p.display_name}
                                <small>{ROLE_LABEL[p.role]}</small>
                              </span>
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className={styles.task}>
                        <Icon name={c.todo_count > 0 ? "comment" : "check"} size="xs" className={styles.taskIcon} />
                        <span>
                          확인할 일 <b data-testid="pending-count">{c.todo_count}</b>건
                        </span>
                      </span>
                      <small className={styles.detail}>{c.todo_count > 0 ? "검토 요청과 새 의견을 확인해 주세요." : "같은 원고에서 작업을 이어가세요."}</small>
                      <span className={styles.updated}>최근 변경 {formatTs(c.updated_at)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
            <li>
              <Link className={styles.newCard} href="/?new=1">
                <span className={styles.newIcon} aria-hidden="true">
                  <Icon name="plus" />
                </span>
                <strong>새 책 만들기</strong>
                <p>
                  빈 첫 장을 열고
                  <br />
                  함께할 사람을 초대하세요.
                </p>
              </Link>
            </li>
          </ul>
        )}

        <footer className={styles.footer}>
          <span className={styles.saved}>{server ? "서버에 저장" : "이 브라우저에 저장"}</span>
          <span>{server ? "다른 브라우저에서는 편집자 링크로 들어와요." : "다른 브라우저에서는 이 목록이 보이지 않습니다."}</span>
          <a className={styles.footLink} href="#home-guide">
            사용법 설명
          </a>
          <Link className={styles.footLink} href="/dev/events">
            시연 기록
          </Link>
        </footer>
      </main>
    </div>
  );
}
