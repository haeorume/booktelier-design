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

export const TEMPLATES: Record<TemplateId, Template> = {
  novel: { id: "novel", label: "소설", font: "serif", layout: { trim: "128x188", margin: 20, line_height: 1.8 } },
  essay: { id: "essay", label: "에세이", font: "serif", layout: { trim: "130x200", margin: 22, line_height: 1.7 } },
  practical: { id: "practical", label: "실용서", font: "sans", layout: { trim: "152x225", margin: 18, line_height: 1.6 } },
};

export const TEMPLATE_ORDER: TemplateId[] = ["novel", "essay", "practical"];

/** "128x188" → { width: 128, height: 188 } (mm). 모양이 틀리면 null. */
export function parseTrim(trim: string): { width: number; height: number } | null {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(trim);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

const FONT_STACK: Record<FontFamily, string> = {
  serif: '"Noto Serif KR", "Nanum Myeongjo", "Batang", "AppleMyungjo", serif',
  sans: '"Noto Sans KR", "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
};

/** 지면에 입히는 CSS 변수 묶음(P3). 원고와 따로 저장한 조판 값에서 만든다. */
export function pageStyleVars(templateId: TemplateId, layout: Layout): Record<string, string> {
  const trim = parseTrim(layout.trim) ?? parseTrim(TEMPLATES[templateId].layout.trim)!;
  return {
    "--page-width": `${trim.width}mm`,
    "--page-min-height": `${trim.height}mm`,
    "--page-margin": `${layout.margin}mm`,
    "--page-line-height": String(layout.line_height),
    "--page-font": FONT_STACK[TEMPLATES[templateId].font],
  };
}
