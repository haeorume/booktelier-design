"use client";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { pageStyleVars } from "@/domain/templates";
import type { UnderlineSpan } from "@/domain/underlines";
import { changedParagraphs, paragraphTexts } from "@/workspace/suggestions";
import { parseChapterDoc, type ChapterDoc, type Layout, type TemplateId } from "@/types";
import { ParagraphWithId } from "./paragraph-id";
import { selectionToAnchor, type PickedText } from "./selection";
import { AiUnderlines, toDocRange, underlineKey, type CommentMark, type EditMark } from "./underline-plugin";
import styles from "./ManuscriptEditor.module.css";

export type ChangeSource = "typing" | "program";

export interface EditorHandle {
  /** 문단 한 곳의 글자를 바꾼다(적용·실행 취소·수락). 자리가 맞지 않으면 false. */
  replaceText(paragraphId: string, start: number, end: number, text: string): boolean;
}

export type MarkClick = { kind: "suggestion"; ids: string[] } | { kind: "edit"; id: string } | { kind: "comment"; id: string };

interface Props {
  ref?: Ref<EditorHandle>;
  initialDoc: ChapterDoc;
  editable: boolean;
  templateId: TemplateId;
  layout: Layout;
  chapterTitle: string;
  header?: ReactNode;
  spans: UnderlineSpan[];
  edits: EditMark[];
  comments: CommentMark[];
  selected: string[];
  onDocChange: (doc: ChapterDoc, changed: string[], source: ChangeSource) => void;
  onMarkClick: (click: MarkClick) => void;
  /** 한 문단 안의 글자를 고르면 그 자리, 고르지 않으면 null(WS-35 선택 메뉴) */
  onPick: (picked: PickedText | null) => void;
  /** 고른 글자 옆에 띄울 메뉴(선택 메뉴). 고른 것이 없으면 그리지 않는다. */
  selectionMenu?: ReactNode;
  /** Ctrl/Cmd+Z. 직전 AI 제안 적용을 되돌렸으면 true(G-11). false면 편집기의 되돌리기가 돈다. */
  onUndoShortcut: () => boolean;
}

const PROGRAM = "booktelier-program-change";

/**
 * 지면 편집기(WS-30, WS-32). 템플릿 CSS 변수를 입힌 책 모양 지면이 곧 편집 화면이다.
 * 글자 서식 도구는 없다(D-13). 작가가 아니면 읽기 전용이다(FR-09 ④). 읽기 전용이어도 글자는 고를 수 있다(의견).
 */
