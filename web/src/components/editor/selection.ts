// 지면에서 고른 글자 → anchor. 한 문단 안에서 고른 것만 받는다(FR-32, FR-33 '한 문단 안의 글자').
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Anchor } from "@/types";

export interface PickedText {
  anchor: Anchor;
  text: string;
}

export function selectionToAnchor(doc: PMNode, a: number, b: number): PickedText | null {
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  if (from === to || from < 0 || to > doc.content.size) return null;
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  const p = $from.parent;
  if (p.type.name !== "paragraph" || $from.sameParent($to) === false) return null;
  const id = p.attrs.id as string | null;
  if (!id) return null;
  const start = $from.parentOffset;
  const end = $to.parentOffset;
  const text = p.textContent.slice(start, end);
  if (!text.trim()) return null;
  return { anchor: { paragraph_id: id, start, end }, text };
}
