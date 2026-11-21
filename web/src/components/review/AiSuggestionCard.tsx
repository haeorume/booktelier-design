"use client";

import { useState } from "react";
import { can } from "@/domain/permissions";
import { AI_STATUS_LABEL, KIND_LABEL } from "@/domain/labels";
import type { AiSuggestion, Role } from "@/types";
import styles from "./ReviewPanel.module.css";

interface Props {
  suggestion: AiSuggestion;
  role: Role;
  selected: boolean;
  busy: boolean;
  onApply: (text: string, choice: number) => void;
  onDismiss: () => void;
  onKeep: () => void;
  onSend: () => void;
  onSelect: () => void;
}

const EVIDENCE_SOURCE: Record<"norm" | "chapter", string> = { norm: "", chapter: "같은 책 " };

/**
 * 근거(F6 RAG, D-26). 장 검토 카드에만 둬요. 근거가 없으면 '근거 없음'(data-contract).
 * 실시간 교정은 RAG를 쓰지 않아 늘 없으므로 줄 자체를 두지 않아요(F6 조각 3 결정).
 * 발췌는 '원문 보기'를 눌러야 펼쳐져 카드가 길어지지 않아요. 카드를 고르는 클릭과 겹치지 않게 막아요.
 */
function EvidenceLine({ suggestion: s }: { suggestion: AiSuggestion }) {
  if (s.source !== "chapter_review") return null;
  const ev = s.evidence;
  if (!ev) {
    return (
      <p className={styles.evidence} data-testid="ai-evidence" data-state="none">
        근거 없음
      </p>
    );
  }
  return (
    <details className={styles.evidence} data-testid="ai-evidence" data-state={ev.type} onClick={(e) => e.stopPropagation()}>
      <summary>
        근거 · {EVIDENCE_SOURCE[ev.type]}
        {ev.label} <span className={styles.evidenceMore}>원문 보기</span>
      </summary>
      <blockquote className={styles.evidenceExcerpt}>{ev.excerpt}</blockquote>
    </details>
  );
}

/**
 * AI 제안 카드(WS-46, FR-24). 종류, 원문, 수정안 1개와 대안 최대 2개, 수정 이유.
 * 버튼은 역할에 맞는 것만 보인다(D-15): 적용은 작가만, 보내기는 편집자만(FR-29 ④), 무시와 이 표현 유지는 작가·편집자.
 * 보낸 제안은 '보냄'(받은 사람이 수락하면 '반영됨')으로 남고 버튼이 없다(FR-29 ③).
 */
export function AiSuggestionCard({ suggestion: s, role, selected, busy, onApply, onDismiss, onKeep, onSend, onSelect }: Props) {
  const options = [s.replacement, ...s.alternatives];
  const [choice, setChoice] = useState(0);
  const pending = s.status === "pending";
  const canApply = pending && can(role, "apply_ai_suggestion");

  return (
    <li
      className={`${styles.card} ${pending ? "" : styles.decided}`}
      data-testid="ai-card"
      data-suggestion-id={s.id}
      data-kind={s.kind}
      data-status={s.status}
      aria-current={selected ? "true" : undefined}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        // 카드에 포커스를 두고 Enter면 고른다(G-03). 카드 안 버튼의 Enter는 그 버튼이 처리한다.
        if (e.key === "Enter" && e.target === e.currentTarget) onSelect();
      }}
    >
      <div className={styles.cardHead}>
        <span className={`${styles.kind} ${styles[`kind_${s.kind}`]}`}>{KIND_LABEL[s.kind]}</span>
        {!pending && (
          <span className={styles.statusChip} data-testid="ai-status-chip">
            {AI_STATUS_LABEL[s.status]}
          </span>
        )}
      </div>
      <p className={styles.original}>
        <del>{s.original}</del>
      </p>
      {canApply && options.length > 1 ? (
        <fieldset className={styles.options}>
          <legend className={styles.srOnly}>바꿀 말</legend>
          {options.map((text, i) => (
            <label key={i} className={styles.option}>
              <input type="radio" name={`opt-${s.id}`} checked={choice === i} onChange={() => setChoice(i)} />
              <span className={styles.replacement}>{text}</span>
              {i > 0 && <span className={styles.altTag}>대안</span>}
            </label>
          ))}
        </fieldset>
      ) : (
        <ul className={styles.plainOptions}>
          {options.map((text, i) => (
            <li key={i}>
              <span className={styles.replacement}>{text}</span>
              {i > 0 && <span className={styles.altTag}>대안</span>}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.reason}>{s.reason}</p>
      <EvidenceLine suggestion={s} />
      {pending && (
        <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
          {canApply && (
            <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => onApply(options[choice], choice)}>
              적용
            </button>
          )}
          {can(role, "send_ai_suggestion") && (
            <button type="button" className={styles.primaryButton} disabled={busy} onClick={onSend}>
              보내기
            </button>
          )}
          {can(role, "dismiss_ai_suggestion") && (
            <button type="button" className={styles.button} disabled={busy} onClick={onDismiss}>
              무시
            </button>
          )}
          {can(role, "keep_ai_suggestion") && (
            <button type="button" className={styles.button} disabled={busy} onClick={onKeep}>
              이 표현 유지
            </button>
          )}
        </div>
      )}
    </li>
  );
}
