// 지면 표시(WS-33, WS-34). 문단 id + 글자 위치로 받은 표시를 그때그때의 문서 위치로 바꿔 그린다.
// - AI 제안 밑줄: 종류마다 색과 선 모양이 다르다. 겹친 자리는 하나(D-12).
// - 수정 제안: 지운 글자(취소선)와 더한 글자(보라 파선, CS-11). 대기 중인 것만.
// - 의견 자리: 엷은 칠. 카드를 고르면 강조된다(N-08).
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { UnderlineSpan } from "@/domain/underlines";
import type { Anchor } from "@/types";

export interface EditMark {
  id: string;
  anchor: Anchor;
  replacement: string;
}

export interface CommentMark {
  id: string;
  anchor: Anchor;
}

export interface UnderlineState {
  spans: UnderlineSpan[];
  edits: EditMark[];
  comments: CommentMark[];
  /** 고른 AI 제안·수정 제안·의견 id */
  selected: string[];
}

export const EMPTY_MARKS: UnderlineState = { spans: [], edits: [], comments: [], selected: [] };

export const underlineKey = new PluginKey<UnderlineState>("page-marks");

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
  if (!p || start < 0 || end > p.size || end < start) return null;
  return { from: p.pos + 1 + start, to: p.pos + 1 + end };
}

function decorations(state: EditorState, u: UnderlineState): DecorationSet {
  const positions = paragraphPositions(state.doc);
  const selected = new Set(u.selected);
  const decos: Decoration[] = [];
  const range = (a: Anchor) => {
    const p = positions.get(a.paragraph_id);
    if (!p || a.end > p.size || a.end <= a.start) return null;
    return { from: p.pos + 1 + a.start, to: p.pos + 1 + a.end };
  };

  for (const c of u.comments) {
    const r = range(c.anchor);
    if (!r) continue;
    decos.push(
      Decoration.inline(r.from, r.to, {
        class: `comment-mark${selected.has(c.id) ? " is-selected" : ""}`,
        "data-comment-id": c.id,
      }),
    );
  }

  for (const span of u.spans) {
    const r = range(span);
    if (!r) continue;
    const isSelected = span.suggestion_ids.some((id) => selected.has(id));
    decos.push(
      Decoration.inline(r.from, r.to, {
        class: `ai-underline ai-underline--${span.kind}${isSelected ? " is-selected" : ""}`,
        "data-kind": span.kind,
        "data-suggestion-ids": span.suggestion_ids.join(" "),
        role: "button",
        tabindex: "0",
      }),
    );
  }

  for (const e of u.edits) {
    const r = range(e.anchor);
    if (!r) continue;
    const isSelected = selected.has(e.id);
    decos.push(Decoration.inline(r.from, r.to, { class: `edit-delete${isSelected ? " is-selected" : ""}`, "data-edit-id": e.id }));
    decos.push(
      Decoration.widget(
        r.to,
        () => {
          const ins = document.createElement("ins");
          ins.className = `edit-insert${isSelected ? " is-selected" : ""}`;
          ins.dataset.editId = e.id;
          ins.textContent = e.replacement;
          return ins;
        },
        { side: 1, key: `edit-${e.id}-${e.replacement}-${isSelected}` },
      ),
    );
  }

  return DecorationSet.create(state.doc, decos);
}

export const AiUnderlines = Extension.create({
  name: "pageMarks",
  addProseMirrorPlugins() {
    return [
      new Plugin<UnderlineState>({
        key: underlineKey,
        state: {
          init: () => EMPTY_MARKS,
          apply: (tr, value) => (tr.getMeta(underlineKey) as UnderlineState | undefined) ?? value,
        },
        props: {
          decorations(state) {
            return decorations(state, underlineKey.getState(state) ?? EMPTY_MARKS);
          },
        },
      }),
    ];
  },
});
