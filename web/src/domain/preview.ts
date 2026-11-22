// 미리보기(PV-01~05, FR-43, D-34): 저장된 원고와 조판 값으로 Paged.js가 읽을 HTML과 CSS를 만드는 순수 함수.
// 화면은 여기서 만든 글을 Paged.js에 넘겨 실제 쪽으로 나눠요. 작업 지면과 같은 조판 값을 써요.
import type { ChapterDoc, Layout, TemplateId } from "@/types";
import { pageSide } from "./layout";
import { pageStyleVars, parseTrim, TEMPLATES } from "./templates";

/** 지면 위 표시 하나(보기 켜고 끄기, PV-04). 자리는 문단 id + 서식 뺀 글자 위치(D-19). */
export interface PreviewMark {
  paragraph_id: string;
  start: number;
  end: number;
  /** comment · edit · ai-spelling · ai-spacing · ai-notation · ai-polish */
  kind: string;
  /** 수정 제안이면 더할 글자(지운 글자 뒤에 붙여 보여요) */
  insert?: string;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** CSS content 문자열 안에 넣을 글자. 따옴표·역슬래시·줄바꿈을 이스케이프해요. */
export function cssString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function paragraphText(p: ChapterDoc["content"][number]): string {
  return (p.content ?? []).map((t) => t.text).join("");
}

/**
 * 문단 하나를 HTML로. 표시가 겹쳐도 글자는 한 번만 쓰고, 덮는 표시의 class를 모두 붙여요.
 * 수정 제안의 더할 글자는 showInserts일 때만 넣어요. 글이 늘어 쪽 나누기가 달라지므로 켜고 끌 때 다시 그려요(Codex 검수 11.21).
 * 빈 문단은 편집기처럼 줄바꿈을 넣어 한 줄 높이를 지켜요.
 */
export function paragraphHtml(text: string, marks: PreviewMark[], showInserts = false): string {
  if (text.length === 0) return "<br>";
  const valid = marks.filter((m) => m.start >= 0 && m.end <= text.length && m.start <= m.end);
  const cuts = new Set<number>([0, text.length]);
  for (const m of valid) {
    cuts.add(m.start);
    cuts.add(m.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  let html = "";
  for (let i = 0; i < points.length; i++) {
    const at = points[i];
    // 이 자리에서 끝나는 수정 제안의 더할 글자
    for (const m of valid) {
      if (showInserts && m.kind === "edit" && m.insert && m.end === at) html += `<ins class="bt-mark bt-edit-ins">${escapeHtml(m.insert)}</ins>`;
    }
    const next = points[i + 1];
    if (next === undefined || next === at) continue;
    const piece = escapeHtml(text.slice(at, next));
    const covering = valid.filter((m) => m.start <= at && m.end >= next && m.start !== m.end);
    if (covering.length === 0) html += piece;
    else {
      const cls = [...new Set(covering.map((m) => (m.kind === "edit" ? "bt-edit-del" : `bt-${m.kind}`)))].join(" ");
      html += `<span class="bt-mark ${cls}">${piece}</span>`;
    }
  }
  return html;
}

/** 장 하나를 미리보기 HTML로: 장 머리(눈썹 글자 · 장 제목 · 짧은 선) + 문단들. */
export function chapterHtml(doc: ChapterDoc, chapter: { order: number; title: string }, marks: PreviewMark[], showInserts = false): string {
  const head =
    `<header class="bt-chapter-head">` +
    `<p class="bt-eyebrow">CHAPTER ${String(chapter.order).padStart(2, "0")}</p>` +
    `<h2 class="bt-chapter-title">${escapeHtml(chapter.title)}</h2>` +
    `<span class="bt-rule"></span></header>`;
  const body = doc.content
    .map((p) => {
      const mine = marks.filter((m) => m.paragraph_id === p.attrs.id);
      return `<p class="bt-p" data-paragraph-id="${escapeHtml(p.attrs.id)}">${paragraphHtml(paragraphText(p), mine, showInserts)}</p>`;
    })
    .join("");
  return head + body;
}

function marginBox(pos: "bottom_outer" | "bottom_center" | "none", side: "left" | "right"): string | null {
  if (pos === "none") return null;
  if (pos === "bottom_center") return "bottom-center";
  return side === "left" ? "bottom-left" : "bottom-right";
}

/**
 * 조판 값 → Paged.js가 읽을 CSS(CSS Paged Media).
 * 왼쪽 쪽은 안쪽(+제본 여백)이 오른쪽, 오른쪽 쪽은 안쪽이 왼쪽이에요(FR-43 ②). 쪽 번호와 머리말은 쪽 공통 설정대로(FR-44).
 * 장의 첫 쪽에는 머리말을 찍지 않아요(작업 지면과 같음). 본문 글꼴·크기·행간은 작업 지면과 같은 값이에요.
 */
export function pageCss(templateId: TemplateId, layout: Layout, titles: { book: string; chapter: string }): string {
  const trim = parseTrim(layout.trim) ?? parseTrim(TEMPLATES[templateId].layout.trim)!;
  const { top, bottom, inner, outer } = layout.margin;
  const inside = inner + layout.binding;
  const vars = pageStyleVars(templateId, layout);
  const rules: string[] = [
    `@page { size: ${trim.width}mm ${trim.height}mm; margin: ${top}mm ${outer}mm ${bottom}mm ${inside}mm; }`,
    `@page :left { margin-left: ${outer}mm; margin-right: ${inside}mm; }`,
    `@page :right { margin-left: ${inside}mm; margin-right: ${outer}mm; }`,
  ];
  for (const side of ["left", "right"] as const) {
    const s = pageSide(layout, side);
    const boxes: string[] = [];
    const number = marginBox(s.page_number, side);
    if (number) boxes.push(`@${number} { content: counter(page); font-family: var(--bt-font-ui); font-size: 9pt; color: var(--bt-text-3); }`);
    const header = s.header === "book_title" ? titles.book : s.header === "chapter_title" ? titles.chapter : null;
    if (header) boxes.push(`@top-${side === "left" ? "left" : "right"} { content: ${cssString(header)}; font-family: var(--bt-font-ui); font-size: 8pt; color: var(--bt-text-3); }`);
    rules.push(`@page :${side} { ${boxes.join(" ")} }`);
  }
  rules.push(`@page :first { @top-left { content: none; } @top-right { content: none; } }`);
  rules.push(
    `.bt-p { font-family: ${vars["--page-font"]}; font-size: ${vars["--page-font-size"]}; line-height: ${vars["--page-line-height"]}; text-align: ${vars["--page-text-align"]}; text-indent: ${vars["--page-text-indent"]}; margin: 0 0 0.6em; min-height: 1em; word-break: keep-all; white-space: break-spaces; color: var(--bt-ink); }`,
    // 장 머리는 작업 지면(ManuscriptEditor.module.css, 시안 11.22)과 같은 크기라 쪽 나누기가 같아요.
    `.bt-chapter-head { margin-bottom: 29px; font-family: var(--bt-font-ui); }`,
    `.bt-eyebrow { font-family: var(--bt-font-ui); font-size: 9px; font-weight: 400; line-height: 1.3; letter-spacing: 0.2em; color: var(--bt-accent-text); margin: 10px 0 17px; }`,
    `.bt-chapter-title { font-family: var(--bt-font-ui); font-size: 28px; font-weight: 600; line-height: 1.5; letter-spacing: -0.01em; color: var(--bt-ink); margin: 0; }`,
    `.bt-rule { display: block; width: 28px; height: 2px; margin-top: 25px; background: var(--bt-brand); opacity: 0.6; }`,
  );
  return rules.join("\n");
}
