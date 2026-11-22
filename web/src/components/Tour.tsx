"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getClientSession } from "@/data";
import { Icon } from "./Icon";
import { setTourActive, TOUR_START_EVENT } from "./tour-start";
import styles from "./Tour.module.css";

/*
 * 사용법 투어(핸드독스 /modoo/start 방식). 지금 화면에 있는 단추만 가리키고,
 * 없는 단계는 건너뛰어요. 첫 방문에 한 번 뜨고, 왼쪽 아래 '사용법'으로 다시 열어요.
 */

interface Step {
  sel: string;
  title: string;
  body: string;
  at: (path: string) => boolean;
}

const home = (p: string) => p === "/" || p === "/home";
const work = (p: string) => p.startsWith("/p/");

const STEPS: Step[] = [
  { sel: '[data-tour="new-book"]', at: home, title: "여기서 한 권을 시작해요", body: "제목과 템플릿만 정하면 빈 첫 장이 열려요. 편집자가 만들고, 작가와 디자이너를 불러요." },
  { sel: '[data-tour="home-flow"]', at: home, title: "셋이 같은 책 위에서", body: "편집자가 초대장을 건네면 작가는 글을, 디자이너는 지면을 다뤄요. 역할마다 다른 화면을 만들지 않아요." },
  { sel: '[data-tour="home-guide"]', at: home, title: "설명은 여기서 펼쳐 읽어요", body: "각 기능 옆 (i)를 누르면 짧은 안내가 열려요. 왼쪽 아래 사용법에서 이 화면 투어를 다시 시작할 수 있어요." },
  { sel: '[data-testid="page"]', at: work, title: "이 지면이 작업의 중심이에요", body: "세 역할이 같은 책 모양 종이를 봐요. 보이는 도구만 역할에 따라 달라요." },
  { sel: '[data-testid="role-badge"]', at: work, title: "지금은 이 역할로 들어와 있어요", body: "편집자는 초대와 장 검토, 작가는 원고, 디자이너는 조판을 맡아요." },
  { sel: '[data-tour="invite"]', at: work, title: "작가와 디자이너를 불러요", body: "역할마다 다른 링크를 복사해 건네면, 받는 사람은 그 역할로 들어와요." },
  { sel: '[data-tour="chapters"]', at: work, title: "장은 왼쪽에서 고르고 더해요", body: "장 제목을 찾고 새 장을 추가해요. 의견과 제안, 원고 표기 기준으로도 바로 갈 수 있어요." },
  { sel: '[data-testid="review-slot"]', at: work, title: "오른쪽에서 제안과 의견을 봐요", body: "장 검토로 AI 제안을 돌리고, 함께 봄과 AI 대화에서 의견과 질문을 나눠요." },
  { sel: '[data-tour="layout"]', at: work, title: "조판은 조판 설정에서 열어요", body: "판형·여백·행간을 바꾸면 지면에 바로 반영돼요. 상단의 조판 단추로도 같은 화면이 열려요. 작가는 값만 봐요." },
  { sel: '[data-testid="preview-link"]', at: work, title: "펼침면으로 확인해요", body: "미리보기는 고칠 수 없는 저장본이에요. 쪽을 넘겨 책처럼 봐요." },
];

const PAD = 8;
const CARD_W = 320;
const CARD_H = 170;
const MARGIN = 16;
const GAP = 12;

function visibleTarget(sel: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>(sel)].find((el) => {
      if (el.closest("[inert]")) return false;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }) ?? null
  );
}

