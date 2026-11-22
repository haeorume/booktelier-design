"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChapterActions, ChapterStatus } from "@/components/ChapterHead";
import { FormatToolbar, MenuBar, Ruler, StatusBar, WorkHeader, type Density, type Menu } from "@/components/workspace/Chrome";
import { ManuscriptEditor, type ChangeSource, type EditorHandle, type MarkClick } from "@/components/editor/ManuscriptEditor";
import type { PickedText } from "@/components/editor/selection";
import { ComposeDialog, type ComposeKind } from "@/components/review/ComposeDialog";
import { ReviewPanel, type ReviewPanelHandle } from "@/components/review/ReviewPanel";
import { SendDialog } from "@/components/review/SendDialog";
import { SharedTab } from "@/components/review/SharedTab";
import { StyleRulesTab } from "@/components/review/StyleRulesTab";
import { usePanelLayout } from "@/components/hooks";
import { LayoutPanel } from "@/components/LayoutPanel";
import { SnapshotDialog } from "@/components/SnapshotDialog";
import { bookDeps, getClientSession, hasProjectEvent, type ChapterInfo, type Ctx, type PresentPerson } from "@/data";
import type { LayoutChange } from "@/domain/layout";
import { parseTrim } from "@/domain/templates";
import { can } from "@/domain/permissions";
import { nextChapterStatus, type ChapterAction } from "@/domain/transitions";
import { track } from "@/events";
import type { AiSuggestion, Chapter, ChapterDoc, Layout, Participant, Project, Snapshot } from "@/types";
import { NOT_SAVED, useAiSuggestions } from "./useAiSuggestions";
import { SAVE_LABEL, useManuscriptSave } from "./useManuscriptSave";
import { useLive } from "./useLive";
import { useShared } from "./useShared";
import { useStyleRules } from "./useStyleRules";
import styles from "./page.module.css";

interface Props {
  project: Project;
  chapter: Chapter;
  me: Participant;
  participants: Participant[];
  onChapterChange: (chapter: ChapterInfo) => void;
  onProjectChange: (project: Project) => void;
  /** 다른 곳에서 장이 더해지거나 상태가 바뀌었다(F4, A-31) */
  onChapters: (changed: ChapterInfo[]) => void;
  /** 지금 이 책을 연 다른 사람(F4, A-31) */
  onPresence: (people: PresentPerson[]) => void;
  /** 상단 바의 자리. 저장 상태를 여기 그려요(DESIGN.md 3장) */
  slots: { save: HTMLElement | null };
  /** 이 장 안에서 다른 사람의 작업 위치로 간다(FR-47 ②) */
  jump: { paragraphId: string; n: number } | null;
  layoutOpen: boolean;
  onLayoutOpenChange: (open: boolean) => void;
  /** 검토 패널을 접었는지. 접어도 숨기기만 해서 보던 탭과 거르기가 남아요. */
  panelCollapsed: boolean;
  /** 지면의 밑줄·의견을 누르면 접힌 패널을 다시 펴요 */
  onPanelReveal: () => void;
  snapshotsOpen: boolean;
  onSnapshotsOpen: () => void;
  onSnapshotsClose: () => void;
  /** 시안 둘레: 메뉴·서식 막대 보기, 원고 구조 보기, 집중해서 보기 */
  toolsOpen: boolean;
  onToolsOpenChange: (open: boolean) => void;
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  onPanelToggle: () => void;
  onPreview: () => void;
  /** 원고 구조·상단 바가 검토 패널 탭을 열고 원고를 내려받게 이어 줘요 */
  commandsRef: { current: WorkspaceCommands | null };
  onSharedCount: (n: number) => void;
  /** 저장하려던 원고가 그사이 다른 곳에서 바뀌었다(409). 최신 원고로 다시 그린다(C-4). */
  onConflict: () => void;
}

/** 지면 둘레 책상 여백(시안 .page-space 좌우 27px) */
const DESK_GUTTER = 27;

/**
 * 한 장의 지면과 검토 패널. 원고 저장(useManuscriptSave), 내 AI 제안(useAiSuggestions),
 * 함께 봄(useShared)을 이어 붙인다(리뷰 R-3). 보내기 전 AI 제안은 주인 것만 온다(FR-23, D-29).
 */
export interface WorkspaceCommands {
  openShared(): void;
  openRules(): void;
  exportText(): void;
}

