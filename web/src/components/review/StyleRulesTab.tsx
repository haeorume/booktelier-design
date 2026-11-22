"use client";

import { useState } from "react";
import { ROLE_LABEL } from "@/domain/labels";
import type { Participant, StyleRule, StyleRuleType } from "@/types";
import styles from "./StyleRulesTab.module.css";

interface Props {
  rules: StyleRule[];
  failed: boolean;
  participants: Map<string, Participant>;
  onAdd: (type: StyleRuleType, text: string) => Promise<void>;
}

const SECTIONS: { type: StyleRuleType; title: string; hint: string; empty: string }[] = [
  { type: "rule", title: "통일 규칙", hint: "이 책에서는 이렇게 써요. AI가 따라요.", empty: "아직 통일 규칙이 없어요." },
  {
    type: "keep",
    title: "유지 표현",
    hint: "일부러 그대로 두는 표현이에요. AI가 다시 고치자고 하지 않아요.",
    empty: "AI 카드에서 '이 표현 유지'를 누르면 여기에 쌓여요.",
  },
];

/**
 * 표기 원칙 탭(WS-51, FR-31). 통일 규칙과 유지 표현을 보고, 누구나 한 줄씩 더해요(A-28).
 * 고치기·지우기(편집자)는 이번 범위가 아니에요(D-40).
 */
export function StyleRulesTab({ rules, failed, participants, onAdd }: Props) {
  const [type, setType] = useState<StyleRuleType>("rule");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  const who = (r: StyleRule) => {
    const p = participants.get(r.created_by);
    return p ? `${p.display_name} · ${ROLE_LABEL[p.role]}` : null;
  };

  return (
    <div className={styles.wrap} data-testid="style-rules">
      <p className={styles.lead}>이 책에서 함께 지키는 표기 약속이에요. 다음 AI 제안부터 반영돼요.</p>
      {failed && (
        <p className={styles.error} role="status">
          표기 원칙을 불러오지 못했어요.
        </p>
      )}
      {SECTIONS.map((s) => {
        const list = rules.filter((r) => r.type === s.type);
        return (
          <section key={s.type} className={styles.section} aria-label={s.title}>
            <h3 className={styles.title}>
              {s.title} <span className={styles.count}>{list.length}</span>
            </h3>
            <p className={styles.hint}>{s.hint}</p>
            {list.length === 0 ? (
              <p className={styles.empty}>{s.empty}</p>
            ) : (
              <ul className={styles.list}>
                {list.map((r) => (
                  <li key={r.id} className={styles.item} data-testid={`style-rule-${s.type}`}>
                    <span className={styles.text}>{r.text}</span>
                    {who(r) && <span className={styles.meta}>{who(r)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!trimmed || busy) return;
          setBusy(true);
          setError(null);
          try {
            await onAdd(type, trimmed);
            setText("");
          } catch {
            setError("더하지 못했어요. 잠시 뒤 다시 해 주세요.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className={styles.formTitle}>원칙 더하기</p>
        <div className={styles.types} role="radiogroup" aria-label="종류">
          {SECTIONS.map((s) => (
            <label key={s.type} className={styles.type}>
              <input type="radio" name="style-rule-type" checked={type === s.type} onChange={() => setType(s.type)} />
              {s.title}
            </label>
          ))}
        </div>
        <label className={styles.label}>
          내용
          <input
            className={styles.input}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder={type === "rule" ? "예: 숫자는 아라비아 숫자로 쓴다" : "예: 루브르"}
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={styles.add} disabled={!trimmed || busy}>
          더하기
        </button>
      </form>
    </div>
  );
}
