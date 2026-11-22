// 위치(anchor) 계산. 문단 id + 글자 위치로 찾고, 어긋나면 같은 문단에서 original로 다시 찾는다(NFR-05, D-19).
import type { Anchor, ChapterDoc } from "@/types";

/** 문단의 서식 제외 텍스트. 문단이 없으면 null. */
export function paragraphText(doc: ChapterDoc, paragraphId: string): string | null {
  const p = doc.content.find((n) => n.attrs.id === paragraphId);
  if (!p) return null;
  return (p.content ?? []).map((t) => t.text).join("");
}

export interface Located {
  anchor: Anchor;
  /** 처음 위치가 어긋나 original로 다시 찾았는지 */
  relocated: boolean;
}

/**
 * 제안이 지금 원고에서 가리키는 자리. 찾지 못하면 null(원문이 지워짐 → 무효, NFR-05 ②).
 * 다시 찾을 때 같은 문구가 여럿이면 처음 위치에 가장 가까운 것을 고른다.
 */
export function locate(doc: ChapterDoc, target: { anchor: Anchor; original: string }): Located | null {
  const { anchor, original } = target;
  if (original.length === 0) return null;
  const text = paragraphText(doc, anchor.paragraph_id);
  if (text === null) return null;

  if (text.slice(anchor.start, anchor.end) === original) return { anchor, relocated: false };

  let best: number | null = null;
  for (let i = text.indexOf(original); i !== -1; i = text.indexOf(original, i + 1)) {
    if (best === null || Math.abs(i - anchor.start) < Math.abs(best - anchor.start)) best = i;
  }
  if (best === null) return null;
  return {
    anchor: { paragraph_id: anchor.paragraph_id, start: best, end: best + original.length },
    relocated: true,
  };
}