function liveSteps(path: string): { step: Step; el: HTMLElement }[] {
  return STEPS.flatMap((step) => {
    if (!step.at(path)) return [];
    const el = visibleTarget(step.sel);
    return el ? [{ step, el }] : [];
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function sameRect(a: DOMRect | null, b: DOMRect) {
  return Boolean(a && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);
}

/** 안내 카드가 화면 밖으로 나가지 않게, 빈 쪽으로 붙인다. */
function placeCard(hole: DOMRect, cardW: number, cardH: number): { top: number; left: number; width: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxLeft = Math.max(MARGIN, vw - cardW - MARGIN);
  const maxTop = Math.max(MARGIN, vh - cardH - MARGIN);
  const fits = (space: number, need: number) => space >= need + 8;
  const below = vh - hole.bottom - GAP;
  const above = hole.top - GAP;
  const right = vw - hole.right - GAP;
  const left = hole.left - GAP;
  const tall = hole.height > vh * 0.42;
  const centerX = hole.left + hole.width / 2 - cardW / 2;

  let top: number;
  let leftPos: number;

  if (tall && fits(right, cardW)) {
    leftPos = hole.right + GAP;
    top = hole.top + 20;
  } else if (tall && fits(left, cardW)) {
    leftPos = hole.left - GAP - cardW;
    top = hole.top + 20;
  } else if (!tall && fits(below, cardH)) {
    top = hole.bottom + GAP;
    leftPos = centerX;
  } else if (!tall && fits(above, cardH)) {
    top = hole.top - GAP - cardH;
    leftPos = centerX;
  } else if (fits(right, cardW)) {
    leftPos = hole.right + GAP;
    top = hole.top + hole.height / 2 - cardH / 2;
  } else if (fits(left, cardW)) {
    leftPos = hole.left - GAP - cardW;
    top = hole.top + hole.height / 2 - cardH / 2;
  } else if (fits(below, cardH)) {
    top = hole.bottom + GAP;
    leftPos = centerX;
  } else if (fits(above, cardH)) {
    top = hole.top - GAP - cardH;
    leftPos = centerX;
  } else {
    leftPos = hole.left + 20;
    top = Math.min(hole.bottom - cardH - 20, hole.top + 20);
  }

  return {
    top: clamp(top, MARGIN, maxTop),
    left: clamp(leftPos, MARGIN, maxLeft),
    width: Math.min(cardW, vw - MARGIN * 2),
  };
}

export function Tour() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [items, setItems] = useState<{ step: Step; el: HTMLElement }[]>([]);
  const [hole, setHole] = useState<DOMRect | null>(null);
  const [cardBox, setCardBox] = useState({ w: CARD_W, h: CARD_H });
  const cardRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    const next = liveSteps(pathname);
    setItems(next);
    return next;
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
    setTourActive(false);
    getClientSession().markTourDone();
  }, []);

  const start = useCallback(() => {
    const next = refresh();
    if (next.length === 0) return;
    setIndex(0);
    setOpen(true);
    setTourActive(true);
  }, [refresh]);

  useEffect(() => {
    const on = () => start();
    window.addEventListener(TOUR_START_EVENT, on);
    return () => window.removeEventListener(TOUR_START_EVENT, on);
  }, [start]);

  useEffect(() => {
    const onHome = pathname === "/home";
    const onWork = pathname.startsWith("/p/");
    if (!onHome && !onWork) return;
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    if (getClientSession().isTourDone()) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      const next = refresh();
      if (next.length > 0) {
        setIndex(0);
        setOpen(true);
        setTourActive(true);
        window.clearInterval(id);
      } else if (tries > 25) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [pathname, refresh]);

  useEffect(() => {
    setTourActive(open);
    return () => setTourActive(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const next = liveSteps(pathname);
    const cur = next[Math.min(index, Math.max(0, next.length - 1))];
    cur?.el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open, index, pathname]);

  useLayoutEffect(() => {
    if (!open) return;
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const next = liveSteps(pathname);
      setItems((prev) => (prev.length === next.length && prev.every((item, i) => item.step === next[i]?.step && item.el === next[i]?.el) ? prev : next));
      const cur = next[Math.min(index, Math.max(0, next.length - 1))];
      if (!cur) setHole(null);
      else {
        const r = cur.el.getBoundingClientRect();
        setHole((prev) => (sameRect(prev, r) ? prev : r));
      }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, index, pathname, close]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCardBox((prev) => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1 ? prev : { w: r.width, h: r.height }));
  }, [open, index, hole, items]);

  const total = items.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = items[safeIndex];
  const last = safeIndex >= total - 1;

  const tooltipStyle = hole ? placeCard(hole, cardBox.w, cardBox.h) : { top: "50%" as const, left: "50%" as const, transform: "translate(-50%, -50%)", width: CARD_W };

  return (
    <>
      {!open && !work(pathname) && (
        <button type="button" className={styles.help} onClick={start} aria-label="북틀리에 사용법">
          북틀리에 사용법
          <span className={styles.helpDot} aria-hidden="true">
            <Icon name="info" size="sm" />
          </span>
        </button>
      )}
      {open && total > 0 && current && (
        <div className={styles.layer} role="dialog" aria-modal="true" aria-label="북틀리에 사용법">
          <button type="button" className={styles.skip} onClick={close}>
            튜토리얼 건너뛰기
            <Icon name="close" size="sm" />
          </button>
          <div className={styles.scrim} onClick={close} />
          {hole && (
            <div
              className={styles.hole}
              style={{ top: hole.top - PAD, left: hole.left - PAD, width: hole.width + PAD * 2, height: hole.height + PAD * 2 }}
            />
          )}
          <div ref={cardRef} className={styles.card} style={tooltipStyle}>
            <p className={styles.count}>
              {safeIndex + 1} / {total}
            </p>
            <h2 className={styles.title}>{current.step.title}</h2>
            <p className={styles.body}>{current.step.body}</p>
            <div className={styles.nav}>
              {safeIndex > 0 && (
                <button type="button" className={styles.arrow} onClick={() => setIndex((i) => i - 1)} aria-label="이전">
                  <Icon name="chevron" size="sm" className={styles.prevIcon} />
                </button>
              )}
              <button
                type="button"
                className={styles.arrow}
                onClick={() => {
                  if (last) close();
                  else setIndex((i) => i + 1);
                }}
                aria-label={last ? "마침" : "다음"}
              >
                <Icon name={last ? "check" : "chevron"} size="sm" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
