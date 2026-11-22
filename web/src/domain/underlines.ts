// 지면 밑줄 계산. 겹친 제안은 밑줄 하나로 합치고, 카드는 겹친 것을 모두 보여 준다(D-12, FR-25).
import type { AiSuggestionKind, Anchor } from "@/types";

export interface PlacedSuggestion {
  id: string;
  kind: AiSuggestionKind;
  /** 지금 원고에서 찾은 자리 */
  anchor: Anchor;
}

export interface UnderlineSpan {
  paragraph_id: string;
  start: number;
  end: number;
  /** 밑줄 모양은 합친 것 중 가장 앞에서 시작한(같으면 더 긴) 제안의 종류를 따른다 */
  kind: AiSuggestionKind;
  suggestion_ids: string[];
}

/** 문단마다 겹치는 자리를 하나로 합친다. 닿기만 하고 겹치지 않으면(end === start) 따로 둔다. */
export function mergeUnderlines(placed: PlacedSuggestion[]): UnderlineSpan[] {
  const byParagraph = new Map<string, PlacedSuggestion[]>();
  for (const p of placed) {
    const list = byParagraph.get(p.anchor.paragraph_id) ?? [];
    list.push(p);
    byParagraph.set(p.anchor.paragraph_id, list);
  }
  const spans: UnderlineSpan[] = [];
  for (const [paragraph_id, list] of byParagraph) {
    list.sort((a, b) => a.anchor.start - b.anchor.start || b.anchor.end - a.anchor.end);
    let cur: UnderlineSpan | null = null;
    for (const p of list) {
      if (cur && p.anchor.start < cur.end) {
        cur.end = Math.max(cur.end, p.anchor.end);
        cur.suggestion_ids.push(p.id);
      } else {
        cur = { paragraph_id, start: p.anchor.start, end: p.anchor.end, kind: p.kind, suggestion_ids: [p.id] };
        spans.push(cur);
      }
    }
  }
  return spans;
}
