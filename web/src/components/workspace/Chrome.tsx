"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ROLE_LABEL } from "@/domain/labels";
import type { ChapterInfo } from "@/data";
import type { Role } from "@/types";
import { Icon, type IconName } from "../Icon";
import styles from "./Chrome.module.css";

/*
 * 작업 공간 둘레(시안 11.22): 장 탭 줄 · 메뉴 막대 · 작업 머리 · 서식 막대 · 눈금자 · 상태 줄.
 * 앱에 있는 기능(미리보기, 검토본, 실행 취소, 패널 보기, 안내선, 장 검토 …)에 이어 붙이고,
 * 1차에 없는 글자 서식(D-13)은 시안 모양만 두어 누를 수 없게(tabIndex -1, aria-disabled) 했어요.
 */

/* ── 장 탭 줄(시안 .bf-project-tabs) ───────────────────────── */

export function ChapterTabs({ projectId, chapters, currentId, homeHref, onAdd }: { projectId: string; chapters: ChapterInfo[]; currentId: string; homeHref: string | null; onAdd?: () => void }) {
  return (
    <nav className={styles.tabs} aria-label="장 탭">
      {homeHref && (
        <Link className={styles.tabsHome} href={homeHref}>
          <Icon name="folder" size="sm" />
          <span>내 책</span>
        </Link>
      )}
      <div className={styles.tabScroll}>
        {chapters.map((c) => (
          <Link key={c.id} href={`/p/${projectId}/c/${c.id}`} className={styles.tab} aria-current={c.id === currentId ? "page" : undefined} title={c.title}>
            <Icon name="book" size="xs" />
            <span>{c.title}</span>
            {c.id === currentId && <i aria-hidden="true" />}
          </Link>
        ))}
      </div>
      {onAdd && (
        <button type="button" className={styles.tabsAdd} onClick={onAdd} aria-label="새 장 추가" title="새 장 추가">
          <Icon name="plus" size="sm" />
        </button>
      )}
      <span className={styles.tabsAll}>
        <Icon name="down" size="xs" />
        <span>모든 장</span>
        <b>{chapters.length}</b>
      </span>
    </nav>
  );
}

/* ── 메뉴 막대(시안 .menubar + .popup-menu) ─────────────────── */

export type MenuItem =
  | { kind: "caption"; label: string }
  | { kind: "line" }
  | { kind: "action"; label: string; icon?: IconName; hint?: string; onSelect?: () => void }
  | { kind: "check"; label: string; checked: boolean; onToggle: () => void };

export interface Menu {
  label: string;
  items: MenuItem[];
}

