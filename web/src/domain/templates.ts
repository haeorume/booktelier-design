// 템플릿 3종(D-11)과 기본 조판 값. 값은 1차 잠정값(W2에서 정함, 디자인 쪽에서 바꿀 수 있음).
// 판형은 1차에서 지면의 가로 폭으로 표현한다(FR-10 ①).
import type { Layout, TemplateId } from "@/types";

export type FontFamily = "serif" | "sans";

export interface Template {
  id: TemplateId;
  label: string;
  font: FontFamily;
  layout: Layout;
}

// 값은 DESIGN.md 4장 '템플릿 잠정값'(Q-24). 서버 api/app/templates.py와 같은 값이다(책을 만들 때 서버가 채운다).
const RUNNING: Layout["running"] = {
  left: { page_number: "bottom_outer", header: "book_title" },
  right: { page_number: "bottom_outer", header: "chapter_title" },
};

export const SERIF_FAMILY = "Noto Serif KR";
export const SANS_FAMILY = "Noto Sans KR";

export const TEMPLATES: Record<TemplateId, Template> = {
  novel: {
    id: "novel",
    label: "소설",
    font: "serif",
    layout: { trim: "127x188", margin: { top: 18, bottom: 20, inner: 17, outer: 14 }, binding: 3, line_height: 1.75, font_family: SERIF_FAMILY, font_size: 10, running: RUNNING },
  },
  essay: {
    id: "essay",
    label: "에세이",
    font: "serif",
    layout: { trim: "148x210", margin: { top: 20, bottom: 22, inner: 20, outer: 16 }, binding: 3, line_height: 1.8, font_family: SERIF_FAMILY, font_size: 10.5, running: RUNNING },
  },
  practical: {
    id: "practical",
    label: "실용서",
    font: "sans",
    layout: { trim: "152x225", margin: { top: 20, bottom: 20, inner: 18, outer: 16 }, binding: 3, line_height: 1.65, font_family: SANS_FAMILY, font_size: 10, running: RUNNING },
  },
};

/** 템플릿 기본값을 새 객체로(바꿔도 TEMPLATES가 바뀌지 않게). */
export function templateLayout(id: TemplateId): Layout {
  return structuredClone(TEMPLATES[id].layout);
}

export const TEMPLATE_ORDER: TemplateId[] = ["novel", "essay", "practical"];

/** "128x188" → { width: 128, height: 188 } (mm). 모양이 틀리면 null. */
export function parseTrim(trim: string): { width: number; height: number } | null {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(trim);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

const FONT_STACK: Record<FontFamily, string> = {
  serif: '"Noto Serif KR", "Nanum Myeongjo", "Batang", "AppleMyungjo", serif',
  sans: '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
};

/** 지면에 입히는 CSS 변수 묶음(P3). 원고와 따로 저장한 조판 값에서 만든다.
 * 한 쪽 보기는 홀수 쪽 기준이라 안쪽(+제본 여백)이 왼쪽, 바깥쪽이 오른쪽이다(DESIGN.md 4장). */
export function pageStyleVars(templateId: TemplateId, layout: Layout): Record<string, string> {
  const trim = parseTrim(layout.trim) ?? parseTrim(TEMPLATES[templateId].layout.trim)!;
  const { top, bottom, inner, outer } = layout.margin;
  return {
    "--page-width": `${trim.width}mm`,
    "--page-min-height": `${trim.height}mm`,
    "--page-margin": `${top}mm ${outer}mm ${bottom}mm ${inner + layout.binding}mm`,
    "--page-line-height": String(layout.line_height),
    "--page-font-size": `${layout.font_size}pt`,
    "--page-font": layout.font_family === SANS_FAMILY ? FONT_STACK.sans : layout.font_family === SERIF_FAMILY ? FONT_STACK.serif : FONT_STACK[TEMPLATES[templateId].font],
  };
}
