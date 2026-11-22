"use client";

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { Icon } from "@/components/Icon";
import { can } from "@/domain/permissions";
import { KIND_LABEL, KIND_ORDER, ROLE_LABEL } from "@/domain/labels";
import type { LiveCheckStatus } from "@/workspace/live-check";
import type { AiSuggestion, AiSuggestionKind, Role } from "@/types";
import { AiSuggestionCard } from "./AiSuggestionCard";
import { ModeSwitch } from "./ModeSwitch";
import styles from "./ReviewPanel.module.css";

type Tab = "ai" | "shared" | "rules";

export interface ReviewPanelHandle {
  /** 밑줄을 눌렀을 때: AI 제안 탭을 열고, 그 카드를 가리는 거르기를 풀어 카드가 보이게 한다(N-07). */
  reveal(suggestionIds: string[]): void;
  /** 수정 제안 표시나 의견 자리를 눌렀을 때: 함께 봄 탭을 연다. */
  revealShared(): void;
  /** 원고 구조의 '원고 표기 기준'이나 메뉴에서: 표기 원칙 탭을 열고 목록을 다시 읽는다. */
  revealRules(): void;
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
  /** 장 이름 줄에 보일 지금 장 제목(없으면 '지금 장') */
  chapterTitle?: string;
  /** 위 스위치의 '조판 설정'. 없으면 스위치가 눌리지 않아요. */
  onOpenLayout?: () => void;
  /** 머리의 닫기(검토 패널 접기). 없으면 눌리지 않아요. */
  onClose?: () => void;
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

/** 상태 줄의 평소 안내(시안 br-status idle 문구). 디자이너에게는 AI 제안 탭이 없어요. */
const IDLE_HINT: Record<Role, string> = {
  editor: "편집자 · 원고와 조판을 함께 검토할 수 있어요.",
  author: "작가 · 내 원고와 전달받은 수정 제안을 확인하세요.",
  designer: "디자이너 · 조판 점검 결과는 나만 볼 수 있어요.",
};

/**
 * 검토 패널(WS-40). 오름님 시안의 오른쪽 독(#be-review-panel)과 같은 모양이에요.
 * 위: 검토 패널/조판 설정 스위치 → 탭(내 AI 제안 · 함께 봄 · AI 대화) → 북틀리에 머리 → 장 이름 줄(표기 원칙).
 * '내 AI 제안'은 나만 보이고, 탭 이름 옆에 처리하지 않은 개수(CS-07). 디자이너에게는 AI 제안 탭이 없다(FR-42 ②).
 */
export function ReviewPanel({ ref, ...p }: Props) {
  const showAi = can(p.role, "view_ai_suggestions");
  const [tab, setTab] = useState<Tab>(showAi ? "ai" : "shared");
  const [kind, setKind] = useState<AiSuggestionKind | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const current: Tab = showAi || tab !== "ai" ? tab : "shared";

  const counts = Object.fromEntries(KIND_ORDER.map((k) => [k, p.suggestions.filter((s) => s.kind === k).length])) as Record<AiSuggestionKind, number>;
  const visible = kind ? p.suggestions.filter((s) => s.kind === kind) : p.suggestions;

  const { onOpenRules } = p;
  const openRules = () => {
    setTab("rules");
    onOpenRules();
  };

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
      revealRules() {
        setTab("rules");
        onOpenRules();
      },
    }),
    [showAi, kind, p.suggestions, onOpenRules],
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
  const analyzing = p.status === "analyzing" || running;
  const failed = (p.status === "failed" || p.review.kind === "failed") && !running;
  const statusState = analyzing ? "running" : failed ? "error" : p.review.kind === "done" ? "done" : "idle";

  return (
    <aside className={styles.panel} aria-label="검토 패널">
      <ModeSwitch current="review" onLayout={p.onOpenLayout} />

      <div className={styles.tabs} role="tablist" aria-label="검토 탭" aria-owns="review-tab-rules">
        {showAi && (
          <button type="button" role="tab" aria-selected={current === "ai"} className={styles.tab} onClick={() => setTab("ai")}>
            내 AI 제안 <span className={styles.count}>{p.suggestions.length}</span>
          </button>
        )}
        <button type="button" role="tab" aria-selected={current === "shared"} className={styles.tab} onClick={() => setTab("shared")}>
          함께 봄 <span className={styles.count}>{p.sharedCount}</span>
        </button>
        {/* AI 대화는 시안에만 있는 기능이에요. 자리만 보여요. */}
        <button type="button" role="tab" aria-selected={false} className={styles.tab} disabled title="AI 대화는 준비 중이에요">
          AI 대화
        </button>
      </div>

      <header className={styles.header}>
        <div className={styles.brand}>
          <Icon name="spark" className={styles.brandIcon} />
          <div>
            북틀리에
            <small>한 문장부터, 한 권까지</small>
          </div>
        </div>
        <button type="button" className={styles.iconButton} aria-label="북틀리에 닫기" title="북틀리에 닫기" disabled={!p.onClose} onClick={p.onClose}>
          <Icon name="close" size="sm" />
        </button>
      </header>

      <div className={styles.context}>
        <Icon name="doc" size="sm" />
        <span className={styles.chapterLabel}>{p.chapterTitle ?? "지금 장"}</span>
        {/* 표기 원칙은 시안처럼 장 이름 줄에 둬요. 위 탭 목록(aria-owns)에 속한 탭이에요. */}
        <button
          type="button"
          id="review-tab-rules"
          role="tab"
          aria-selected={current === "rules"}
          className={styles.rulesTab}
          title="이 책의 표기 원칙"
          onClick={openRules}
        >
          표기 원칙 <span className={styles.rulesCount}>{p.rulesCount}</span>
        </button>
      </div>

      {current === "ai" ? (
        <div className={styles.pane} role="tabpanel" aria-label="내 AI 제안">
          <div className={styles.runbar}>
            {can(p.role, "run_chapter_review") && (
              // 장 검토는 편집자가 눌러야만 돈다(D-18, FR-13 ③). 도는 동안 다시 누를 수 없다(FR-21 ①).
              <button type="button" className={styles.runButton} disabled={running} onClick={p.onRunReview}>
                <Icon name="spark" size="sm" />
                장 검토
              </button>
            )}
            {/* 실시간 분석은 늘 켜져 있어요(작가가 고치고 멈추면 돌아요). 시안 모양만 보여요. */}
            <label className={styles.liveLabel} title="실시간 분석은 늘 켜져 있어요">
              <input type="checkbox" checked readOnly />
              실시간 분석
            </label>
          </div>
          <div className={styles.status} data-state={statusState} data-testid="ai-status" aria-live="polite">
            {analyzing ? (
              <span>분석 중</span>
            ) : failed ? (
              <>
                <span>분석 실패</span>
                <button type="button" className={styles.linkButton} onClick={p.review.kind === "failed" ? p.onRunReview : p.onRetry}>
                  다시 시도
                </button>
              </>
            ) : p.review.kind === "done" ? (
              <span>
                장 검토 완료
                {p.review.total > 0 && " · "}
                <span data-testid="review-summary">
                  {KIND_ORDER.filter((k) => p.review.kind === "done" && p.review.summary[k] > 0)
                    .map((k) => `${KIND_LABEL[k]} ${p.review.kind === "done" ? p.review.summary[k] : 0}`)
                    .join(" · ")}
                </span>
              </span>
            ) : (
              <span>{IDLE_HINT[p.role]}</span>
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
          <div className={styles.autoControls}>
            {/* 지면의 밑줄 표시. 늘 켜져 있어요. */}
            <label title="지면에 AI 제안 밑줄이 늘 보여요">
              <input type="checkbox" checked readOnly />
              본문 자동 제안
            </label>
            <span className={styles.humanKey}>사람 제안</span>
          </div>
          <div className={styles.chips} role="group" aria-label="종류 거르기">
            <button type="button" className={styles.chip} data-kind="all" aria-pressed={kind === null} onClick={() => setKind(null)}>
              전체 <span className={styles.chipCount}>{p.suggestions.length}</span>
            </button>
            {KIND_ORDER.map((k) => (
              <button key={k} type="button" className={styles.chip} data-kind={k} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
                {KIND_LABEL[k]} <span className={styles.chipCount}>{counts[k]}</span>
              </button>
            ))}
          </div>
          <div className={styles.privateMeta}>
            <span className={styles.privateDot}>나만 보임</span>
            <span>{ROLE_LABEL[p.role]}</span>
          </div>
          <div className={styles.list} ref={list}>
            {visible.length === 0 ? (
              <div className={styles.empty}>
                <Icon name="check" className={styles.emptyIcon} />
                <strong>
                  {p.review.kind === "done" && p.review.total === 0
                    ? "발견된 항목이 없어요."
                    : p.suggestions.length > 0
                      ? "이 종류에 새 제안이 없어요"
                      : "현재 확인할 제안이 없어요"}
                </strong>
                <p>
                  {p.role === "author"
                    ? "원고를 고치고 잠시 멈추면 AI 제안이 여기에 떠요."
                    : can(p.role, "run_chapter_review")
                      ? "장 검토를 누르면 이 장의 AI 제안이 여기에 떠요."
                      : "아직 AI 제안이 없어요."}
                  <br />
                  최종 판단은 원고의 의도와 함께 확인하세요.
                </p>
              </div>
            ) : (
              <ul className={styles.cards}>{visible.map(card)}</ul>
            )}
            {p.sent.length > 0 && (
              <>
                <p className={styles.sectionTitle}>보낸 제안 {p.sent.length}</p>
                <ul className={styles.cards}>{p.sent.map(card)}</ul>
              </>
            )}
          </div>
        </div>
      ) : current === "rules" ? (
        <div className={styles.pane} role="tabpanel" aria-label="표기 원칙">
          <div className={styles.list}>{p.rules}</div>
        </div>
      ) : (
        <div className={styles.pane} role="tabpanel" aria-label="함께 봄">
          <div className={styles.list} ref={list}>
            {p.shared}
          </div>
        </div>
      )}
    </aside>
  );
}
