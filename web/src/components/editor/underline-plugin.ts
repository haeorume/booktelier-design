// 지면 밑줄(WS-33). 문단 id + 글자 위치로 받은 밑줄을 그때그때의 문서 위치로 바꿔 그린다.
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { UnderlineSpan } from "@/domain/underlines";

export interface UnderlineState {
  spans: UnderlineSpan[];
  selected: string[];
}

export const underlineKey = new PluginKey<UnderlineState>("ai-underlines");

/** 문단 id → 문단 노드가 시작하는 위치 */
export function paragraphPositions(doc: PMNode): Map<string, { pos: number; size: number }> {
  const map = new Map<string, { pos: number; size: number }>();
  doc.descendants((node, pos) => {
    if (node.type.name === "paragraph") {
      const id = node.attrs.id as string | null;
      if (id) map.set(id, { pos, size: node.content.size });
      return false;
    }
    return true;
  });
  return map;
}

/** 문단 id + 글자 위치 → 문서 위치. 문단 안 글자는 서식 없는 글자 하나라 글자 위치가 그대로 맞는다. */
export function toDocRange(doc: PMNode, paragraphId: string, start: number, end: number): { from: number; to: number } | null {
  const p = paragraphPositions(doc).get(paragraphId);
  if (!p || start < 0 || end > p.size || end <= start) return null;
  return { from: p.pos + 1 + start, to: p.pos + 1 + end };
}

function decorations(state: EditorState, u: UnderlineState): DecorationSet {
  const positions = paragraphPositions(state.doc);
  const selected = new Set(u.selected);
  const decos: Decoration[] = [];
  for (const span of u.spans) {
    const p = positions.get(span.paragraph_id);
    if (!p || span.end > p.size || span.end <= span.start) continue;
    const isSelected = span.suggestion_ids.some((id) => selected.has(id));
    decos.push(
      Decoration.inline(p.pos + 1 + span.start, p.pos + 1 + span.end, {
        class: `ai-underline ai-underline--${span.kind}${isSelected ? " is-selected" : ""}`,
        "data-kind": span.kind,
        "data-suggestion-ids": span.suggestion_ids.join(" "),
        role: "button",
        tabindex: "0",
      }),
    );
  }
  return DecorationSet.create(state.doc, decos);
}

export const AiUnderlines = Extension.create({
  name: "aiUnderlines",
  addProseMirrorPlugins() {
    return [
      new Plugin<UnderlineState>({
        key: underlineKey,
        state: {
          init: () => ({ spans: [], selected: [] }),
          apply: (tr, value) => (tr.getMeta(underlineKey) as UnderlineState | undefined) ?? value,
        },
        props: {
          decorations(state) {
            return decorations(state, underlineKey.getState(state) ?? { spans: [], selected: [] });
          },
        },
      }),
    ];
  },
});
