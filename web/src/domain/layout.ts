// 조판 값의 범위와 바꾸기(FR-16, FR-44, FR-45, CS-15). 범위는 W5 잠정값이고, 정해지면 이 파일만 바꾼다.
import type { Layout, Margins, PageNumberPosition, RunningHeader, TemplateId } from "@/types";
import { SANS_FAMILY, SERIF_FAMILY, TEMPLATES, templateLayout } from "./templates";

/** 고를 수 있는 판형(mm). 세 템플릿 기본값(DESIGN.md 4장)과 1차 기본값(128x188·130x200)을 모두 담는다.
 * 1차에 저장된 책이 다른 값만 바꿀 때 판형 때문에 저장이 막히지 않게 한다(PLAN F3 '1차 책의 값 옮기기'). */
export const TRIM_OPTIONS = ["127x188", "128x188", "130x200", "140x210", "148x210", "152x225"] as const;
export const MARGIN = { min: 10, max: 30, step: 1 } as const;
export const BINDING = { min: 0, max: 10, step: 1 } as const;
export const LINE_HEIGHT = { min: 1.3, max: 2.2, step: 0.05 } as const;
export const FONT_SIZE = { min: 8, max: 14, step: 0.5 } as const;
/** 라이선스를 확인한 웹 글꼴(FR-45 비고). */
export const FONT_OPTIONS = [
  { family: SERIF_FAMILY, label: "명조" },
  { family: SANS_FAMILY, label: "고딕" },
] as const;

export const MARGIN_SIDES = ["top", "bottom", "inner", "outer"] as const;
export type MarginSide = (typeof MARGIN_SIDES)[number];

export type NumberField = `margin_${MarginSide}` | "binding" | "line_height" | "font_size";

/** 쪽 공통 설정(FR-44): 왼쪽·오른쪽 쪽마다 쪽 번호 위치와 머리말. */
export const PAGE_SIDES = ["left", "right"] as const;
export type PageSideName = (typeof PAGE_SIDES)[number];
export type RunningField = `running_${PageSideName}_${"page_number" | "header"}`;
export const PAGE_NUMBER_OPTIONS: { value: PageNumberPosition; label: string }[] = [
  { value: "bottom_outer", label: "바깥쪽 아래" },
  { value: "bottom_center", label: "가운데 아래" },
  { value: "none", label: "없음" },
];
export const HEADER_OPTIONS: { value: RunningHeader; label: string }[] = [
  { value: "book_title", label: "책 제목" },
  { value: "chapter_title", label: "장 제목" },
  { value: "none", label: "없음" },
];

export type LayoutField = "template" | "trim" | "font_family" | NumberField | RunningField;

export const LAYOUT_FIELD_LABEL: Record<LayoutField, string> = {
  template: "템플릿",
  trim: "판형",
  margin_top: "위 여백",
  margin_bottom: "아래 여백",
  margin_inner: "안쪽 여백",
  margin_outer: "바깥쪽 여백",
  binding: "제본 여백",
  line_height: "행간",
  font_size: "글자 크기",
  font_family: "본문 글꼴",
  running_left_page_number: "왼쪽 쪽 번호",
  running_left_header: "왼쪽 머리말",
  running_right_page_number: "오른쪽 쪽 번호",
  running_right_header: "오른쪽 머리말",
};

/** 한쪽 면의 쪽 공통 설정. 비어 있으면 '없음'(FR-44). */
export function pageSide(layout: Layout, side: PageSideName): { page_number: PageNumberPosition; header: RunningHeader } {
  const v = layout.running?.[side];
  return { page_number: v?.page_number ?? "none", header: v?.header ?? "none" };
}

function parseRunningField(field: RunningField): { side: PageSideName; key: "page_number" | "header" } {
  const side = field.startsWith("running_left_") ? "left" : "right";
  return { side, key: field.endsWith("_header") ? "header" : "page_number" };
}

export const NUMBER_RANGE: Record<NumberField, { min: number; max: number; step: number }> = {
  margin_top: MARGIN,
  margin_bottom: MARGIN,
  margin_inner: MARGIN,
  margin_outer: MARGIN,
  binding: BINDING,
  line_height: LINE_HEIGHT,
  font_size: FONT_SIZE,
};

export function trimLabel(trim: string): string {
  return `${trim.replace("x", "×")}mm`;
}

export function fontLabel(family: string): string {
  return FONT_OPTIONS.find((f) => f.family === family)?.label ?? family;
}

/** 범위 밖 값은 넣을 수 없다(CS-15). 범위 안으로 맞추고 step에 맞춰 반올림한다. */
export function clampStep(value: number, range: { min: number; max: number; step: number }): number {
  if (!Number.isFinite(value)) return range.min;
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const steps = Math.round((clamped - range.min) / range.step);
  return Number((range.min + steps * range.step).toFixed(4));
}

type PartialLayout = Partial<Omit<Layout, "margin">> & { margin?: Partial<Margins> | null };

/**
 * 서버가 준 조판 값의 빈 칸을 템플릿 기본값으로 채운다. 서버는 칸을 선택값으로 두고(F1 계약),
 * 1차에 저장된 옛 모양(margin이 숫자 하나)도 여기서 새 모양으로 옮긴다(DESIGN.md 4장, 하네스 F2).
 */
