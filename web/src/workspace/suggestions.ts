// 지면에 보일 AI 제안 계산과 원고 바꾸기. 화면과 상관없는 순수 함수.
import { locate, paragraphText } from "@/domain/anchor";
import type { AiSuggestion, Anchor, ChapterDoc } from "@/types";

export interface Placed {
  suggestion: AiSuggestion;
  /** 지금 원고에서 찾은 자리 */
  anchor: Anchor;
  relocated: boolean;
}

export interface Placement {
  /** 원고 순서(문단 순서, 같은 문단이면 시작 위치)로 늘어선 대기 제안 */
  placed: Placed[];
  /** 원문을 찾을 수 없게 된 대기 제안. 무효로 바꿔야 한다(NFR-04, NFR-05 ②, Q-15 잠정) */
  lost: AiSuggestion[];
}

/** 대기(pending) 제안만 지금 원고에서 자리를 찾는다. */
export function placeSuggestions(doc: ChapterDoc, suggestions: AiSuggestion[]): Placement {
  const order = new Map(doc.content.map((p, i) => [p.attrs.id, i]));
  const placed: Placed[] = [];
  const lost: AiSuggestion[] = [];
  for (const s of suggestions) {
    if (s.status !== "pending") continue;
    const found = locate(doc, s);
    if (found) placed.push({ suggestion: s, anchor: found.anchor, relocated: found.relocated });
    else lost.push(s);
  }
  placed.sort(
    (a, b) =>
      (order.get(a.anchor.paragraph_id) ?? 0) - (order.get(b.anchor.paragraph_id) ?? 0) ||
      a.anchor.start - b.anchor.start ||
      a.anchor.end - b.anchor.end,
  );
  return { placed, lost };
}

/** 문단 한 곳의 글자를 바꾼 새 문서. 그 문단의 강조 표시는 새 글자로 갈음한다. */
export function replaceInDoc(doc: ChapterDoc, anchor: Anchor, text: string): ChapterDoc {
  return {
    ...doc,
    content: doc.content.map((p) => {
      if (p.attrs.id !== anchor.paragraph_id) return p;
      const before = paragraphText(doc, p.attrs.id) ?? "";
      const next = before.slice(0, anchor.start) + text + before.slice(anchor.end);
      return { ...p, content: next ? [{ type: "text" as const, text: next }] : [] };
    }),
  };
}

/** 적용 직후 실행 취소에 필요한 것(FR-27 ③, 마지막 1회만). */
export interface LastApplied {
  suggestion: AiSuggestion;
  /** 적용으로 들어간 글자가 놓인 자리 */
  inserted: Anchor;
  insertedText: string;
}

export function appliedRange(anchor: Anchor, text: string): Anchor {
  return { paragraph_id: anchor.paragraph_id, start: anchor.start, end: anchor.start + text.length };
}

/** 실행 취소할 수 있는지: 적용한 글자가 그 자리에 그대로 있어야 한다. */
export function canUndo(doc: ChapterDoc, last: LastApplied): boolean {
  const text = paragraphText(doc, last.inserted.paragraph_id);
  return text !== null && text.slice(last.inserted.start, last.inserted.end) === last.insertedText;
}

/** 문단 id → 서식 제외 텍스트. 바뀐 문단을 찾을 때 쓴다. */
export function paragraphTexts(doc: ChapterDoc): Map<string, string> {
  return new Map(doc.content.map((p) => [p.attrs.id, (p.content ?? []).map((t) => t.text).join("")]));
}

/** 두 문서 사이에 글자가 바뀌었거나 새로 생긴 문단 id. */
export function changedParagraphs(before: Map<string, string>, after: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [id, text] of after) if (before.get(id) !== text) out.push(id);
  return out;
}
