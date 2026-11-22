"use client";

import Link from "next/link";
import { can } from "@/domain/permissions";
import { ROLE_LABEL } from "@/domain/labels";
import type { PresentPerson } from "@/data";
import type { Participant, Role } from "@/types";
import { BookTitle } from "./BookTitle";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { ThemeToggle } from "./Theme";
import { Participants } from "./Participants";
import styles from "./TopBar.module.css";

/** 역할 아래 작은 설명(시안 .bf-session-role small) */
const ROLE_SUB: Record<Role, string> = {
  editor: "Edit + Layout",
  author: "Edit",
  designer: "Layout",
};

/** 역할이 하는 일(시안 .be-collab-permission) */
const ROLE_SCOPE: Record<Role, string> = {
  editor: "원고·조판",
  author: "원고 쓰기",
  designer: "조판·의견",
};

interface Props {
  role: Role;
  bookTitle: string;
  /** 책 제목 고치기(A-36). 편집자만 넘어와요. */
  onRename?: (title: string) => Promise<void>;
  chapterTitle: string;
  participants: Participant[];
  currentId: string;
  /** 지금 이 책을 연 다른 사람(F4). null이면 서버 없는 1차 데모 */
  present: PresentPerson[] | null;
  chapterTitles: Map<string, string>;
  onJump: (person: PresentPerson) => void;
  /** 작업 공간이 저장 상태(WS-14)를 그려 넣을 자리 */
  saveSlotRef: (el: HTMLElement | null) => void;
  /** 미리보기 주소(WS-15, PV-01). 새 탭으로도 열 수 있게 링크로 둬요. */
  previewHref: string;
  /** 미리보기를 작업 공간 안에서 열어요(D-40). 새 탭으로 열 때(Ctrl·가운데 클릭)는 주소로 가요. */
  onPreview: () => void;
  /** 오른쪽 검토 패널을 접었는지(DESIGN.md 3장 '오른쪽 패널 접기') */
  panelCollapsed: boolean;
  onTogglePanel: () => void;
  /** 시안의 패널 묶음 단추(목차 · 도구 · 속성). 목차 = 원고 구조, 도구 = 메뉴·서식 막대, 속성 = 조판 설정 */
  navOpen: boolean;
  onToggleNav: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  layoutOpen: boolean;
  onToggleLayout: () => void;
  onShowAll: () => void;
  /** 의견 단추: 검토 패널의 '함께 봄'을 열어요 */
  onOpenShared: () => void;
  /** 파일 저장: 지금 장의 원고를 글 파일로 내려받아요 */
  onExport: () => void;
  onShare: () => void;
}

/**
 * 작업 공간 상단 바(WS-10, 시안 11.22 .topbar). 권한이 없는 버튼은 숨긴다(D-15).
 * 순서: 로고 · 경로 · 패널 묶음 단추 | 역할 · 참여자 · 초대 · 미리보기 · 저장 상태 · 테마 · 파일 저장 · 검토 패널 접기
 */