export function ManuscriptEditor(props: Props) {
  const { ref, initialDoc, editable, templateId, layout, chapterTitle, header, spans, edits, comments, selected, selectionMenu } = props;
  const texts = useRef(paragraphTexts(initialDoc));
  const handlers = useRef(props);
  const page = useRef<HTMLElement>(null);
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
  const reread = useRef<() => void>(() => {});
  useEffect(() => {
    handlers.current = props;
    reread.current = readSelection;
  });

  const editor = useEditor({
    extensions: [Document, ParagraphWithId, Text, UndoRedo, AiUnderlines],
    content: initialDoc,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: styles.prose, "data-testid": "manuscript", "aria-label": "원고" },
      // 적용 직후의 Ctrl/Cmd+Z는 원고와 제안을 함께 되돌린다(G-11, FR-27 ③). 그 밖에는 편집기의 되돌리기.
      handleKeyDown: (_view, event) => {
        const undoKey = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z";
        if (!undoKey || !handlers.current.onUndoShortcut()) return false;
        event.preventDefault();
        return true;
      },
    },
    onUpdate: ({ editor: e, transaction }) => {
      let doc: ChapterDoc;
      try {
        doc = parseChapterDoc(e.getJSON());
      } catch {
        return; // 문단 id가 아직 붙지 않은 중간 상태
      }
      const after = paragraphTexts(doc);
      const changed = changedParagraphs(texts.current, after);
      texts.current = after;
      handlers.current.onDocChange(doc, changed, transaction.getMeta(PROGRAM) ? "program" : "typing");
      // 원고가 바뀌면 고른 글자도 바뀌었을 수 있다. 옛 선택 메뉴로 없는 글자에 의견을 달지 않게 다시 읽는다.
      reread.current();
    },
  });

  useEffect(() => {
    // 잠그고 푸는 것은 원고 변경이 아니다. 바뀜 이벤트를 내지 않아 저장이 따로 나가지 않게 한다.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(underlineKey, { spans, edits, comments, selected }).setMeta("addToHistory", false));
  }, [editor, spans, edits, comments, selected]);

  // 카드를 고르면 지면이 그 자리로 움직인다(N-08, G-03).
  useEffect(() => {
    const first = selected[0];
    if (!first) return;
    const id = CSS.escape(first);
    page.current
      ?.querySelector(`[data-suggestion-ids~="${id}"], [data-edit-id="${id}"], [data-comment-id="${id}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected]);

  useImperativeHandle(
    ref,
    () => ({
      replaceText(paragraphId, start, end, text) {
        if (!editor) return false;
        const range = toDocRange(editor.state.doc, paragraphId, start, end);
        if (!range) return false;
        // 적용·실행 취소·수락은 편집기 되돌리기 기록에 넣지 않는다. 제안 상태와 함께 따로 다룬다(G-11).
        const tr = editor.state.tr.insertText(text, range.from, range.to).setMeta(PROGRAM, true).setMeta("addToHistory", false);
        editor.view.dispatch(tr);
        return true;
      },
    }),
    [editor],
  );

  function clickMark(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return;
    const edit = target.closest<HTMLElement>("[data-edit-id]")?.dataset.editId;
    if (edit) return handlers.current.onMarkClick({ kind: "edit", id: edit });
    const ids = target.closest<HTMLElement>("[data-suggestion-ids]")?.dataset.suggestionIds?.split(" ").filter(Boolean);
    if (ids?.length) return handlers.current.onMarkClick({ kind: "suggestion", ids });
    const comment = target.closest<HTMLElement>("[data-comment-id]")?.dataset.commentId;
    if (comment) handlers.current.onMarkClick({ kind: "comment", id: comment });
  }

  /** 브라우저에서 고른 글자를 읽는다. 읽기 전용 지면에서도 쓰려고 DOM 선택에서 읽는다. */
  function readSelection() {
    if (!editor || !page.current) return;
    const sel = window.getSelection();
    let picked: PickedText | null = null;
    if (sel && !sel.isCollapsed && sel.anchorNode && sel.focusNode && editor.view.dom.contains(sel.anchorNode) && editor.view.dom.contains(sel.focusNode)) {
      try {
        picked = selectionToAnchor(editor.state.doc, editor.view.posAtDOM(sel.anchorNode, sel.anchorOffset), editor.view.posAtDOM(sel.focusNode, sel.focusOffset));
      } catch {
        picked = null;
      }
    }
    if (picked && sel) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const base = page.current.getBoundingClientRect();
      setMenuAt({ top: rect.bottom - base.top + 6, left: Math.max(0, rect.left - base.left) });
    } else setMenuAt(null);
    handlers.current.onPick(picked);
  }

  return (
    <article
      ref={page}
      className={styles.page}
      data-testid="page"
      data-template={templateId}
      data-editable={editable}
      style={pageStyleVars(templateId, layout) as CSSProperties}
      onClick={(e) => clickMark(e.target)}
      onMouseUp={readSelection}
      // 선택을 넓히거나 옮기는 키뿐 아니라 글자를 치거나 지우는 키에도 선택을 다시 읽는다.
      onKeyUp={readSelection}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !editable && (e.target as HTMLElement).closest?.("[data-suggestion-ids]")) clickMark(e.target);
      }}
    >
      {header}
      <h2 className={styles.chapterTitle}>{chapterTitle}</h2>
      <EditorContent editor={editor} />
      {menuAt && selectionMenu && (
        <div className={styles.selectionMenu} style={{ top: menuAt.top, left: menuAt.left }} onMouseUp={(e) => e.stopPropagation()}>
          {selectionMenu}
        </div>
      )}
    </article>
  );
}
