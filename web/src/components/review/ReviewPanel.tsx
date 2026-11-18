"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { can } from "@/domain/permissions";
import { KIND_LABEL, KIND_ORDER } from "@/domain/labels";
import type { LiveCheckStatus } from "@/workspace/live-check";
import type { AiSuggestion, AiSuggestionKind, Role } from "@/types";
import { AiSuggestionCard } from "./AiSuggestionCard";
import styles from "./ReviewPanel.module.css";

type Tab = "ai" | "shared";

export interface ReviewPanelHandle {
  /** 밑줄을 눌렀을 때: AI 제안 탭을 열고, 그 카드를 가리는 거르기를 풀어 카드가 보이게 한다(N-07). */
  reveal(suggestionIds: string[]): void;
}

interface Props {
  ref?: Ref<ReviewPanelHandle>;
  role: Role;
  /** 원고 순서로 늘어선 내 대기 제안 */
  suggestions: AiSuggestion[];
  selected: string[];
  status: LiveCheckStatus;
  notice: string | null;
  canUndo: boolean;
  busy: boolean;
  onRetry: () => void;
  onUndo: () => void;
  onSelect: (ids: string[]) => void;
  onApply: (s: AiSuggestion, text: string, choice: number) => void;
  onDismiss: (s: AiSuggestion) => void;
  onKeep: (s: AiSuggestion) => void;
}

/**
 * 검토 패널(WS-40). '내 AI 제안'(나만 보임)과 '함께 봄' 탭.
 * 디자이너에게는 AI 제안 탭이 없다(FR-42 ②, CS-07). '함께 봄'의 의견·수정 제안은 W4에서 채운다.
 */
export function ReviewPanel({ ref, ...p }: Props) {
  const showAi = can(p.role, "view_ai_suggestions");
  const [tab, setTab] = useState<Tab>(showAi ? "ai" : "shared");
  const [kind, setKind] = useState<AiSuggestionKind | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const current: Tab = showAi ? tab : "shared";

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
    }),
    [showAi, kind, p.suggestions],
  );

  // 밑줄을 누르면 그 카드가 보이게 한다.
  useEffect(() => {
    const first = p.selected[0];
    if (!first) return;
    list.current?.querySelector(`[data-suggestion-id="${first}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [p.selected]);

  return (
    <aside className={styles.panel} aria-label="검토 패널">
      <div className={styles.tabs} role="tablist">
        {showAi && (
          <button type="button" role="tab" aria-selected={current === "ai"} className={styles.tab} onClick={() => setTab("ai")}>
            내 AI 제안 <span className={styles.count}>{p.suggestions.length}</span>
          </button>
        )}
        <button type="button" role="tab" aria-selected={current === "shared"} className={styles.tab} onClick={() => setTab("shared")}>
          함께 봄
        </button>
      </div>

      {current === "ai" ? (
        <div className={styles.body} role="tabpanel" aria-label="내 AI 제안">
          <p className={styles.private}>나만 보임</p>
          <div className={styles.status} data-testid="ai-status" aria-live="polite">
            {p.status === "analyzing" && <span>분석 중</span>}
            {p.status === "failed" && (
              <>
                <span>분석 실패</span>
                <button type="button" className={styles.linkButton} onClick={p.onRetry}>
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
            <p className={styles.empty}>{p.role === "author" ? "원고를 고치고 잠시 멈추면 AI 제안이 여기에 떠요." : "아직 AI 제안이 없어요."}</p>
          ) : (
            <ul className={styles.cards} ref={list}>
              {visible.map((s) => (
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
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className={styles.body} role="tabpanel" aria-label="함께 봄">
          <p className={styles.empty}>아직 주고받은 의견과 수정 제안이 없어요.</p>
        </div>
      )}
    </aside>
  );
}
