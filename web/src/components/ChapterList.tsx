"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CHAPTER_STATUS_LABEL } from "@/domain/labels";
import type { Chapter } from "@/types";
import styles from "./ChapterList.module.css";
import { Icon } from "./Icon";
import { StatusBadge } from "./StatusBadge";

interface Props {
  projectId: string;
  chapters: Pick<Chapter, "id" | "title" | "status">[];
  currentId: string;
  /** 장 추가(FR-15). 편집자·작가만 받는다(Q-20). 없으면 버튼을 숨긴다(D-15). */
  onAdd?: (title: string) => Promise<void>;
  /** 장 탭 줄의 + 를 누를 때마다 늘어요. 늘면 장 추가 칸을 열어요. */
  addRequest?: number;
  /** 시안 REVIEW 묶음: 의견과 제안(함께 봄 탭), 원고 표기 기준(표기 원칙 탭) */
  sharedCount?: number;
  onOpenShared?: () => void;
  onOpenRules?: () => void;
  /** 원고 구조 접기(시안 .sidebar-heading 오른쪽 단추) */
  onCollapse?: () => void;
  /** 저장 자리 안내(시안 .local-storage-label) */
  storageLabel: string;
}

/**
 * 원고 구조(WS-20, 시안 11.22 .sidebar). 장 제목과 장 상태, 지금 보는 장 표시(FR-11, FR-12), 장 추가(FR-15).
 * 시안의 원고 찾기는 장 제목 거르기로, REVIEW 묶음은 검토 패널의 탭 열기로 이어요. '자료' 탭은 시안 모양만 있어요.
 */
export function ChapterList({ projectId, chapters, currentId, onAdd, addRequest = 0, sharedCount = 0, onOpenShared, onOpenRules, onCollapse, storageLabel }: Props) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"manuscript" | "material">("manuscript");
  const seenRequest = useRef(addRequest);

  // 장 탭 줄의 + 로 장 추가 칸을 연다
  useEffect(() => {
    if (addRequest === seenRequest.current) return;
    seenRequest.current = addRequest;
    if (!onAdd) return;
    const id = window.setTimeout(() => {
      setTab("manuscript");
      setAdding(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [addRequest, onAdd]);

  async function submit() {
    const name = title.trim();
    if (!name || !onAdd || busy) return;
    setBusy(true);
    try {
      await onAdd(name);
      setTitle("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }
  const q = query.trim();
  const shown = q ? chapters.filter((c) => c.title.includes(q)) : chapters;
  return (
    <nav className={styles.panel} aria-label="원고 구조">
      <div className={styles.heading}>
        <span className={styles.avatar} aria-hidden="true">
          B
        </span>
        <span>내 책 작업실</span>
        {onCollapse && (
          <button type="button" className={styles.iconButton} onClick={onCollapse} aria-label="원고 구조 접기" title="원고 구조 접기">
            <Icon name="left" />
          </button>
        )}
      </div>
      <label className={styles.search}>
        <Icon name="search" size="sm" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="원고 찾기" aria-label="장 제목 찾기" />
        <kbd aria-hidden="true">⌕</kbd>
      </label>
      <div className={styles.stage}>
        <div className={styles.tabs} role="tablist" aria-label="원고와 자료">
          <button type="button" role="tab" aria-selected={tab === "manuscript"} className={styles.tab} onClick={() => setTab("manuscript")}>
            원고
          </button>
          <button type="button" role="tab" aria-selected={tab === "material"} className={styles.tab} onClick={() => setTab("material")}>
            자료
          </button>
        </div>
        {tab === "material" ? (
          <p className={styles.note}>참고 자료와 메모는 다음 판에서 열려요. 지금은 원고 탭에서 장을 골라 주세요.</p>
        ) : (
          <>
            <div className={styles.sectionLabel}>
              <span>CHAPTERS</span>
              {onAdd && (
                <button type="button" className={styles.smallIcon} onClick={() => setAdding(true)} aria-label="장 추가" title="장 추가">
                  <Icon name="plus" />
                </button>
              )}
            </div>
            <ul className={styles.list}>
              {shown.map((c) => (
                <li key={c.id}>
                  <Link href={`/p/${projectId}/c/${c.id}`} className={styles.item} aria-current={c.id === currentId ? "page" : undefined} title={`${c.title} · ${CHAPTER_STATUS_LABEL[c.status]}`}>
                    <Icon name="doc" size="sm" />
                    <span className={styles.title}>{c.title}</span>
                    <span className={styles.status}>
                      <StatusBadge status={c.status} testId="chapter-status" />
                    </span>
                  </Link>
                </li>
              ))}
              {q && shown.length === 0 && <li className={styles.note}>‘{q}’이 들어간 장이 없어요.</li>}
            </ul>
            {onAdd &&
              (adding ? (
                <form
                  className={styles.form}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="장 제목" aria-label="새 장 제목" maxLength={100} autoFocus />
                  <span className={styles.formButtons}>
                    <button type="button" onClick={() => setAdding(false)}>
                      닫기
                    </button>
                    <button type="submit" disabled={!title.trim() || busy}>
                      추가
                    </button>
                  </span>
                </form>
              ) : (
                <button type="button" className={styles.add} onClick={() => setAdding(true)}>
                  <Icon name="plus" size="xs" />새 장
                </button>
              ))}
            <div className={styles.divider} />
            <div className={styles.sectionLabel}>
              <span>REVIEW</span>
            </div>
            <button type="button" className={styles.navItem} onClick={onOpenShared}>
              <Icon name="comment" size="sm" />
              <span>의견과 제안</span>
              <span className={styles.count}>{sharedCount}</span>
            </button>
            <button type="button" className={styles.navItem} onClick={onOpenRules}>
              <Icon name="check" size="sm" />
              <span>원고 표기 기준</span>
            </button>
          </>
        )}
      </div>
      <div className={styles.footer}>
        <a className={styles.navItem} href="https://github.com/heo-aio/booktelier#readme" target="_blank" rel="noreferrer">
          <Icon name="info" size="sm" />
          <span>워크스페이스 가이드</span>
        </a>
        <p className={styles.storage}>
          <i aria-hidden="true" />
          {storageLabel}
        </p>
      </div>
    </nav>
  );
}