export function TopBar(props: Props) {
  const { role, bookTitle, onRename, chapterTitle, participants, currentId, present, chapterTitles, onJump, saveSlotRef, previewHref, onPreview, panelCollapsed, onTogglePanel } = props;
  const { navOpen, onToggleNav, toolsOpen, onToggleTools, layoutOpen, onToggleLayout, onShowAll, onOpenShared, onExport, onShare } = props;
  const home = can(role, "open_editor_home");
  return (
    <header className={styles.bar}>
      {/* 로고를 누르면 편집자 홈으로(11.22). 편집자 홈은 편집자만 있어서(D-15) 다른 역할에는 링크가 아니에요. */}
      {home ? (
        <Link className={styles.brand} href="/home" aria-label="BOOKTELIER 홈으로" data-testid="logo-home">
          <Logo studio />
        </Link>
      ) : (
        <span className={styles.brand}>
          <Logo studio />
        </span>
      )}
      <nav className={styles.path} aria-label="경로">
        <Icon name="folder" size="sm" />
        {home && (
          <>
            <Link href="/home" className={styles.home}>
              편집자 홈
            </Link>
            <Icon name="chevron" size="sm" />
          </>
        )}
        <BookTitle key={bookTitle} title={bookTitle} onRename={can(role, "rename_project") ? onRename : undefined} />
        <Icon name="chevron" size="xs" className={styles.chapterSep} />
        <span className={styles.chapter}>{chapterTitle}</span>
      </nav>
      <div className={styles.panelControls} role="group" aria-label="패널 묶음">
        <button type="button" className={styles.panelToggle} aria-pressed={navOpen} onClick={onToggleNav} title="원고 구조 보기">
          <Icon name="left" size="sm" />
          <span>목차</span>
          <i aria-hidden="true" />
        </button>
        <button type="button" className={styles.panelToggle} aria-pressed={toolsOpen} onClick={onToggleTools} title="메뉴와 서식 막대 보기">
          <Icon name="edit" size="sm" />
          <span>도구</span>
          <i aria-hidden="true" />
        </button>
        {/* 시안의 '속성' 자리. 이름은 '조판 설정'(e2e·스크린리더가 찾는 이름) */}
        <button type="button" className={styles.panelToggle} aria-pressed={layoutOpen} aria-label="조판 설정" onClick={onToggleLayout} title="조판 설정">
          <Icon name="settings" size="sm" />
          <span aria-hidden="true">속성</span>
          <i aria-hidden="true" />
        </button>
        <button type="button" className={styles.showAll} onClick={onShowAll} aria-label="패널 모두 보기" title="패널 모두 보기">
          <Icon name="grid" size="sm" />
        </button>
      </div>
      <div className={styles.tools}>
        <div className={styles.session}>
          <span className={styles.roleDot} data-role={role} aria-hidden="true">
            {ROLE_LABEL[role].slice(0, 1)}
          </span>
          <span className={styles.roleText}>
            <span data-testid="role-badge">{ROLE_LABEL[role]}</span>
            <small>{ROLE_SUB[role]}</small>
          </span>
        </div>
        <div className={styles.collab}>
          <Participants participants={participants} currentId={currentId} present={present} chapterTitles={chapterTitles} onJump={onJump} />
          <span className={styles.permission}>
            {ROLE_LABEL[role]} · {ROLE_SCOPE[role]}
          </span>
          <button type="button" className={styles.iconButton} onClick={onOpenShared} aria-label="함께 봄 열기" title="의견과 제안 모아 보기">
            <Icon name="comment" />
          </button>
          {can(role, "share_role_links") && (
            <button type="button" className={styles.share} onClick={onShare}>
              <Icon name="link" />
              초대
            </button>
          )}
        </div>
        <Link
          className={styles.utility}
          href={previewHref}
          data-testid="preview-link"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // 새 탭·새 창은 주소로
            e.preventDefault();
            onPreview();
          }}
        >
          <Icon name="book" size="sm" />
          미리보기
        </Link>
        <div className={styles.saveSlot} ref={saveSlotRef} />
        <ThemeToggle />
        <button type="button" className={styles.fileButton} onClick={onExport} title="지금 장의 원고를 글 파일(.txt)로 내려받아요">
          <Icon name="download" />
          파일 저장
        </button>
        {/* 검토 패널을 접으면 지면이 넓어져요. 접어도 보던 탭과 거르기는 남아요. */}
        <button
          type="button"
          className={styles.panelButton}
          aria-pressed={panelCollapsed}
          data-testid="panel-toggle"
          title={panelCollapsed ? "검토 패널 펴기" : "검토 패널 접기"}
          onClick={onTogglePanel}
        >
          <Icon name="right" />
          <span className={styles.hidden}>{panelCollapsed ? "검토 패널 펴기" : "검토 패널 접기"}</span>
        </button>
      </div>
    </header>
  );
}