export function fillLayout(templateId: TemplateId, raw: unknown): Layout {
  const base = templateLayout(templateId);
  if (!raw || typeof raw !== "object") return base;
  const v = raw as PartialLayout & { margin?: unknown };
  const margin: Margins =
    typeof v.margin === "number"
      ? { top: v.margin, bottom: v.margin, inner: v.margin, outer: v.margin }
      : { ...base.margin, ...((v.margin as Partial<Margins> | null) ?? {}) };
  return {
    trim: typeof v.trim === "string" ? v.trim : base.trim,
    margin,
    binding: typeof v.binding === "number" ? v.binding : base.binding,
    line_height: typeof v.line_height === "number" ? v.line_height : base.line_height,
    font_family: typeof v.font_family === "string" ? v.font_family : base.font_family,
    font_size: typeof v.font_size === "number" ? v.font_size : base.font_size,
    running: v.running ?? base.running,
  };
}

export function numberValue(layout: Layout, field: NumberField): number {
  if (field.startsWith("margin_")) return layout.margin[field.slice(7) as MarginSide];
  return layout[field as "binding" | "line_height" | "font_size"];
}

function withNumber(layout: Layout, field: NumberField, value: number): Layout {
  if (field.startsWith("margin_")) return { ...layout, margin: { ...layout.margin, [field.slice(7)]: value } };
  return { ...layout, [field]: value };
}

export function isValidLayout(layout: Layout): boolean {
  const numbers = (Object.keys(NUMBER_RANGE) as NumberField[]).every((f) => {
    const v = numberValue(layout, f);
    return v === clampStep(v, NUMBER_RANGE[f]);
  });
  return (
    numbers &&
    (TRIM_OPTIONS as readonly string[]).includes(layout.trim) &&
    FONT_OPTIONS.some((f) => f.family === layout.font_family)
  );
}

export interface LayoutChange {
  template_id: TemplateId;
  layout: Layout;
  field: LayoutField;
  before: string | number;
  after: string | number;
  /** 템플릿을 바꿔 조판 값이 그 템플릿 기본값으로 돌아갔는지(FR-16 ④) */
  reset_to_default: boolean;
  /** 서버에 보낼 바꾼 칸만(A-15). 템플릿을 바꾸면 비어 있고 template_id만 간다. */
  patch: Partial<Omit<Layout, "margin">> & { margin?: Partial<Margins> };
}

/** 템플릿 바꾸기: 조판 값(쪽 공통 설정 포함)을 새 템플릿의 기본값으로 돌린다(FR-16 ④). */
export function changeTemplate(current: { template_id: TemplateId; layout: Layout }, next: TemplateId): LayoutChange {
  return {
    template_id: next,
    layout: templateLayout(next),
    field: "template",
    before: current.template_id,
    after: next,
    reset_to_default: true,
    patch: {},
  };
}

/** 값 하나 바꾸기. 템플릿은 그대로다. 숫자는 범위 안으로 맞춘다. */
export function changeValue(
  current: { template_id: TemplateId; layout: Layout },
  field: Exclude<LayoutField, "template">,
  value: string | number,
): LayoutChange {
  const { layout } = current;
  if (field.startsWith("running_")) {
    const { side, key } = parseRunningField(field as RunningField);
    const options: readonly { value: string }[] = key === "header" ? HEADER_OPTIONS : PAGE_NUMBER_OPTIONS;
    const before = pageSide(layout, side)[key];
    const after = options.some((o) => o.value === value) ? String(value) : before;
    const nextSide = { ...pageSide(layout, side), [key]: after };
    const running = { left: pageSide(layout, "left"), right: pageSide(layout, "right"), [side]: nextSide };
    return { template_id: current.template_id, layout: { ...layout, running }, field, before, after, reset_to_default: false, patch: { running: { [side]: { [key]: after } } } };
  }
  if (field === "trim") {
    const after = (TRIM_OPTIONS as readonly string[]).includes(String(value)) ? String(value) : layout.trim;
    return { template_id: current.template_id, layout: { ...layout, trim: after }, field, before: layout.trim, after, reset_to_default: false, patch: { trim: after } };
  }
  if (field === "font_family") {
    const after = FONT_OPTIONS.some((f) => f.family === value) ? String(value) : layout.font_family;
    return { template_id: current.template_id, layout: { ...layout, font_family: after }, field, before: layout.font_family, after, reset_to_default: false, patch: { font_family: after } };
  }
  const numberField = field as NumberField;
  const after = clampStep(Number(value), NUMBER_RANGE[numberField]);
  const next = withNumber(layout, numberField, after);
  const patch: LayoutChange["patch"] = numberField.startsWith("margin_") ? { margin: { [numberField.slice(7)]: after } } : { [numberField]: after };
  return { template_id: current.template_id, layout: next, field, before: numberValue(layout, numberField), after, reset_to_default: false, patch };
}

/** 템플릿 이름(화면 문구). */
export function templateLabel(id: TemplateId): string {
  return TEMPLATES[id].label;
}
