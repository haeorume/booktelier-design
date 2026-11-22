"use client";

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { can } from "@/domain/permissions";
import { KIND_LABEL, KIND_ORDER } from "@/domain/labels";
import type { LiveCheckStatus } from "@/workspace/live-check";
import type { AiSuggestion, AiSuggestionKind, Role } from "@/types";
import { AiSuggestionCard } from "./AiSuggestionCard";
import styles from "./ReviewPanel.module.css";

type Tab = "ai" | "shared" | "rules";

export interface ReviewPanelHandle {
  /** 밑줄을 눌렀을 때: AI 제안 탭을 열고, 그 카드를 가리는 거르기를 풀어 카드가 보이게 한다(N-07). */
  reveal(suggestionIds: string[]): void;
  /** 수정 제안 표시나 의견 자리를 눌렀을 때: 함께 봄 탭을 연다. */
  revealShared(): void;
}

export type ChapterReviewState = { kind: "idle" } | { kind: "running" } | { kind: "failed" } | { kind: "done"; summary: Record<AiSuggestionKind, number>; total: number };

interface Props {
  ref?: Ref<ReviewPanelHandle>;
  role: Role;
  /** 원고 순서로 늘어선 내 대기 제안 */
  suggestions: AiSuggestion[];
  /** 내가 보낸 제안(보냄·반영됨). 편집자 화면에 남는다(FR-29 ③) */
  sent: AiSuggestion[];
  selected: string[];
  status: LiveCheckStatus;
  review: ChapterReviewState;
  notice: string | null;
  canUndo: boolean;
  busy: boolean;
  /** 함께 봄 탭 내용과 처리하지 않은 개수 */
  shared: ReactNode;
  sharedCount: number;
  /** 표기 원칙 탭 내용과 원칙 수(WS-51) */
  rules: ReactNode;
  rulesCount: number;
  /** 표기 원칙 탭을 열 때(목록을 다시 읽어요) */
  onOpenRules: () => void;
  onRunReview: () => void;
  onRetry: () => void;
  onUndo: () => void;
  onSelect: (ids: string[]) => void;
  onApply: (s: AiSuggestion, text: string, choice: number) => void;
  onDismiss: (s: AiSuggestion) => void;
  onKeep: (s: AiSuggestion) => void;
  onSend: (s: AiSuggestion) => void;
}

/**
 * 검토 패널(WS-40). '내 AI 제안'(나만 보임)과 '함께 봄' 탭. 탭 이름 옆에 처리하지 않은 개수(CS-07).
 * 디자이너에게는 AI 제안 탭이 없다(FR-42 ②).
 */
