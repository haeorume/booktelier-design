"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChapterHead } from "@/components/ChapterHead";
import { ManuscriptEditor, type ChangeSource, type EditorHandle, type MarkClick } from "@/components/editor/ManuscriptEditor";
import type { PickedText } from "@/components/editor/selection";
import { ComposeDialog, type ComposeKind } from "@/components/review/ComposeDialog";
import { ReviewPanel, type ReviewPanelHandle } from "@/components/review/ReviewPanel";
import { SendDialog } from "@/components/review/SendDialog";
import { SharedTab } from "@/components/review/SharedTab";
import { usePanelLayout } from "@/components/hooks";
import { LayoutPanel } from "@/components/LayoutPanel";
import { SnapshotDialog } from "@/components/SnapshotDialog";
import { bookDeps, hasProjectEvent, type ChapterInfo, type Ctx, type PresentPerson } from "@/data";
import type { LayoutChange } from "@/domain/layout";
import { can } from "@/domain/permissions";
import { nextChapterStatus, type ChapterAction } from "@/domain/transitions";
import { track } from "@/events";
import type { AiSuggestion, Chapter, ChapterDoc, Layout, Participant, Project, Snapshot } from "@/types";
import { NOT_SAVED, useAiSuggestions } from "./useAiSuggestions";
import { SAVE_LABEL, useManuscriptSave } from "./useManuscriptSave";
import { useLive } from "./useLive";
import { useShared } from "./useShared";
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
  /** 이 장 안에서 다른 사람의 작업 위치로 간다(FR-47 ②) */
  jump: { paragraphId: string; n: number } | null;
  layoutOpen: boolean;
  onLayoutOpenChange: (open: boolean) => void;
  snapshotsOpen: boolean;
  onSnapshotsClose: () => void;
  /** 저장하려던 원고가 그사이 다른 곳에서 바뀌었다(409). 최신 원고로 다시 그린다(C-4). */
  onConflict: () => void;
}

/**
 * 한 장의 지면과 검토 패널. 원고 저장(useManuscriptSave), 내 AI 제안(useAiSuggestions),
 * 함께 봄(useShared)을 이어 붙인다(리뷰 R-3). 보내기 전 AI 제안은 주인 것만 온다(FR-23, D-29).
 */
export function ChapterWorkspace(props: Props) {
  const { project, chapter, me, participants, onChapterChange, onProjectChange, onChapters, onPresence, jump, layoutOpen, onLayoutOpenChange, snapshotsOpen, onSnapshotsClose, onConflict } = props;
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
    if (click.kind === "suggestion") {
      panel.current?.reveal(click.ids); // AI 제안 탭을 열고 가리는 거르기를 푼다(N-07)
      setSelected(click.ids);
    } else {
      panel.current?.revealShared();
      selectShared(click.id);
    }
  }

  const { saveState } = save;
  return (
    <>
      <div className={styles.desk}>
        <ManuscriptEditor
          ref={editor}
          initialDoc={chapter.doc}
          // 서버가 원고를 바꾸는 요청을 기다리는 동안은 입력을 막는다(serverEdit).
          editable={editable && !save.locked}
          templateId={project.template_id}
          layout={previewLayout ?? project.layout}
          chapterTitle={chapter.title}
          header={
            <>
              <ChapterHead
                chapter={chapter}
                role={me.role}
                busy={chapterBusy}
                onRequestReview={() => void changeChapter("request_review")}
                onCompleteReview={() => void changeChapter("complete_review")}
              />
              {editable && (
                <p className={styles.saveState} role="status" data-testid="save-state" data-state={saveState}>
                  {SAVE_LABEL[saveState]}
                  {(saveState === "failed" || saveState === "offline") && (
                    <button type="button" onClick={save.retrySave}>
                      다시 시도
                    </button>
                  )}
                </p>
              )}
            </>
          }
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
      </div>
      {/*
        오른쪽 패널(D-10, N-15). 하나씩(A안, 기본): 조판 설정을 열면 검토 패널이 닫힌다.
        나란히(B안): 둘을 함께 연다. 하나씩일 때도 검토 패널은 숨기기만 해서 보던 탭과 거르기가 남는다.
      */}
      <div className={styles.reviewSlot} hidden={layoutOpen && panelLayout === "single"} data-testid="review-slot">
        <ReviewPanel
          ref={panel}
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
          onKeep={(s) => void ai.keep(s)}
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
