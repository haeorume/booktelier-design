"use client";

import { useState } from "react";
import {
  changeTemplate,
  changeValue,
  FONT_OPTIONS,
  fontLabel,
  HEADER_OPTIONS,
  PAGE_NUMBER_OPTIONS,
  PAGE_SIDES,
  pageSide,
  LAYOUT_FIELD_LABEL,
  NUMBER_RANGE,
  numberValue,
  trimLabel,
  TRIM_OPTIONS,
  type LayoutChange,
  type NumberField,
  type PageSideName,
  type RunningField,
} from "@/domain/layout";
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
 * 조판 설정(WS-04, FR-16, FR-45). 편집자·디자이너는 템플릿·판형·여백 4개·제본 여백·행간·본문 글꼴·크기를 바꾸고, 작가는 값만 글자로 본다(D-15, 정할 것 16).
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

  function preview(field: NumberField, value: number) {
    const next = changeValue({ template_id: project.template_id, layout: draft }, field, value).layout;
    setDraft(next);
    onPreview(next);
  }

  function commit(field: "trim" | "font_family" | NumberField | RunningField, value: string | number) {
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
          <dd>
            위 {project.layout.margin.top} · 아래 {project.layout.margin.bottom} · 안쪽 {project.layout.margin.inner} · 바깥쪽 {project.layout.margin.outer}mm
          </dd>
          <dt>제본 여백</dt>
          <dd>{project.layout.binding}mm</dd>
          <dt>행간</dt>
          <dd>{project.layout.line_height}</dd>
          <dt>본문</dt>
          <dd>
            {fontLabel(project.layout.font_family)} {project.layout.font_size}pt
          </dd>
          {PAGE_SIDES.map((side) => (
            <RunningValue key={side} side={side} layout={project.layout} />
          ))}
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

          <label className={styles.label}>
            본문 글꼴
            <select className={styles.select} value={project.layout.font_family} onChange={(e) => commit("font_family", e.target.value)}>
              {FONT_OPTIONS.map((f) => (
                <option key={f.family} value={f.family}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {SLIDERS.map(([field, unit]) => (
            <Slider
              key={field}
              label={LAYOUT_FIELD_LABEL[field]}
              unit={unit}
              range={NUMBER_RANGE[field]}
              value={numberValue(draft, field)}
              onInput={(v) => preview(field, v)}
              onCommit={(v) => commit(field, v)}
            />
          ))}

          {/* 쪽 공통 설정(FR-44): 왼쪽·오른쪽 쪽을 따로 정해요(②). 작업 지면과 미리보기의 모든 쪽에 반영돼요(①). */}
          <fieldset className={styles.running} data-testid="running-settings">
            <legend className={styles.label}>쪽 공통 설정</legend>
            {PAGE_SIDES.map((side) => {
              const v = pageSide(project.layout, side);
              return (
                <div key={side} className={styles.runningSide}>
                  <span className={styles.sideName}>{SIDE_LABEL[side]}</span>
                  <label className={styles.inline}>
                    쪽 번호
                    <select
                      className={styles.select}
                      value={v.page_number}
                      aria-label={LAYOUT_FIELD_LABEL[`running_${side}_page_number`]}
                      onChange={(e) => commit(`running_${side}_page_number`, e.target.value)}
                    >
                      {PAGE_NUMBER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.inline}>
                    머리말
                    <select
                      className={styles.select}
                      value={v.header}
                      aria-label={LAYOUT_FIELD_LABEL[`running_${side}_header`]}
                      onChange={(e) => commit(`running_${side}_header`, e.target.value)}
                    >
                      {HEADER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </fieldset>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="템플릿 바꾸기"
          body={`조절한 값이 처음 값으로 돌아가요. ${TEMPLATES[confirming].label} 템플릿의 조판 값으로 바꿀까요?`}
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

const SIDE_LABEL: Record<PageSideName, string> = { left: "왼쪽 쪽", right: "오른쪽 쪽" };

/** 작가에게 보이는 쪽 공통 설정 값(글자로만, D-15) */
function RunningValue({ side, layout }: { side: PageSideName; layout: Layout }) {
  const v = pageSide(layout, side);
  const number = PAGE_NUMBER_OPTIONS.find((o) => o.value === v.page_number)?.label ?? "없음";
  const header = HEADER_OPTIONS.find((o) => o.value === v.header)?.label ?? "없음";
  return (
    <>
      <dt>{SIDE_LABEL[side]}</dt>
      <dd>
        쪽 번호 {number} · 머리말 {header}
      </dd>
    </>
  );
}

const SLIDERS: [NumberField, string][] = [
  ["margin_top", "mm"],
  ["margin_bottom", "mm"],
  ["margin_inner", "mm"],
  ["margin_outer", "mm"],
  ["binding", "mm"],
  ["line_height", ""],
  ["font_size", "pt"],
];

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
