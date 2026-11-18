"use client";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useImperativeHandle, useRef, type CSSProperties, type Ref } from "react";
import { pageStyleVars } from "@/domain/templates";
import type { UnderlineSpan } from "@/domain/underlines";
import { changedParagraphs, paragraphTexts } from "@/workspace/suggestions";
import { parseChapterDoc, type ChapterDoc, type Layout, type TemplateId } from "@/types";
import { ParagraphWithId } from "./paragraph-id";
import { AiUnderlines, toDocRange, underlineKey } from "./underline-plugin";
import styles from "./ManuscriptEditor.module.css";

export type ChangeSource = "typing" | "program";

export interface EditorHandle {
  /** 문단 한 곳의 글자를 바꾼다(적용·실행 취소). 자리가 맞지 않으면 false. */
  replaceText(paragraphId: string, start: number, end: number, text: string): boolean;
}

interface Props {
  ref?: Ref<EditorHandle>;
  initialDoc: ChapterDoc;
  editable: boolean;
  templateId: TemplateId;
  layout: Layout;
  chapterTitle: string;
  spans: UnderlineSpan[];
  selected: string[];
  onDocChange: (doc: ChapterDoc, changed: string[], source: ChangeSource) => void;
  onUnderlineClick: (suggestionIds: string[]) => void;
  /** Ctrl/Cmd+Z. 직전 AI 제안 적용을 되돌렸으면 true(G-11). false면 편집기의 되돌리기가 돈다. */
  onUndoShortcut: () => boolean;
}

const PROGRAM = "booktelier-program-change";

/**
 * 지면 편집기(WS-30, WS-32). 템플릿 CSS 변수를 입힌 책 모양 지면이 곧 편집 화면이다.
 * 글자 서식 도구는 없다(D-13). 작가가 아니면 읽기 전용이다(FR-09 ④).
 */
export function ManuscriptEditor({ ref, initialDoc, editable, templateId, layout, chapterTitle, spans, selected, onDocChange, onUnderlineClick, onUndoShortcut }: Props) {
  const texts = useRef(paragraphTexts(initialDoc));
  const onChange = useRef(onDocChange);
  const onUndo = useRef(onUndoShortcut);
  const page = useRef<HTMLElement>(null);
  useEffect(() => {
    onChange.current = onDocChange;
    onUndo.current = onUndoShortcut;
  }, [onDocChange, onUndoShortcut]);

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
        if (!undoKey || !onUndo.current()) return false;
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
      onChange.current(doc, changed, transaction.getMeta(PROGRAM) ? "program" : "typing");
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(underlineKey, { spans, selected }).setMeta("addToHistory", false));
  }, [editor, spans, selected]);

  // 카드를 고르면 지면이 그 자리로 움직인다(N-08, G-03).
  useEffect(() => {
    const first = selected[0];
    if (!first) return;
    page.current?.querySelector(`[data-suggestion-ids~="${CSS.escape(first)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected]);

  useImperativeHandle(
    ref,
    () => ({
      replaceText(paragraphId, start, end, text) {
        if (!editor) return false;
        const range = toDocRange(editor.state.doc, paragraphId, start, end);
        if (!range) return false;
        // 적용·실행 취소는 편집기 되돌리기 기록에 넣지 않는다. 제안 상태와 함께 따로 되돌린다(G-11).
        const tr = editor.state.tr.insertText(text, range.from, range.to).setMeta(PROGRAM, true).setMeta("addToHistory", false);
        editor.view.dispatch(tr);
        return true;
      },
    }),
    [editor],
  );

  function pick(target: EventTarget | null) {
    const el = target instanceof HTMLElement ? target.closest<HTMLElement>("[data-suggestion-ids]") : null;
    const ids = el?.dataset.suggestionIds?.split(" ").filter(Boolean);
    if (ids?.length) onUnderlineClick(ids);
  }

  return (
    <article
      ref={page}
      className={styles.page}
      data-testid="page"
      data-template={templateId}
      data-editable={editable}
      style={pageStyleVars(templateId, layout) as CSSProperties}
      onClick={(e) => pick(e.target)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).closest?.("[data-suggestion-ids]") && !editable) pick(e.target);
      }}
    >
      <h2 className={styles.chapterTitle}>{chapterTitle}</h2>
      <EditorContent editor={editor} />
    </article>
  );
}
