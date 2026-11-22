"use client";

import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode, type Ref, type RefObject } from "react";
import { changedParagraphIndexes } from "@/domain/live";
import { pageCount, pageGeometry, pageMarks, sheetHeight, type PageMark } from "@/domain/pages";
import { pageStyleVars } from "@/domain/templates";
import type { UnderlineSpan } from "@/domain/underlines";
import { changedParagraphs, paragraphTexts } from "@/workspace/suggestions";
import { parseChapterDoc, type ChapterDoc, type Layout, type TemplateId } from "@/types";
import { PageGuides } from "./PageGuides";
import { ParagraphWithId } from "./paragraph-id";
import { selectionToAnchor, type PickedText } from "./selection";
import { AiUnderlines, toDocRange, underlineKey, type CommentMark, type EditMark } from "./underline-plugin";
import styles from "./ManuscriptEditor.module.css";

export type ChangeSource = "typing" | "program";

export interface EditorHandle {
  /** 문단 한 곳의 글자를 바꾼다(적용·실행 취소·수락). 자리가 맞지 않으면 false. */
  replaceText(paragraphId: string, start: number, end: number, text: string): boolean;
  /**
   * 다른 곳에서 바뀐 원고로 바꾼다(F4, A-31). 바뀐 문단만 갈아 끼워 커서와 고른 글자가 그대로 남는다.
   * 되돌리기 기록에 넣지 않는다. 입력 중일 때 부르지 않는 것은 부르는 쪽이 한다(useLive).
   */
  syncDoc(next: ChapterDoc): boolean;
  /** 커서나 고른 글자가 있는 문단 id(작업 위치, FR-47). 없으면 null. */
  currentParagraphId(): string | null;
  /** 한글 등을 조합하는 중인지. 이때 받은 원고로 바꾸면 조합 중인 글자가 깨진다(FR-18 ④). */
  isComposing(): boolean;
  /** 그 문단으로 지면을 움직인다(작업 위치로 가기). 없으면 false. */
  scrollToParagraph(paragraphId: string): boolean;
  /** 메뉴·서식 막대의 실행 취소·다시 실행(작가만, 편집기 되돌리기 기록) */
  undo(): boolean;
  redo(): boolean;
}

export type MarkClick = { kind: "suggestion"; ids: string[] } | { kind: "edit"; id: string } | { kind: "comment"; id: string };

interface Props {
  ref?: Ref<EditorHandle>;
  initialDoc: ChapterDoc;
  editable: boolean;
  templateId: TemplateId;
  layout: Layout;
  chapterTitle: string;
  /** 장 머리의 눈썹 글자 'CHAPTER 01'(DESIGN.md 4장) */
  chapterOrder: number;
  /** 머리말에 찍는 책 제목(FR-44) */
  bookTitle: string;
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
  /** 여백 안내선(시안 .page-guides). 본문 단의 둘레를 엷은 주황 선과 네 모서리로 보여 줘요. */
  guides?: boolean;
  /** 지면 배율(책상 폭에 맞춤 × 상태 줄의 %). 1이면 실제 크기 */
  zoom?: number;
}

const PROGRAM = "booktelier-program-change";

/**
 * 지면 편집기(WS-30, WS-32). 템플릿 CSS 변수를 입힌 책 모양 지면이 곧 편집 화면이다.
 * 글자 서식 도구는 없다(D-13). 작가가 아니면 읽기 전용이다(FR-09 ④). 읽기 전용이어도 글자는 고를 수 있다(의견).
 */