export function MenuBar({ menus, onFocusMode, focus }: { menus: Menu[]; onFocusMode: () => void; focus: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !bar.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <nav className={styles.menubar} ref={bar} aria-label="메뉴">
      {menus.map((m) => (
        <div key={m.label} className={styles.menuAnchor}>
          <button type="button" className={styles.menuTrigger} aria-haspopup="menu" aria-expanded={open === m.label} onClick={() => setOpen((o) => (o === m.label ? null : m.label))} onMouseEnter={() => open && setOpen(m.label)}>
            {m.label}
          </button>
          {open === m.label && (
            <div className={styles.menu} role="menu" aria-label={m.label}>
              {m.items.map((it, i) => {
                if (it.kind === "caption")
                  return (
                    <span key={i} className={styles.menuCaption}>
                      {it.label}
                    </span>
                  );
                if (it.kind === "line") return <div key={i} className={styles.menuLine} />;
                if (it.kind === "check")
                  return (
                    <button key={i} type="button" role="menuitemcheckbox" aria-checked={it.checked} className={styles.menuCheck} onClick={() => it.onToggle()}>
                      <span className={styles.box} aria-hidden="true">
                        {it.checked && <Icon name="check" size="xs" />}
                      </span>
                      {it.label}
                    </button>
                  );
                return (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    aria-disabled={!it.onSelect}
                    onClick={() => {
                      if (!it.onSelect) return;
                      setOpen(null);
                      it.onSelect();
                    }}
                  >
                    {it.icon && <Icon name={it.icon} size="sm" />}
                    <span>{it.label}</span>
                    {it.hint && <kbd>{it.hint}</kbd>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <div className={styles.menubarEnd}>
        <button type="button" className={styles.iconBtn} aria-pressed={focus} onClick={onFocusMode} aria-label="집중해서 보기" title="집중해서 보기">
          <Icon name="focus" />
        </button>
      </div>
    </nav>
  );
}

/* ── 작업 머리(시안 .workspace-header) ──────────────────────── */

const ROLE_WORK: Record<Role, string> = {
  editor: "원고 편집과 조판",
  author: "원고 쓰기",
  designer: "조판과 의견",
};

export type Density = "simple" | "basic" | "detail";

export function WorkHeader(props: {
  role: Role;
  chapterOrder: number;
  chapterTitle: string;
  status: ReactNode;
  actions: ReactNode;
  layoutOpen: boolean;
  onMode: (mode: "edit" | "layout") => void;
  density: Density;
  onDensity: (d: Density) => void;
  onCollapse: () => void;
}) {
  const { role, chapterOrder, chapterTitle, status, actions, layoutOpen, onMode, density, onDensity, onCollapse } = props;
  return (
    <div className={styles.header} data-testid="work-header">
      <div className={styles.working}>
        <span className={styles.eyebrow}>{layoutOpen ? "LAYOUT WORKSPACE" : "EDIT WORKSPACE"}</span>
        <span className={styles.current}>
          {chapterTitle.startsWith(`${chapterOrder}장`) ? chapterTitle : `${chapterOrder}장 · ${chapterTitle}`}
        </span>
        <div className={styles.flow}>
          {status}
          <span className={styles.workRole}>
            {ROLE_LABEL[role]} · {ROLE_WORK[role]}
          </span>
        </div>
      </div>
      {/* 시안 .mode-switch: 원고 편집 · 조판. 조판을 고르면 조판 설정이 열려요. */}
      <div className={styles.modeSwitch} role="group" aria-label="작업 전환">
        <button type="button" className={styles.orb} aria-pressed={!layoutOpen} onClick={() => onMode("edit")}>
          <strong>원고 편집</strong>
          <small>{ROLE_LABEL[role]}</small>
        </button>
        <button type="button" className={styles.orb} aria-pressed={layoutOpen} onClick={() => onMode("layout")}>
          <strong>조판</strong>
          <small>{ROLE_LABEL[role]}</small>
        </button>
      </div>
      <div className={styles.options}>
        <div className={styles.actions}>{actions}</div>
        <label className={styles.density}>
          <Icon name="settings" size="xs" />
          <select value={density} onChange={(e) => onDensity(e.target.value as Density)} aria-label="도구 표시">
            <option value="simple">간단</option>
            <option value="basic">기본</option>
            <option value="detail">상세</option>
          </select>
        </label>
        <button type="button" className={styles.iconBtn} onClick={onCollapse} aria-label="작업 머리 접기" title="작업 머리 접기">
          <Icon name="minimize" />
        </button>
      </div>
    </div>
  );
}

/* ── 서식 막대(시안 .toolbar-stage) ─────────────────────────── */

function Tool({ icon, label, onClick, accent, text }: { icon: IconName; label: string; onClick?: () => void; accent?: boolean; text?: string }) {
  return (
    <button
      type="button"
      className={`${styles.tool} ${accent ? styles.accentTool : ""} ${text ? styles.labeled : ""}`}
      aria-label={label}
      title={onClick ? label : `${label} (시안 기능, 아직 쓸 수 없어요)`}
      aria-disabled={!onClick}
      tabIndex={onClick ? undefined : -1}
      onClick={onClick}
    >
      <Icon name={icon} size={text ? "sm" : "md"} />
      {text}
    </button>
  );
}

function FakeSelect({ value, width }: { value: string; width: number }) {
  return (
    <span className={styles.fakeSelect} style={{ width }} aria-hidden="true">
      {value}
      <Icon name="down" size="xs" />
    </span>
  );
}

export function FormatToolbar(props: { density: Density; canEdit: boolean; onUndo: () => void; onRedo: () => void; onSuggest?: () => void; onComment?: () => void; onAi?: () => void; guides: boolean; onGuides: () => void; onCompare?: () => void }) {
  const { density, canEdit, onUndo, onRedo, onSuggest, onComment, onAi, guides, onGuides, onCompare } = props;
  if (density === "simple") return null;
  return (
    <div className={styles.toolbarStage} role="toolbar" aria-label="서식 막대">
      <div className={styles.toolRow}>
        <div className={styles.toolGroup}>
          <Tool icon="undo" label="되돌리기" onClick={canEdit ? onUndo : undefined} />
          <Tool icon="redo" label="다시 하기" onClick={canEdit ? onRedo : undefined} />
        </div>
        <div className={styles.toolGroup}>
          <FakeSelect value="본문" width={65} />
        </div>
        <div className={styles.toolGroup}>
          <FakeSelect value="명조" width={82} />
          <FakeSelect value="16" width={39} />
        </div>
        <div className={styles.toolGroup}>
          <Tool icon="bold" label="굵게" />
          <Tool icon="italic" label="기울임" />
          <Tool icon="underline" label="밑줄" />
        </div>
        <div className={styles.toolGroup}>
          <Tool icon="align-left" label="왼쪽 정렬" />
          <Tool icon="align-center" label="가운데 정렬" />
        </div>
        <div className={styles.toolGroup}>
          <Tool icon="image" label="이미지" />
        </div>
        <div className={`${styles.toolGroup} ${styles.lastGroup}`}>
          <Tool icon="track" label="고른 글 고쳐 쓰기" text="수정 제안" onClick={onSuggest} />
          <Tool icon="comment" label="고른 글에 의견" onClick={onComment} />
          <Tool icon="spark" label="북틀리에 AI 검토" onClick={onAi} accent />
        </div>
      </div>
      {density === "detail" && (
        <div className={`${styles.toolRow} ${styles.toolRow2}`}>
          <div className={styles.toolGroup}>
            <span className={styles.colorTool} aria-hidden="true">
              <Icon name="type" />
              <i />
            </span>
            <span className={`${styles.colorTool} ${styles.highlight}`} aria-hidden="true">
              가
            </span>
          </div>
          <div className={styles.toolGroup}>
            <Tool icon="list" label="글머리 목록" />
            <Tool icon="number-list" label="번호 목록" />
            <Tool icon="indent" label="들여쓰기" />
            <Tool icon="outdent" label="내어쓰기" />
          </div>
          <div className={styles.toolGroup}>
            <Icon name="leading" size="sm" />
            <FakeSelect value="" width={50} />
          </div>
          <div className={styles.toolGroup}>
            <Tool icon="link" label="링크" />
            <Tool icon="note" label="각주" />
            <Tool icon="layout" label="여백 안내선" onClick={onGuides} />
            <Tool icon="eraser" label="서식 지우기" />
          </div>
          <div className={`${styles.toolGroup} ${styles.lastGroup}`}>
            <Tool icon="track" label="변경 비교" text="변경 비교" onClick={onCompare} />
          </div>
          <span className={styles.guidesState} aria-live="polite">
            {guides ? "안내선 켜짐" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── 눈금자(시안 .canvas-ruler): 지면 폭에 맞춘 mm 눈금 ─────── */

export function Ruler({ widthMm, scale }: { widthMm: number; scale: number }) {
  const px = (widthMm * 96) / 25.4;
  const labels = [];
  for (let mm = 0; mm <= widthMm; mm += 20) labels.push(mm);
  return (
    <div className={styles.ruler} aria-hidden="true" style={{ width: px * scale, ["--tick" as string]: `${(10 / widthMm) * 100}%` }}>
      {labels.map((mm) => (
        <span key={mm} style={{ left: `${(mm / widthMm) * 100}%` }}>
          {mm}
        </span>
      ))}
    </div>
  );
}

/* ── 상태 줄(시안 .statusbar) ──────────────────────────────── */

export function StatusBar({ mode, chars, zoom, onZoom, onPreview }: { mode: string; chars: number; zoom: number; onZoom: (z: number) => void; onPreview: () => void }) {
  return (
    <footer className={styles.statusbar}>
      <span className={styles.statusMode}>
        <i aria-hidden="true" />
        {mode}
      </span>
      <span>{chars.toLocaleString("ko-KR")}자</span>
      <div className={styles.statusEnd}>
        <button type="button" className={styles.plain} onClick={onPreview}>
          페이지 보기
        </button>
        <span className={styles.separator} />
        <button type="button" className={styles.plain} onClick={() => onZoom(Math.max(50, zoom - 10))} aria-label="지면 작게">
          −
        </button>
        <button type="button" className={styles.plain} onClick={() => onZoom(100)} aria-label="지면 크기 100%로">
          {zoom}%
        </button>
        <button type="button" className={styles.plain} onClick={() => onZoom(Math.min(200, zoom + 10))} aria-label="지면 크게">
          +
        </button>
      </div>
    </footer>
  );
}