export function ReviewPanel({ ref, ...p }: Props) {
  const showAi = can(p.role, "view_ai_suggestions");
  const [tab, setTab] = useState<Tab>(showAi ? "ai" : "shared");
  const [kind, setKind] = useState<AiSuggestionKind | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const current: Tab = showAi || tab !== "ai" ? tab : "shared";

  const counts = Object.fromEntries(KIND_ORDER.map((k) => [k, p.suggestions.filter((s) => s.kind === k).length])) as Record<AiSuggestionKind, number>;
  const visible = kind ? p.suggestions.filter((s) => s.kind === kind) : p.suggestions;

  useImperativeHandle(
    ref,
    () => ({
      reveal(ids) {
        if (!showAi) return;
        setTab("ai");
        const targets = p.suggestions.filter((s) => ids.includes(s.id));
        if (kind && !targets.some((s) => s.kind === kind)) setKind(null);
      },
      revealShared() {
        setTab("shared");
      },
    }),
    [showAi, kind, p.suggestions],
  );

  // 밑줄이나 지면 표시를 누르면 그 카드가 보이게 한다.
  useEffect(() => {
    const first = p.selected[0];
    if (!first) return;
    list.current
      ?.querySelector(`[data-suggestion-id="${CSS.escape(first)}"], [data-card-id="${CSS.escape(first)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [p.selected]);

  const card = (s: AiSuggestion) => (
    <AiSuggestionCard
      key={s.id}
      suggestion={s}
      role={p.role}
      selected={p.selected.includes(s.id)}
      busy={p.busy}
      onSelect={() => p.onSelect([s.id])}
      onApply={(text, choice) => p.onApply(s, text, choice)}
      onDismiss={() => p.onDismiss(s)}
      onKeep={() => p.onKeep(s)}
      onSend={() => p.onSend(s)}
    />
  );

  const running = p.review.kind === "running";

  return (
    <aside className={styles.panel} aria-label="검토 패널">
      <div className={styles.tabs} role="tablist">
        {showAi && (
          <button type="button" role="tab" aria-selected={current === "ai"} className={styles.tab} onClick={() => setTab("ai")}>
            내 AI 제안 <span className={styles.count}>{p.suggestions.length}</span>
          </button>
        )}
        <button type="button" role="tab" aria-selected={current === "shared"} className={styles.tab} onClick={() => setTab("shared")}>
          함께 봄 <span className={styles.count}>{p.sharedCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={current === "rules"}
          className={styles.tab}
          onClick={() => {
            setTab("rules");
            p.onOpenRules();
          }}
        >
          표기 원칙 <span className={styles.count}>{p.rulesCount}</span>
        </button>
      </div>

      {current === "ai" ? (
        <div className={styles.body} role="tabpanel" aria-label="내 AI 제안" ref={list}>
          <p className={styles.private}>나만 보임</p>
          {can(p.role, "run_chapter_review") && (
            <div className={styles.reviewRun}>
              {/* 장 검토는 편집자가 눌러야만 돈다(D-18, FR-13 ③). 도는 동안 다시 누를 수 없다(FR-21 ①). */}
              <button type="button" className={styles.primaryButton} disabled={running} onClick={p.onRunReview}>
                장 검토
              </button>
              {p.review.kind === "done" && (
                <span className={styles.summary} data-testid="review-summary">
                  {KIND_ORDER.filter((k) => p.review.kind === "done" && p.review.summary[k] > 0)
                    .map((k) => `${KIND_LABEL[k]} ${p.review.kind === "done" ? p.review.summary[k] : 0}`)
                    .join(" · ")}
                </span>
              )}
            </div>
          )}
          <div className={styles.status} data-testid="ai-status" aria-live="polite">
            {(p.status === "analyzing" || running) && <span>분석 중</span>}
            {(p.status === "failed" || p.review.kind === "failed") && !running && (
              <>
                <span>분석 실패</span>
                <button type="button" className={styles.linkButton} onClick={p.review.kind === "failed" ? p.onRunReview : p.onRetry}>
                  다시 시도
                </button>
              </>
            )}
          </div>
          {p.notice && (
            <p className={styles.notice} role="status" data-testid="ai-notice">
              {p.notice}
            </p>
          )}
          {p.canUndo && (
            <div className={styles.undo}>
              <span>적용했어요.</span>
              <button type="button" className={styles.linkButton} onClick={p.onUndo}>
                실행 취소
              </button>
            </div>
          )}
          {p.suggestions.length > 0 && (
            <div className={styles.chips} role="group" aria-label="종류 거르기">
              <button type="button" className={styles.chip} aria-pressed={kind === null} onClick={() => setKind(null)}>
                전체 {p.suggestions.length}
              </button>
              {KIND_ORDER.filter((k) => counts[k] > 0).map((k) => (
                <button key={k} type="button" className={styles.chip} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
                  {KIND_LABEL[k]} {counts[k]}
                </button>
              ))}
            </div>
          )}
          {visible.length === 0 ? (
            <p className={styles.empty}>
              {p.review.kind === "done" && p.review.total === 0
                ? "발견된 항목이 없어요."
                : p.role === "author"
                  ? "원고를 고치고 잠시 멈추면 AI 제안이 여기에 떠요."
                  : can(p.role, "run_chapter_review")
                    ? "장 검토를 누르면 이 장의 AI 제안이 여기에 떠요."
                    : "아직 AI 제안이 없어요."}
            </p>
          ) : (
            <ul className={styles.cards}>{visible.map(card)}</ul>
          )}
          {p.sent.length > 0 && (
            <>
              <p className={styles.sectionTitle}>보낸 제안</p>
              <ul className={styles.cards}>{p.sent.map(card)}</ul>
            </>
          )}
        </div>
      ) : current === "rules" ? (
        <div className={styles.body} role="tabpanel" aria-label="표기 원칙">
          {p.rules}
        </div>
      ) : (
        <div className={styles.body} role="tabpanel" aria-label="함께 봄" ref={list}>
          {p.shared}
        </div>
      )}
    </aside>
  );
}