export function ChapterWorkspace(props: Props) {
  const { project, chapter, me, participants, onChapterChange, onProjectChange, onChapters, onPresence, jump, slots, layoutOpen, onLayoutOpenChange, panelCollapsed, onPanelReveal, snapshotsOpen, onSnapshotsOpen, onSnapshotsClose, onConflict } = props;
  const { toolsOpen, onToolsOpenChange, navOpen, onNavOpenChange, onPanelToggle, onPreview, commandsRef, onSharedCount } = props;
  const panelLayout = usePanelLayout();
  const deps = useMemo(() => bookDeps(), []);
  const ctx: Ctx = useMemo(
    () => ({ projectId: project.id, chapterId: chapter.id, viewer: { participant_id: me.id, role: me.role } }),
    [project.id, chapter.id, me.id, me.role],
  );
  const editable = can(me.role, "edit_manuscript");

  const [doc, setDoc] = useState<ChapterDoc>(chapter.doc);
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState<AiSuggestion | null>(null);
  const [picked, setPicked] = useState<PickedText | null>(null);
  const [composing, setComposing] = useState<{ kind: ComposeKind; picked: PickedText } | null>(null);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<Layout | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const editor = useRef<EditorHandle>(null);
  /* 시안 둘레의 화면 상태(이 브라우저에서만, 저장하지 않음) */
  const [density, setDensity] = useState<Density>("detail");
  const [headerOpen, setHeaderOpen] = useState(true);
  const [guides, setGuides] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [deskWidth, setDeskWidth] = useState(0);
  const desk = useRef<HTMLDivElement>(null);
  const panel = useRef<ReviewPanelHandle>(null);
  const firstEditChecked = useRef(false);

  const redraw = useCallback((next: ChapterDoc) => editor.current?.syncDoc(next) ?? false, []);
  const save = useManuscriptSave({ deps, projectId: project.id, chapterId: chapter.id, initialDoc: chapter.doc, initialVersion: chapter.version, editable, onConflict, redraw });

  const firstEdit = useCallback(
    async (via: "direct" | "apply" | "accept") => {
      if (firstEditChecked.current || me.role !== "author") return;
      firstEditChecked.current = true;
      if (!(await hasProjectEvent(deps, project.id, "first_edit"))) track("first_edit", { via });
    },
    [deps, project.id, me.role],
  );

  const onHandled = useCallback((id: string) => setSelected((ids) => ids.filter((x) => x !== id)), []);
  const ai = useAiSuggestions({
    deps,
    ctx,
    me,
    editable,
    doc,
    save,
    editor,
    onConflict,
    onFirstEdit: (via) => void firstEdit(via),
    onHandled,
  });
  const shared = useShared({ deps, ctx, doc, participants, save, onConflict });
  const styleRules = useStyleRules(deps, ctx);
  const { reconcile, rememberApplied, setNotice, markChanged } = ai;
  const { relocate } = shared;

  // 함께 작업(F4): 내 위치 알리기와 바뀐 것 받기(A-30·31, D-31)
  useLive({ deps, project, chapterId: chapter.id, editor, save, reloadShared: shared.reload, onChapters, onProjectChange, onPresence, onConflict });

  // 작업 위치로 가기(FR-47 ②). 같은 장이면 jump로, 다른 장에서 왔으면 주소의 #para=로 문단을 받는다.
  // 편집기가 아직 그려지지 않았을 수 있어 잠깐 동안 다시 시도한다.
  useEffect(() => {
    let target = jump?.paragraphId ?? null;
    if (!jump && window.location.hash.startsWith("#para=")) {
      target = decodeURIComponent(window.location.hash.slice("#para=".length));
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    if (!target) return;
    const id = target;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (editor.current?.scrollToParagraph(id) || ++tries > 20) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [jump]);

  const onDocChange = useCallback(
    (next: ChapterDoc, changed: string[], source: ChangeSource) => {
      setDoc(next);
      // 서버가 이미 저장한 변경(적용·실행 취소·수락)이면 다시 저장하지 않는다(D-30).
      const fromServer = save.onEdited(next);
      void reconcile(next);
      void relocate(next); // 의견·수정 제안의 자리도 원문으로 다시 찾는다(NFR-05)
      if (!fromServer && source === "typing" && changed.length > 0) {
        rememberApplied(null);
        setNotice(null);
        markChanged(changed);
        void firstEdit("direct");
      }
    },
    [save, reconcile, relocate, rememberApplied, setNotice, markChanged, firstEdit],
  );

  /** 장 상태 바꾸기(FR-13, FR-14). 원고를 먼저 저장하고 상태만 보낸다(A-14, 리뷰 B-4). */
  async function changeChapter(action: ChapterAction) {
    setChapterBusy(true);
    try {
      if (!(await save.ensureSaved())) {
        setNotice(NOT_SAVED);
        return;
      }
      const to = nextChapterStatus(chapter.status, action);
      if (!to) return;
      const next = await deps.library.changeChapterStatus(project.id, chapter.id, to);
      onChapterChange(next);
      if (action === "request_review") track("review_requested");
      if (action === "complete_review") track("review_completed", { pending_edits: shared.items.filter((i) => i.kind === "edit" && i.edit.status === "pending").length });
    } finally {
      setChapterBusy(false);
    }
  }

  async function submitCompose(text: string, extra: { reason: string | null; kind: AiSuggestion["kind"] | null }) {
    if (!composing) return;
    const { kind, picked: p } = composing;
    if (kind === "comment") await shared.addComment(p.anchor, p.text, text);
    else await shared.addEdit(p.anchor, p.text, text, extra.reason, extra.kind);
    setComposing(null);
    setPicked(null);
    window.getSelection()?.removeAllRanges();
  }

  function selectShared(id: string) {
    setSelected([id]);
    shared.markSeen(id);
  }

  // 조판 설정과 검토본 --------------------------------------------------------

  /** 조판 값 저장(FR-16). 손을 떼거나 값을 고를 때 한 번 부른다(정할 것 15). */
  async function commitLayout(change: LayoutChange) {
    const saved = await deps.library.updateLayout(project.id, change, me);
    setPreviewLayout(null);
    onProjectChange(saved);
    track("layout_changed", { field: change.field, before: change.before, after: change.after, reset_to_default: change.reset_to_default });
  }

  // 검토본 창을 열면 이 장의 검토본을 읽는다.
  useEffect(() => {
    if (!snapshotsOpen) return;
    let alive = true;
    deps.library.listSnapshots(project.id, chapter.id).then((list) => alive && setSnapshots(list));
    return () => {
      alive = false;
    };
  }, [snapshotsOpen, deps, project.id, chapter.id]);

  /** 검토본 저장(FR-38). 저장 중인 원고까지 저장한 뒤 그때의 원고를 남긴다. */
  async function storeSnapshot(label: string) {
    if (!(await save.ensureSaved())) throw new Error(NOT_SAVED);
    await deps.library.createSnapshot(project.id, chapter.id, label);
    setSnapshots(await deps.library.listSnapshots(project.id, chapter.id));
    track("snapshot_saved");
  }

  function onMarkClick(click: MarkClick) {
    // 하나씩 배치에서는 지면 표시를 누르면 검토 패널로 돌아온다(N-15 A안).
    if (panelLayout === "single") onLayoutOpenChange(false);
    onPanelReveal(); // 접어 둔 검토 패널도 펴서 고른 카드를 보여 줘요
    if (click.kind === "suggestion") {
      panel.current?.reveal(click.ids); // AI 제안 탭을 열고 가리는 거르기를 푼다(N-07)
      setSelected(click.ids);
    } else {
      panel.current?.revealShared();
      selectShared(click.id);
    }
  }

  const { saveState } = save;

  // 책상 폭을 재서 지면이 다 들어가게 줄여요(1280px·나란히에서도 잘리지 않게, QA-49). 상태 줄의 %는 그 위에 곱해요.
  useEffect(() => {
    const el = desk.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setDeskWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const activeLayout = previewLayout ?? project.layout;
  const trimMm = parseTrim(activeLayout.trim)?.width ?? 148;
  const pagePx = (trimMm * 96) / 25.4;
  const fit = deskWidth > 0 ? Math.min(1, (deskWidth - DESK_GUTTER * 2) / pagePx) : 1;
  const scale = Math.max(0.3, (zoom / 100) * fit);
  const chars = doc.content.reduce((n, p) => n + (p.content ?? []).reduce((m, t) => m + t.text.length, 0), 0);

  useEffect(() => onSharedCount(shared.pendingCount), [onSharedCount, shared.pendingCount]);

  function exportText() {
    const text = [chapter.title, "", ...doc.content.map((p) => (p.content ?? []).map((t) => t.text).join(""))].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title} - ${chapter.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    commandsRef.current = {
      openShared: () => {
        if (panelLayout === "single") onLayoutOpenChange(false);
        onPanelReveal();
        panel.current?.revealShared();
      },
      openRules: () => {
        if (panelLayout === "single") onLayoutOpenChange(false);
        onPanelReveal();
        panel.current?.revealRules?.();
      },
      exportText,
    };
  });

  function undo() {
    if (ai.lastAppliedRef.current) void ai.undo();
    else editor.current?.undo();
  }

  const canEdit = editable && !save.locked;
  const pickComment = picked && can(me.role, "create_comment") ? () => setComposing({ kind: "comment", picked }) : undefined;
  const pickEdit = picked && can(me.role, "create_suggested_edit") ? () => setComposing({ kind: "suggested_edit", picked }) : undefined;
  const runReview = can(me.role, "run_chapter_review")
    ? () => {
        if (panelLayout === "single") onLayoutOpenChange(false);
        onPanelReveal();
        void ai.runReview();
      }
    : undefined;
  const menus: Menu[] = [
    {
      label: "파일",
      items: [
        { kind: "action", label: "미리보기", icon: "book", onSelect: onPreview },
        ...(can(me.role, "view_snapshots") ? [{ kind: "action" as const, label: "검토본 열기", icon: "history" as const, onSelect: onSnapshotsOpen }] : []),
        { kind: "line" },
        { kind: "action", label: "지금 장 내보내기 TXT", icon: "download", onSelect: exportText },
        { kind: "action", label: "인쇄 / PDF 저장", icon: "doc" },
      ],
    },
    {
      label: "편집",
      items: [
        { kind: "action", label: "되돌리기", icon: "undo", hint: "Ctrl Z", onSelect: canEdit ? undo : undefined },
        { kind: "action", label: "다시 하기", icon: "redo", hint: "Ctrl Shift Z", onSelect: canEdit ? () => editor.current?.redo() : undefined },
        { kind: "line" },
        { kind: "action", label: "찾기·바꾸기", icon: "search" },
        { kind: "action", label: "선택 문장에 의견", icon: "comment", onSelect: pickComment },
      ],
    },
    {
      label: "삽입",
      items: [
        { kind: "action", label: "이미지", icon: "image" },
        { kind: "action", label: "표", icon: "grid" },
        { kind: "action", label: "인용문", icon: "quote" },
        { kind: "action", label: "구분선", icon: "minimize" },
      ],
    },
    {
      label: "서식",
      items: [
        { kind: "caption", label: "서식 막대" },
        { kind: "check", label: "간단(막대 숨김)", checked: density === "simple", onToggle: () => setDensity("simple") },
        { kind: "check", label: "기본(한 줄)", checked: density === "basic", onToggle: () => setDensity("basic") },
        { kind: "check", label: "상세(두 줄)", checked: density === "detail", onToggle: () => setDensity("detail") },
      ],
    },
    {
      label: "검토",
      items: [
        { kind: "action", label: "장 검토 실행", icon: "spark", onSelect: runReview },
        { kind: "action", label: "선택한 원문에 수정 제안", icon: "track", onSelect: pickEdit },
        { kind: "action", label: "편집 의견 남기기", icon: "comment", onSelect: pickComment },
        { kind: "line" },
        { kind: "action", label: "의견과 적용 기록", icon: "history", onSelect: () => commandsRef.current?.openShared() },
        { kind: "action", label: "표기 원칙", icon: "check", onSelect: () => commandsRef.current?.openRules() },
      ],
    },
    {
      label: "보기",
      items: [
        { kind: "caption", label: "패널 표시" },
        { kind: "check", label: "왼쪽 탐색 패널", checked: navOpen, onToggle: () => onNavOpenChange(!navOpen) },
        { kind: "check", label: "상단 작업 도구", checked: toolsOpen, onToggle: () => onToolsOpenChange(!toolsOpen) },
        { kind: "check", label: "오른쪽 작업 패널", checked: !panelCollapsed, onToggle: onPanelToggle },
        { kind: "check", label: "조판 안내선", checked: guides, onToggle: () => setGuides((g) => !g) },
        { kind: "line" },
        {
          kind: "action",
          label: "밝게 · 어둡게 바꾸기",
          icon: "focus",
          onSelect: () => {
            // 지금 보이는 테마의 반대로(테마 스위치와 같은 판단: 고른 값, 없으면 컴퓨터 설정)
            const chosen = document.documentElement.dataset.theme;
            const dark = chosen ? chosen === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
            getClientSession().setTheme(dark ? "light" : "dark");
          },
        },
      ],
    },
    {
      label: "도움말",
      items: [
        { kind: "action", label: "되돌리기 Ctrl Z · 다시 하기 Ctrl Shift Z", icon: "info" },
        { kind: "action", label: "글을 고르면 의견·수정 제안 메뉴가 떠요", icon: "comment" },
      ],
    },
  ];
  const focus = !navOpen && panelCollapsed && !toolsOpen;

  return (
    <>
      {/* 저장 상태는 상단 바에, 장 상태·검토 요청·검토 완료는 작업 머리에 그려요(시안 11.22, WS-31·WS-14). */}
      {slots.save &&
        editable &&
        createPortal(
          <p className={styles.saveState} role="status" data-testid="save-state" data-state={saveState}>
            {SAVE_LABEL[saveState]}
            {(saveState === "failed" || saveState === "offline") && (
              <button type="button" onClick={save.retrySave}>
                다시 시도
              </button>
            )}
          </p>,
          slots.save,
        )}
      <div className={styles.main}>
        {toolsOpen && (
          <MenuBar
            menus={menus}
            focus={focus}
            onFocusMode={() => {
              // 집중해서 보기: 원고 구조·도구·검토 패널을 한 번에 접고, 다시 누르면 모두 펴요
              onNavOpenChange(focus);
              onToolsOpenChange(focus);
              if (focus === panelCollapsed) onPanelToggle();
            }}
          />
        )}
        {headerOpen && (
          <WorkHeader
            role={me.role}
            chapterOrder={chapter.order}
            chapterTitle={chapter.title}
            status={<ChapterStatus chapter={chapter} />}
            actions={
              <ChapterActions
                chapter={chapter}
                role={me.role}
                busy={chapterBusy}
                onRequestReview={() => void changeChapter("request_review")}
                onCompleteReview={() => void changeChapter("complete_review")}
                onSnapshots={can(me.role, "view_snapshots") ? onSnapshotsOpen : undefined}
              />
            }
            layoutOpen={layoutOpen}
            onMode={(mode) => onLayoutOpenChange(mode === "layout")}
            density={density}
            onDensity={setDensity}
            onCollapse={() => setHeaderOpen(false)}
          />
        )}
        {toolsOpen && (
          <FormatToolbar
            density={density}
            canEdit={canEdit}
            onUndo={undo}
            onRedo={() => editor.current?.redo()}
            onSuggest={pickEdit}
            onComment={pickComment}
            onAi={runReview}
            guides={guides}
            onGuides={() => setGuides((g) => !g)}
            onCompare={can(me.role, "view_snapshots") ? onSnapshotsOpen : undefined}
          />
        )}
        <div className={styles.desk} ref={desk} data-testid="desk">
          {!headerOpen && (
            <button type="button" className={styles.headerReveal} onClick={() => setHeaderOpen(true)}>
              작업 머리 펴기
            </button>
          )}
          <Ruler widthMm={trimMm} scale={scale} />
        <ManuscriptEditor
          zoom={scale}
          guides={guides}
          ref={editor}
          initialDoc={chapter.doc}
          // 서버가 원고를 바꾸는 요청을 기다리는 동안은 입력을 막는다(serverEdit).
          editable={editable && !save.locked}
          templateId={project.template_id}
          layout={activeLayout}
          chapterTitle={chapter.title}
          chapterOrder={chapter.order}
          bookTitle={project.title}
          spans={ai.spans}
          edits={shared.editMarks}
          comments={shared.commentMarks}
          selected={selected}
          onDocChange={onDocChange}
          onMarkClick={onMarkClick}
          onPick={setPicked}
          selectionMenu={
            picked && (
              <>
                {can(me.role, "create_comment") && (
                  <button type="button" onClick={() => setComposing({ kind: "comment", picked })}>
                    의견 남기기
                  </button>
                )}
                {can(me.role, "create_suggested_edit") && (
                  <button type="button" onClick={() => setComposing({ kind: "suggested_edit", picked })}>
                    수정 제안하기
                  </button>
                )}
              </>
            )
          }
          onUndoShortcut={() => {
            // 적용 직후면 Ctrl/Cmd+Z가 원고와 제안을 함께 되돌린다(G-11). 아니면 편집기 되돌리기.
            if (!ai.lastAppliedRef.current) return false;
            void ai.undo();
            return true;
          }}
        />
          <p className={styles.caption} aria-hidden="true">
            <i />
            문장에 집중하는 시간
            <i />
          </p>
        </div>
        <StatusBar mode={me.role === "designer" ? "Layout" : "Edit"} chars={chars} zoom={zoom} onZoom={setZoom} onPreview={onPreview} />
      </div>
      {/*
        오른쪽 패널(D-10, N-15). 하나씩(A안, 기본): 조판 설정을 열면 검토 패널이 닫힌다.
        나란히(B안): 둘을 함께 연다. 하나씩일 때도 검토 패널은 숨기기만 해서 보던 탭과 거르기가 남는다.
      */}
      <div className={styles.reviewSlot} hidden={panelCollapsed || (layoutOpen && panelLayout === "single")} data-testid="review-slot">
        <ReviewPanel
          ref={panel}
          chapterTitle={chapter.title}
          onOpenLayout={() => onLayoutOpenChange(true)}
          onClose={onPanelToggle}
          role={me.role}
          suggestions={ai.placement.placed.map((p) => p.suggestion)}
          sent={ai.sent}
          selected={selected}
          status={ai.status}
          review={ai.review}
          notice={ai.notice}
          canUndo={ai.lastApplied !== null}
          busy={ai.busy}
          sharedCount={shared.pendingCount}
          shared={
            <SharedTab
              role={me.role}
              me={me.id}
              items={shared.items}
              participants={shared.byId}
              selected={selected}
              unseen={shared.unseen}
              busy={ai.busy}
              notice={shared.notice}
              onSelect={selectShared}
              onAccept={(edit) =>
                void shared
                  .accept(edit, (a, text) => editor.current?.replaceText(a.paragraph_id, a.start, a.end, text) ?? false)
                  // 수락으로 원고가 처음 바뀌었어도 first_edit를 남긴다(정할 것 8: 원고를 처음 바꾼 순간).
                  .then((ok) => {
                    if (ok) void firstEdit("accept");
                  })
              }
              onReject={(edit) => void shared.reject(edit)}
              onReply={(parent, body) => shared.addComment(parent.anchor, parent.original, body, parent)}
              onResolve={(c, resolved) => void shared.setResolved(c, resolved)}
            />
          }
          onRunReview={() => void ai.runReview()}
          onRetry={() => void ai.retry()}
          onUndo={() => void ai.undo()}
          onSelect={setSelected}
          onApply={(s, text, choice) => void ai.apply(s, text, choice)}
          onDismiss={(s) => void ai.dismiss(s)}
          onKeep={(s) => void ai.keep(s).then(() => styleRules.reload())}
          rulesCount={styleRules.rules.length}
          onOpenRules={() => void styleRules.reload()}
          rules={<StyleRulesTab rules={styleRules.rules} failed={styleRules.failed} participants={shared.byId} onAdd={styleRules.add} />}
          onSend={setSending}
        />
      </div>
      {layoutOpen && (
        <LayoutPanel
          key={project.template_id}
          project={project}
          role={me.role}
          participants={shared.byId}
          onPreview={setPreviewLayout}
          onCommit={(change) => void commitLayout(change)}
          onClose={() => {
            setPreviewLayout(null);
            onLayoutOpenChange(false);
          }}
        />
      )}
      {snapshotsOpen && (
        <SnapshotDialog
          bookTitle={project.title}
          chapterTitle={chapter.title}
          role={me.role}
          snapshots={snapshots}
          participants={shared.byId}
          onSave={storeSnapshot}
          onOpen={async (s) => (await deps.library.getSnapshot(project.id, s.id)) ?? s}
          onClose={onSnapshotsClose}
        />
      )}
      {sending && (
        <SendDialog
          suggestion={sending}
          onSend={async (input) => {
            await ai.send(sending, input);
            await shared.reload();
            setSending(null);
          }}
          onClose={() => setSending(null)}
        />
      )}
      {composing && <ComposeDialog kind={composing.kind} quote={composing.picked.text} onSubmit={submitCompose} onClose={() => setComposing(null)} />}
    </>
  );
}