export function ManuscriptEditor(props: Props) {
  const { ref, initialDoc, editable, templateId, layout, chapterTitle, chapterOrder, bookTitle, spans, edits, comments, selected, selectionMenu, guides = false, zoom = 1 } = props;
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

  // 편집기는 브라우저에서 늦게 그려져서(immediatelyRender: false) 그려진 뒤에 원고 높이를 재요.
  const pages = usePages(page, layout, { book: bookTitle, chapter: chapterTitle }, editor !== null);

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
      syncDoc(next) {
        if (!editor) return false;
        let current: ChapterDoc;
        try {
          current = parseChapterDoc(editor.getJSON());
        } catch {
          return false;
        }
        const { schema } = editor;
        const tr = editor.state.tr;
        const changed = changedParagraphIndexes(current, next);
        if (changed) {
          if (changed.length === 0) return true;
          const starts: number[] = [];
          editor.state.doc.forEach((_node, offset) => starts.push(offset));
          // 뒤에서부터 바꿔야 앞 문단의 자리가 밀리지 않는다.
          for (const i of [...changed].reverse()) {
            tr.replaceWith(starts[i], starts[i] + editor.state.doc.child(i).nodeSize, schema.nodeFromJSON(next.content[i]));
          }
        } else {
          // 문단이 늘거나 줄었다. 통째로 바꾸고 커서를 같은 문단의 같은 자리로 돌려놓는다.
          const { $from } = editor.state.selection;
          const keepId = $from.depth >= 1 ? ($from.node(1).attrs.id as string | null) : null;
          const offset = $from.parentOffset;
          tr.replaceWith(0, editor.state.doc.content.size, Fragment.fromArray(next.content.map((p) => schema.nodeFromJSON(p))));
          let restored = false;
          tr.doc.forEach((node, pos) => {
            if (restored || node.attrs.id !== keepId) return;
            tr.setSelection(TextSelection.create(tr.doc, pos + 1 + Math.min(offset, node.content.size)));
            restored = true;
          });
        }
        editor.view.dispatch(tr.setMeta(PROGRAM, true).setMeta("addToHistory", false));
        return true;
      },
      currentParagraphId() {
        if (!editor) return null;
        const node = window.getSelection()?.anchorNode;
        if (!node || !editor.view.dom.contains(node)) return null;
        const el = node instanceof HTMLElement ? node : node.parentElement;
        return el?.closest<HTMLElement>("[data-paragraph-id]")?.dataset.paragraphId ?? null;
      },
      isComposing() {
        return editor?.view.composing ?? false;
      },
      scrollToParagraph(paragraphId) {
        const el = page.current?.querySelector<HTMLElement>(`[data-paragraph-id="${CSS.escape(paragraphId)}"]`);
        if (!el) return false;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      },
      undo() {
        if (!editor || !editable) return false;
        return editor.chain().focus().undo().run();
      },
      redo() {
        if (!editor || !editable) return false;
        return editor.chain().focus().redo().run();
      },
    }),
    [editor, editable],
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
      // 지면에 배율(zoom)이 걸려 있으면 화면 좌표를 지면 안 좌표로 되돌려요(시안 11.22 맞춤 배율).
      const z = handlers.current.zoom ?? 1;
      setMenuAt({ top: (rect.bottom - base.top) / z + 6, left: Math.max(0, (rect.left - base.left) / z) });
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
      data-guides={guides}
      style={{ ...(pageStyleVars(templateId, layout) as CSSProperties), minHeight: pages ? `${pages.sheet}px` : undefined, zoom: zoom === 1 ? undefined : zoom }}
      onClick={(e) => clickMark(e.target)}
      onMouseUp={readSelection}
      // 선택을 넓히거나 옮기는 키뿐 아니라 글자를 치거나 지우는 키에도 선택을 다시 읽는다.
      onKeyUp={readSelection}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !editable && (e.target as HTMLElement).closest?.("[data-suggestion-ids]")) clickMark(e.target);
      }}
    >
      <div className={styles.reflowRow} role="status">
        {pages?.reflowing && (
          <span className={styles.reflowing} data-testid="reflowing">
            반영 중
          </span>
        )}
      </div>
      {/* 시안의 지면 머리(.running-title): 위 여백 안에 책 제목과 BOOKTELIER. 흐름 밖이라 쪽 나누기에 끼지 않아요. */}
      <div className={styles.runningTitle} aria-hidden="true">
        <span>{bookTitle}</span>
        <span>BOOKTELIER</span>
      </div>
      {guides && (
        <div className={styles.marginGuides} aria-hidden="true" data-testid="margin-guides">
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {/* 장 머리: 눈썹 글자 → 장 제목 → 짧은 주황 선(DESIGN.md 4장). 영문 눈썹 글자는 지면에만 써요. */}
      <header className={styles.chapterHead}>
        <p className={styles.eyebrow}>CHAPTER {String(chapterOrder).padStart(2, "0")}</p>
        <h2 className={styles.chapterTitle}>{chapterTitle}</h2>
        <span className={styles.rule} aria-hidden="true" />
      </header>
      <EditorContent editor={editor} />
      {pages && <PageGuides marks={pages.marks} sheet={pages.sheet} bottom={pages.bottom} />}
      {menuAt && selectionMenu && (
        <div className={styles.selectionMenu} style={{ top: menuAt.top, left: menuAt.left }} onMouseUp={(e) => e.stopPropagation()}>
          {selectionMenu}
        </div>
      )}
    </article>
  );
}

/** 다시 계산을 기다리는 시간. 그동안 '반영 중'이 보여요(FR-17 ②, L-43). */
const REFLOW_MS = 250;

interface Pages {
  marks: PageMark[];
  sheet: number;
  bottom: number;
  reflowing: boolean;
}

/**
 * 쪽 나누기(FR-17 ①②). 원고 높이가 바뀌거나 조판 값이 바뀌면 잠깐 '반영 중'을 띄우고 쪽 경계를 다시 계산해요.
 * 본문 높이는 편집기(.prose)의 아래 끝으로 재요. 지면 높이(min-height)는 쪽 수에 맞춰 늘어나므로 지면 높이로 재지 않아요.
 */
function usePages(page: RefObject<HTMLElement | null>, layout: Layout, titles: { book: string; chapter: string }, ready: boolean): Pages | null {
  const [state, setState] = useState<{ count: number; reflowing: boolean }>({ count: 1, reflowing: false });
  const geometry = pageGeometry(layout);

  useEffect(() => {
    const el = page.current;
    const g = pageGeometry(layout);
    if (!el || !g || !ready) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      const prose = el.querySelector<HTMLElement>("[data-testid='manuscript']");
      const bottom = prose ? prose.offsetTop + prose.offsetHeight : 0;
      setState({ count: pageCount(bottom, g), reflowing: false });
    };
    const schedule = () => {
      setState((s) => (s.reflowing ? s : { ...s, reflowing: true }));
      if (timer) clearTimeout(timer);
      timer = setTimeout(measure, REFLOW_MS);
    };
    measure();
    const prose = el.querySelector<HTMLElement>("[data-testid='manuscript']");
    const observer = new ResizeObserver(schedule);
    if (prose) observer.observe(prose);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
    // 조판 값(판형·여백·글자 크기)이 바뀌면 다시 재요. 글 높이 변화는 ResizeObserver가 잡아요.
  }, [page, layout, ready]);

  if (!geometry) return null;
  return {
    marks: pageMarks(state.count, geometry, layout, titles),
    sheet: sheetHeight(state.count, geometry),
    bottom: geometry.bottom,
    reflowing: state.reflowing,
  };
}
