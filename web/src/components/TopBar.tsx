"use client";

import Link from "next/link";
import { can } from "@/domain/permissions";
import { ROLE_LABEL } from "@/domain/labels";
import type { PresentPerson } from "@/data";
import type { Participant, Role } from "@/types";
import { BookTitle } from "./BookTitle";
import { Logo } from "./Logo";
import { ThemeToggle } from "./Theme";
import { Participants } from "./Participants";
import styles from "./TopBar.module.css";

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
  /** 작업 공간이 장 상태·검토 요청 버튼(WS-31)과 저장 상태(WS-14)를 그려 넣을 자리 */
  chapterSlotRef: (el: HTMLElement | null) => void;
  saveSlotRef: (el: HTMLElement | null) => void;
  /** 미리보기 주소(WS-15, PV-01). 새 탭으로도 열 수 있게 링크로 둬요. */
  previewHref: string;
  /** 미리보기를 작업 공간 안에서 열어요(D-40). 새 탭으로 열 때(Ctrl·가운데 클릭)는 주소로 가요. */
  onPreview: () => void;
  /** 오른쪽 검토 패널을 접었는지(DESIGN.md 3장 '오른쪽 패널 접기') */
  panelCollapsed: boolean;
  onTogglePanel: () => void;
  layoutOpen: boolean;
  onShare: () => void;
  onSnapshots: () => void;
  onToggleLayout: () => void;
}

/**
 * 작업 공간 상단 바(WS-10). 권한이 없는 버튼은 숨긴다(D-15).
 * 검토본(목록은 모두)과 조판 설정(작가는 값만 봄)은 세 역할 모두에게 보인다. 초대(L-07)는 편집자만.
 */
export function TopBar(props: Props) {
  const { role, bookTitle, onRename, chapterTitle, participants, currentId, present, chapterTitles, onJump, chapterSlotRef, saveSlotRef, previewHref, onPreview, panelCollapsed, onTogglePanel, layoutOpen, onShare, onSnapshots, onToggleLayout } = props;
  return (
    <header className={styles.bar}>
      {/* 로고를 누르면 편집자 홈으로(11.22). 편집자 홈은 편집자만 있어서(D-15) 다른 역할에는 링크가 아니에요. */}
      {can(role, "open_editor_home") ? (
        <Link className={styles.logo} href="/home" aria-label="BOOKTELIER 홈으로" data-testid="logo-home">
          <Logo />
        </Link>
      ) : (
        <span className={styles.logo}>
          <Logo />
        </span>
      )}
      <nav className={styles.path} aria-label="경로">
        {can(role, "open_editor_home") && (
          <>
            <Link href="/home">편집자 홈</Link>
            <span aria-hidden="true">›</span>
          </>
        )}
        <BookTitle key={bookTitle} title={bookTitle} onRename={can(role, "rename_project") ? onRename : undefined} />
        <span aria-hidden="true">›</span>
        <span>{chapterTitle}</span>
      </nav>
      <span className={styles.badge} data-role={role} data-testid="role-badge">
        {ROLE_LABEL[role]}
      </span>
      <div className={styles.chapterSlot} ref={chapterSlotRef} />
      <div className={styles.tools}>
        <Participants participants={participants} currentId={currentId} present={present} chapterTitles={chapterTitles} onJump={onJump} />
        <div className={styles.saveSlot} ref={saveSlotRef} />
        <Link
          className={styles.button}
          href={previewHref}
          data-testid="preview-link"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // 새 탭·새 창은 주소로
            e.preventDefault();
            onPreview();
          }}
        >
          미리보기
        </Link>
        {can(role, "view_snapshots") && (
          <button type="button" className={styles.button} onClick={onSnapshots}>
            검토본
          </button>
        )}
        <button type="button" className={styles.button} aria-pressed={layoutOpen} onClick={onToggleLayout}>
          조판 설정
        </button>
        {can(role, "share_role_links") && (
          <button type="button" className={styles.button} onClick={onShare}>
            초대
          </button>
        )}
        <ThemeToggle />
        {/* 검토 패널을 접으면 지면이 넓어져요. 접어도 보던 탭과 거르기는 남아요. */}
        <button
          type="button"
          className={styles.button}
          aria-pressed={panelCollapsed}
          data-testid="panel-toggle"
          onClick={onTogglePanel}
        >
          {panelCollapsed ? "검토 패널 펴기" : "검토 패널 접기"}
        </button>
      </div>
    </header>
  );
}
