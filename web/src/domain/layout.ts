// 조판 값의 범위와 바꾸기(FR-16, CS-15). 값은 W5 잠정값이고, 범위가 정해지면 이 파일만 바꾼다.
import type { Layout, TemplateId } from "@/types";
import { TEMPLATES } from "./templates";

/** 고를 수 있는 판형(mm). 세 템플릿 기본값을 모두 담는다. */
export const TRIM_OPTIONS = ["128x188", "130x200", "140x210", "148x210", "152x225"] as const;
export const MARGIN = { min: 12, max: 30, step: 1 } as const;
export const LINE_HEIGHT = { min: 1.3, max: 2.2, step: 0.05 } as const;

export type LayoutField = "template" | "trim" | "margin" | "line_height";

export const LAYOUT_FIELD_LABEL: Record<LayoutField, string> = {
  template: "템플릿",
  trim: "판형",
  margin: "여백",
  line_height: "행간",
};

export function trimLabel(trim: string): string {
  return `${trim.replace("x", "×")}mm`;
}

/** 범위 밖 값은 넣을 수 없다(CS-15). 범위 안으로 맞추고 step에 맞춰 반올림한다. */
export function clampStep(value: number, range: { min: number; max: number; step: number }): number {
  if (!Number.isFinite(value)) return range.min;
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const steps = Math.round((clamped - range.min) / range.step);
  return Number((range.min + steps * range.step).toFixed(4));
}

export function isValidLayout(layout: Layout): boolean {
  return (
    (TRIM_OPTIONS as readonly string[]).includes(layout.trim) &&
    layout.margin === clampStep(layout.margin, MARGIN) &&
    layout.line_height === clampStep(layout.line_height, LINE_HEIGHT)
  );
}

export interface LayoutChange {
  template_id: TemplateId;
  layout: Layout;
  field: LayoutField;
  before: string | number;
  after: string | number;
  /** 템플릿을 바꿔 판형·여백·행간이 그 템플릿 기본값으로 돌아갔는지(FR-16 ④) */
  reset_to_default: boolean;
}

/** 템플릿 바꾸기: 판형·여백·행간을 새 템플릿의 기본값으로 돌린다(FR-16 ④). */
export function changeTemplate(current: { template_id: TemplateId; layout: Layout }, next: TemplateId): LayoutChange {
  return {
    template_id: next,
    layout: { ...TEMPLATES[next].layout },
    field: "template",
    before: current.template_id,
    after: next,
    reset_to_default: true,
  };
}

/** 판형·여백·행간 하나 바꾸기. 템플릿은 그대로다. 값은 범위 안으로 맞춘다. */
export function changeValue(
  current: { template_id: TemplateId; layout: Layout },
  field: Exclude<LayoutField, "template">,
  value: string | number,
): LayoutChange {
  let after: string | number;
  if (field === "trim") {
    after = (TRIM_OPTIONS as readonly string[]).includes(String(value)) ? String(value) : current.layout.trim;
  } else if (field === "margin") {
    after = clampStep(Number(value), MARGIN);
  } else {
    after = clampStep(Number(value), LINE_HEIGHT);
  }
  return {
    template_id: current.template_id,
    layout: { ...current.layout, [field]: after },
    field,
    before: current.layout[field],
    after,
    reset_to_default: false,
  };
}
