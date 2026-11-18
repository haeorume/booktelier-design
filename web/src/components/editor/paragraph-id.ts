// 문단마다 고유 id(attrs.id)를 둔다(FR-09 ③). 제안과 의견이 문단 id + 글자 위치로 자리를 가리키기 때문이다.
// 문단을 나누면 새 문단은 id 없이 생기고, 아래 플러그인이 새 UUID를 붙인다. 같은 id가 둘이면 뒤의 것을 바꾼다.
import Paragraph from "@tiptap/extension-paragraph";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const ParagraphWithId = Paragraph.extend({
  addAttributes() {
    return {
      id: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-paragraph-id"),
        renderHTML: (attrs: { id?: string | null }) => (attrs.id ? { "data-paragraph-id": attrs.id } : {}),
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("paragraph-id"),
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const seen = new Set<string>();
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "paragraph") return false;
            const id = node.attrs.id as string | null;
            if (!id || seen.has(id)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: crypto.randomUUID() });
            else seen.add(id);
            return false;
          });
          return tr.docChanged ? tr.setMeta("addToHistory", false) : null;
        },
      }),
    ];
  },
});
