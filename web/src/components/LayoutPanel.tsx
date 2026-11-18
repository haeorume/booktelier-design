"use client";

import { useState } from "react";
import { changeTemplate, changeValue, LINE_HEIGHT, MARGIN, trimLabel, TRIM_OPTIONS, type LayoutChange } from "@/domain/layout";
import { ROLE_LABEL } from "@/domain/labels";
import { can } from "@/domain/permissions";
import { TEMPLATE_ORDER, TEMPLATES } from "@/domain/templates";
import type { Layout, Participant, Project, Role, TemplateId } from "@/types";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./LayoutPanel.module.css";

interface Props {
  project: Project;
  role: Role;
  participants: Map<string, Participant>;
  /** 끄는 동안 지면에 미리 보인다. 저장은 하지 않는다. null이면 미리 보기를 거둔다. */
  onPreview: (layout: Layout | null) => void;
  /** 손을 떼거나 값을 고르면 한 번 저장한다(정할 것 15). */
  onCommit: (change: LayoutChange) => void;
  onClose: () => void;
}

function sinceLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "방금 바꿈";
  if (minutes < 60) return `${minutes}분 전에 바꿈`;
  return `${new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}에 바꿈`;
}

/**
 * 조판 설정(WS-04, FR-16). 편집자·디자이너는 템플릿·판형·여백·행간을 바꾸고, 작가는 값만 글자로 본다(D-15, 정할 것 16).
 * 템플릿을 바꾸면 확인 창 뒤 그 템플릿 기본값으로 돌아간다(④). 마지막으로 바꾼 사람과 시각이 위에 보인다(⑤).
 */
export function LayoutPanel({ project, role, participants, onPreview, onCommit, onClose }: Props) {
  const editable = can(role, "change_layout");
  const [draft, setDraft] = useState<Layout>(project.layout);
  const [synced, setSynced] = useState<Layout>(project.layout);
  const [confirming, setConfirming] = useState<TemplateId | null>(null);
  // 저장된 값이 바뀌면(내가 저장했거나 다른 역할이 바꿈) 슬라이더도 따라간다. 패널을 다시 만들지 않아 포커스가 남는다.
  if (synced !== project.layout) {
    setSynced(project.layout);
    setDraft(project.layout);
  }
  const who = project.layout_updated_by ? participants.get(project.layout_updated_by) : undefined;
  const whoName = who ? (who.role === "editor" ? ROLE_LABEL.editor : who.display_name) : null;
  const current = { template_id: project.template_id, layout: project.layout };

  function preview(field: "margin" | "line_height", value: number) {
    const next = changeValue({ template_id: project.template_id, layout: draft }, field, value).layout;
    setDraft(next);
    onPreview(next);
  }

  function commit(field: "trim" | "margin" | "line_height", value: string | number) {
    const change = changeValue(current, field, value);
    onPreview(null);
    if (change.before === change.after) return;
    onCommit(change);
  }

  return (
    <aside className={styles.panel} aria-label="조판 설정" data-testid="layout-panel">
      <div className={styles.head}>
        <h2 className={styles.title}>조판 설정</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="조판 설정 닫기">
          닫기
        </button>
      </div>
      {whoName && (
        <p className={styles.lastChange} data-testid="layout-last-change">
          {whoName} · {sinceLabel(project.layout_updated_at)}
        </p>
      )}

      {!editable ? (
        <dl className={styles.values} data-testid="layout-values">
          <dt>템플릿</dt>
          <dd>{TEMPLATES[project.template_id].label}</dd>
          <dt>판형</dt>
          <dd>{trimLabel(project.layout.trim)}</dd>
          <dt>여백</dt>
          <dd>{project.layout.margin}mm</dd>
          <dt>행간</dt>
          <dd>{project.layout.line_height}</dd>
        </dl>
      ) : (
        <div className={styles.controls}>
          <fieldset className={styles.templates}>
            <legend className={styles.label}>템플릿</legend>
            {TEMPLATE_ORDER.map((id) => (
              <label key={id} className={styles.template} data-selected={project.template_id === id}>
                <input
                  type="radio"
                  name="layout-template"
                  checked={project.template_id === id}
                  onChange={() => id !== project.template_id && setConfirming(id)}
                />
                {project.template_id === id && <span aria-hidden="true">✓ </span>}
                {TEMPLATES[id].label}
              </label>
            ))}
          </fieldset>

          <label className={styles.label}>
            판형
            <select className={styles.select} value={project.layout.trim} onChange={(e) => commit("trim", e.target.value)}>
              {TRIM_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {trimLabel(t)}
                </option>
              ))}
            </select>
          </label>

          <Slider
            label="여백"
            unit="mm"
            range={MARGIN}
            value={draft.margin}
            onInput={(v) => preview("margin", v)}
            onCommit={(v) => commit("margin", v)}
          />
          <Slider
            label="행간"
            unit=""
            range={LINE_HEIGHT}
            value={draft.line_height}
            onInput={(v) => preview("line_height", v)}
            onCommit={(v) => commit("line_height", v)}
          />
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="템플릿 바꾸기"
          body={`조절한 값이 처음 값으로 돌아가요. ${TEMPLATES[confirming].label} 템플릿의 판형·여백·행간으로 바꿀까요?`}
          confirmLabel="바꾸기"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const change = changeTemplate(current, confirming);
            setConfirming(null);
            setDraft(change.layout);
            onCommit(change);
          }}
        />
      )}
    </aside>
  );
}

/** 슬라이더와 숫자 입력(CS-15). 끄는 동안은 미리 보기만, 손을 떼거나 숫자를 다 넣으면 한 번 저장한다. */
function Slider({
  label,
  unit,
  range,
  value,
  onInput,
  onCommit,
}: {
  label: string;
  unit: string;
  range: { min: number; max: number; step: number };
  value: number;
  onInput: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const hint = `${range.min}~${range.max}${unit}`;
  return (
    <div className={styles.slider}>
      <label className={styles.label} htmlFor={`range-${label}`}>
        {label}
        <span className={styles.hint}>{hint}</span>
      </label>
      <div className={styles.sliderRow}>
        <input
          id={`range-${label}`}
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          aria-label={label}
          onChange={(e) => onInput(Number(e.target.value))}
          // 손을 뗄 때 한 번 저장한다(정할 것 15). 방향키뿐 아니라 Home·End·PageUp·PageDown도 값을 바꾸므로
          // 어떤 키든 뗄 때 저장하고, 포커스가 빠져나갈 때도 저장한다. 값이 그대로면 저장하지 않는다.
          onPointerUp={(e) => onCommit(Number(e.currentTarget.value))}
          onKeyUp={(e) => onCommit(Number(e.currentTarget.value))}
          onBlur={(e) => onCommit(Number(e.currentTarget.value))}
        />
        <input
          type="number"
          className={styles.number}
          min={range.min}
          max={range.max}
          step={range.step}
          value={typed ?? String(value)}
          aria-label={`${label} 숫자`}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={() => {
            if (typed === null) return;
            setTyped(null);
            onCommit(Number(typed));
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
    </div>
  );
}
