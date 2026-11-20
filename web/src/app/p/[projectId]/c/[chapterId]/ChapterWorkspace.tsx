"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAiProvider } from "@/ai";
import { ChapterHead } from "@/components/ChapterHead";
import { ManuscriptEditor, type ChangeSource, type EditorHandle, type MarkClick } from "@/components/editor/ManuscriptEditor";
import type { PickedText } from "@/components/editor/selection";
import { ComposeDialog, type ComposeKind } from "@/components/review/ComposeDialog";
import { ReviewPanel, type ChapterReviewState, type ReviewPanelHandle } from "@/components/review/ReviewPanel";
import { SendDialog } from "@/components/review/SendDialog";
import { SharedTab } from "@/components/review/SharedTab";
import { ApiError, bookDeps, hasProjectEvent, NETWORK, sendAiSuggestion, VersionConflictError, type ChapterInfo, type SendMethod, type Viewer } from "@/data";
import { locate } from "@/domain/anchor";
import { KIND_ORDER } from "@/domain/labels";
import { can } from "@/domain/permissions";
import { nextChapterStatus, transitionAiSuggestion, type ChapterAction } from "@/domain/transitions";
import { mergeUnderlines } from "@/domain/underlines";
import { track } from "@/events";
import { createLiveCheck, type LiveCheck, type LiveCheckStatus } from "@/workspace/live-check";
import { appliedRange, canUndo, placeSuggestions, type LastApplied } from "@/workspace/suggestions";
import type { AiSuggestion, AiSuggestionKind, Chapter, ChapterDoc, Layout, Participant, Project, Snapshot } from "@/types";
import { usePanelLayout } from "@/components/hooks";
import { LayoutPanel } from "@/components/LayoutPanel";
import { SnapshotDialog } from "@/components/SnapshotDialog";
import type { LayoutChange } from "@/domain/layout";
import { useShared } from "./useShared";
import styles from "./page.module.css";

interface Props {
  project: Project;
  chapter: Chapter;
  me: Participant;
  participants: Participant[];
  onChapterChange: (chapter: ChapterInfo) => void;
  onProjectChange: (project: Project) => void;
  layoutOpen: boolean;
  onLayoutOpenChange: (open: boolean) => void;
  snapshotsOpen: boolean;
  onSnapshotsClose: () => void;
  /** 저장하려던 원고가 그사이 다른 곳에서 바뀌었다(409). 최신 원고로 다시 그린다(C-4). */
  onConflict: () => void;
}

/** 원고 저장 상태(L-42). */
type SaveState = "saved" | "saving" | "failed" | "offline";
const SAVE_LABEL: Record<SaveState, string> = { saved: "저장됨", saving: "저장 중", failed: "저장 실패", offline: "연결 끊김" };

const NOT_APPLIED = "원고가 먼저 바뀌어 이 제안은 적용하지 못했어요.";
const NOT_UNDONE = "원고가 바뀌어 실행 취소할 수 없어요.";
const NOT_SAVED = "원고를 저장하지 못해 진행하지 않았어요. 저장을 다시 시도해 주세요.";

function eventProps(s: AiSuggestion, role: string) {
  return { suggestion_id: s.id, role, kind: s.kind, source: s.source };
}

/**
 * 한 장의 지면과 검토 패널. 실시간 교정(FR-20), 밑줄(FR-25), 카드 동작(FR-27·28·30)을 잇는다.
 * 보내기 전 AI 제안은 data/ 가 주인 것만 돌려준다(FR-23, D-09).
 */
export function ChapterWorkspace(props: Props) {
  const { project, chapter, me, participants, onChapterChange, onProjectChange, layoutOpen, onLayoutOpenChange, snapshotsOpen, onSnapshotsClose, onConflict } = props;
  const panelLayout = usePanelLayout();
  const [previewLayout, setPreviewLayout] = useState<Layout | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const deps = useMemo(() => bookDeps(), []);
  const viewer: Viewer = useMemo(() => ({ participant_id: me.id, role: me.role }), [me.id, me.role]);
  const editable = can(me.role, "edit_manuscript");

  const [doc, setDoc] = useState<ChapterDoc>(chapter.doc);
  const [mine, setMine] = useState<AiSuggestion[]>([]);
  const [status, setStatus] = useState<LiveCheckStatus>("idle");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<LastApplied | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ChapterReviewState>({ kind: "idle" });
  const [sending, setSending] = useState<AiSuggestion | null>(null);
  const [picked, setPicked] = useState<PickedText | null>(null);
  const [composing, setComposing] = useState<{ kind: ComposeKind; picked: PickedText } | null>(null);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const editor = useRef<EditorHandle>(null);
  const panel = useRef<ReviewPanelHandle>(null);
  const lastAppliedRef = useRef<LastApplied | null>(null);
  const docRef = useRef(chapter.doc);
  const mineRef = useRef<AiSuggestion[]>([]);
  const version = useRef(chapter.version);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  /** 마지막 원고 저장이 성공했는지. 검토 요청·검토본 전에 본다(NFR-06). */
  const savedOk = useRef(true);
  const liveCheck = useRef<LiveCheck | null>(null);
  const shown = useRef(new Set<string>());
  const firstEditChecked = useRef(false);

  /** 실행 취소할 적용. Ctrl/Cmd+Z 처리에서 바로 읽으려고 ref에도 둔다. */
  const rememberApplied = useCallback((last: LastApplied | null) => {
    lastAppliedRef.current = last;
    setLastApplied(last);
  }, []);

  /** 화면의 제안 목록을 바꾼다. 비동기 작업이 늘 최신 목록을 보도록 ref도 함께 바꾼다. */
  const commit = useCallback((list: AiSuggestion[]) => {
    mineRef.current = list;
    setMine(list);
  }, []);
  const replaceOne = useCallback((s: AiSuggestion) => commit(mineRef.current.map((x) => (x.id === s.id ? s : x))), [commit]);

  const save = useCallback(
    async (s: AiSuggestion) => {
      const saved = await deps.repo.updateAiSuggestion(s, viewer);
      replaceOne(saved);
      return saved;
    },
    [deps, viewer, replaceOne],
  );

  /**
   * 지금 원고에 맞춰 대기 제안을 정리한다.
   * 원문이 사라진 제안은 바로 무효로(NFR-04, Q-15 잠정), 자리가 옮겨진 제안은 새 자리를 저장한다(NFR-05).
   * 저장하기 직전에 아직 대기인지 다시 본다. 그사이 적용·무시된 제안을 덮어쓰지 않으려는 것.
   */
  const reconcile = useCallback(
    async (docNow: ChapterDoc) => {
      const { placed, lost } = placeSuggestions(docNow, mineRef.current);
      const changes = [
        ...lost.map((s) => transitionAiSuggestion(s, "invalidate")),
        ...placed.filter((p) => p.relocated).map((p) => ({ ...p.suggestion, anchor: p.anchor })),
      ];
      for (const c of changes) {
        if (mineRef.current.find((x) => x.id === c.id)?.status !== "pending") continue;
        await save(c);
      }
    },
    [save],
  );

  const reload = useCallback(async () => {
    commit(await deps.repo.listAiSuggestions(chapter.id, viewer));
    await reconcile(docRef.current);
  }, [deps, chapter.id, viewer, commit, reconcile]);

  // 처음 열 때 내 AI 제안을 읽는다.
  useEffect(() => {
    let alive = true;
    deps.repo.listAiSuggestions(chapter.id, viewer).then(async (list) => {
      if (!alive) return;
      commit(list);
      await reconcile(docRef.current);
    });
    return () => {
      alive = false;
    };
  }, [deps, chapter.id, viewer, commit, reconcile]);

  // 실시간 교정은 원고를 고치는 작가에게만 돈다(D-18).
  useEffect(() => {
    if (!editable) return;
    const lc = createLiveCheck({
      provider: getAiProvider(),
      chapterId: chapter.id,
      requesterId: me.id,
      getText: (pid) => {
        const p = docRef.current.content.find((n) => n.attrs.id === pid);
        return p ? (p.content ?? []).map((t) => t.text).join("") : null;
      },
      getVersion: () => version.current,
      onStatus: setStatus,
      onSuggestions: async (found) => {
        await deps.repo.saveAiSuggestions(found);
        await reload();
      },
    });
    liveCheck.current = lc;
    return () => {
      lc.dispose();
      liveCheck.current = null;
    };
  }, [editable, deps, chapter.id, me.id, reload]);

  const placement = useMemo(() => placeSuggestions(doc, mine), [doc, mine]);
  const spans = useMemo(
    () => mergeUnderlines(placement.placed.map((p) => ({ id: p.suggestion.id, kind: p.suggestion.kind, anchor: p.anchor }))),
    [placement],
  );

  // 함께 봄: 의견과 수정 제안
  const shared = useShared({ deps, viewer, projectId: project.id, chapterId: chapter.id, doc, participants });
  const { relocate } = shared;

  // 밑줄과 카드가 처음 보일 때 한 번 남긴다.
  useEffect(() => {
    for (const p of placement.placed) {
      if (shown.current.has(p.suggestion.id)) continue;
      shown.current.add(p.suggestion.id);
      track("ai_suggestion_shown", eventProps(p.suggestion, me.role));
    }
  }, [placement, me.role]);

  const firstEdit = useCallback(
    async (via: "direct" | "apply" | "accept") => {
      if (firstEditChecked.current || me.role !== "author") return;
      firstEditChecked.current = true;
      if (!(await hasProjectEvent(deps, project.id, "first_edit"))) track("first_edit", { via });
    },
    [deps, project.id, me.role],
  );

  /**
   * 지금 원고(docRef)를 저장한다(A-12). 입력이 이어지면 앞 저장이 끝난 뒤 이어서 저장한다(saving 줄).
   * 409면 다른 곳에서 원고가 바뀐 것이라 최신 원고로 다시 그린다(C-4, D-30). 연결이 끊기면 원고는
   * 화면에 남기고 '다시 시도'로 다시 보낸다(NFR-06, 리뷰 B-1). 원고 글자는 이벤트·로그에 넣지 않는다.
   */
  const persist = useCallback(async () => {
    setSaveState("saving");
    try {
      const saved = await deps.library.saveChapterDoc(project.id, chapter.id, docRef.current, version.current);
      version.current = saved.version;
      savedOk.current = true;
      setSaveState("saved");
    } catch (e) {
      savedOk.current = false;
      // 실패 종류만 남긴다. 원고 글자는 넣지 않는다(db 1번, events 탭 save_failed).
      const kind = e instanceof VersionConflictError ? "version_conflict" : e instanceof ApiError && e.code === NETWORK ? "network" : "server_error";
      track("save_failed", { kind });
      if (e instanceof VersionConflictError) {
        setSaveState("saved");
        onConflict();
        return;
      }
      setSaveState(kind === "network" ? "offline" : "failed");
    }
  }, [deps, project.id, chapter.id, onConflict]);

  /**
   * 저장 중인 원고를 기다리고, 마지막 저장이 실패했으면 한 번 더 저장한다. 그래도 실패면 false.
   * 검토 요청이나 검토본이 화면의 원고가 빠진 서버 원고로 진행되지 않게 한다(FR-13, FR-38, NFR-06).
   */
  const ensureSaved = useCallback(async () => {
    await saving.current;
    if (savedOk.current) return true;
    saving.current = saving.current.then(() => persist());
    await saving.current;
    return savedOk.current;
  }, [persist]);

  const retrySave = useCallback(() => {
    saving.current = saving.current.then(() => persist());
  }, [persist]);

  // 연결이 끊겨 저장하지 못했으면 다시 연결될 때 다시 저장한다(QA-F11).
  useEffect(() => {
    if (saveState !== "offline") return;
    const onOnline = () => retrySave();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [saveState, retrySave]);

  const onDocChange = useCallback(
    (next: ChapterDoc, changed: string[], source: ChangeSource) => {
      docRef.current = next;
      setDoc(next);
      saving.current = saving.current.then(() => persist());
      void reconcile(next);
      void relocate(next); // 의견·수정 제안의 자리도 원문으로 다시 찾아 저장한다(NFR-05)
      if (source === "typing" && changed.length > 0) {
        rememberApplied(null);
        setNotice(null);
        liveCheck.current?.markChanged(changed);
        void firstEdit("direct");
      }
    },
    [persist, firstEdit, reconcile, relocate, rememberApplied],
  );

  async function apply(s: AiSuggestion, text: string, choice: number) {
    setBusy(true);
    try {
      // 누르는 순간의 원고에서 다시 찾는다. 못 찾으면 적용하지 않고 덮어쓰지 않는다(FR-27 ④, NFR-04).
      const found = locate(docRef.current, s);
      if (!found) {
        await save(transitionAiSuggestion(s, "invalidate"));
        setNotice(NOT_APPLIED);
        return;
      }
      const applied = transitionAiSuggestion({ ...s, anchor: found.anchor }, "apply");
      replaceOne(applied); // 원고를 바꾸기 전에 적용됨으로 둬야 정리(reconcile)가 무효로 덮지 않는다.
      if (!editor.current?.replaceText(found.anchor.paragraph_id, found.anchor.start, found.anchor.end, text)) {
        replaceOne(s);
        await save(transitionAiSuggestion(s, "invalidate"));
        setNotice(NOT_APPLIED);
        return;
      }
      await save(applied);
      rememberApplied({ suggestion: applied, inserted: appliedRange(found.anchor, text), insertedText: text });
      setNotice(null);
      track("ai_suggestion_applied", { ...eventProps(s, me.role), choice: choice === 0 ? "replacement" : "alternative" });
      void firstEdit("apply");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    const last = lastAppliedRef.current;
    rememberApplied(null);
    if (!last) return;
    if (!canUndo(docRef.current, last) || !editor.current?.replaceText(last.inserted.paragraph_id, last.inserted.start, last.inserted.end, last.suggestion.original)) {
      setNotice(NOT_UNDONE);
      return;
    }
    const anchor = { ...last.inserted, end: last.inserted.start + last.suggestion.original.length };
    await save(transitionAiSuggestion({ ...last.suggestion, anchor }, "undo_apply"));
  }

  async function act(s: AiSuggestion, run: () => Promise<void>) {
    setBusy(true);
    try {
      await run();
      setSelected((ids) => ids.filter((id) => id !== s.id));
    } finally {
      setBusy(false);
    }
  }

  const dismiss = (s: AiSuggestion) =>
    act(s, async () => {
      await save(transitionAiSuggestion(s, "dismiss"));
      track("ai_suggestion_dismissed", eventProps(s, me.role));
    });

  // 이 표현을 표기 원칙의 유지 표현으로 남기고 제안은 무효로 한다(FR-30, data-contract stale).
  const keep = (s: AiSuggestion) =>
    act(s, async () => {
      await deps.repo.createStyleRule({ project_id: project.id, type: "keep", text: s.original, created_by: me.id });
      await save(transitionAiSuggestion(s, "keep"));
      track("ai_suggestion_kept", eventProps(s, me.role));
    });

  /** 장 상태 바꾸기(FR-13, FR-14). 저장 중인 원고를 덮지 않게 최신 장을 다시 읽고 상태만 바꾼다. */
  async function changeChapter(action: ChapterAction) {
    setChapterBusy(true);
    try {
      if (!(await ensureSaved())) {
        setNotice(NOT_SAVED);
        return;
      }
      const to = nextChapterStatus(chapter.status, action);
      if (!to) return;
      // 상태만 보낸다(A-14). 원고는 건드리지 않는다(리뷰 B-4).
      const next = await deps.library.changeChapterStatus(project.id, chapter.id, to);
      onChapterChange(next);
      if (action === "request_review") track("review_requested");
    } finally {
      setChapterBusy(false);
    }
  }

  /** 장 검토(FR-21). 편집자가 눌러야만 돌고, 결과는 실행한 편집자에게만 보인다. */
  async function runReview() {
    setReview({ kind: "running" });
    track("chapter_review_run");
    try {
      await saving.current;
      const result = await getAiProvider().chapterReview({ chapter_id: chapter.id, base_version: version.current, requester_participant_id: me.id });
      const saved = await deps.repo.saveAiSuggestions(result.suggestions);
      await reload();
      // 요약과 '발견된 항목이 없어요'는 정리(reload) 뒤 지금 원고에서 보이는 제안으로 센다.
      // 원문이 이미 바뀐 제안은 무효가 되어 카드로 뜨지 않기 때문이다(FR-21 ②, FR-22).
      const savedIds = new Set(saved.map((s) => s.id));
      const shownNow = placeSuggestions(docRef.current, mineRef.current).placed.map((p) => p.suggestion).filter((s) => savedIds.has(s.id));
      const summary = Object.fromEntries(KIND_ORDER.map((k) => [k, shownNow.filter((s) => s.kind === k).length])) as Record<AiSuggestionKind, number>;
      setReview({ kind: "done", summary, total: shownNow.length });
    } catch {
      setReview({ kind: "failed" });
    }
  }

  /** 보내기(FR-29). 누르는 순간의 원고에서 자리를 다시 찾는다. */
  async function send(s: AiSuggestion, input: { method: SendMethod; replacement: string; text: string }) {
    const found = locate(docRef.current, s);
    if (!found) {
      await save(transitionAiSuggestion(s, "invalidate"));
      setNotice(NOT_APPLIED);
      setSending(null);
      return;
    }
    const result = await sendAiSuggestion(deps, viewer, s, { ...input, anchor: found.anchor });
    replaceOne(result.suggestion);
    await shared.reload();
    track("ai_suggestion_sent", { ...eventProps(s, me.role), method: input.method });
    setSending(null);
  }

  async function submitCompose(text: string) {
    if (!composing) return;
    const { kind, picked: p } = composing;
    if (kind === "comment") await shared.addComment(p.anchor, p.text, text);
    else await shared.addEdit(p.anchor, p.text, text);
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

  /** 검토본 저장(FR-38). 저장 중인 원고까지 기다린 뒤 그때의 원고를 남긴다. */
  async function storeSnapshot(label: string) {
    if (!(await ensureSaved())) throw new Error(NOT_SAVED);
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

  const sent = mine.filter((s) => s.status === "sent" || s.status === "merged");

  return (
    <>
      <div className={styles.desk}>
        <ManuscriptEditor
          ref={editor}
          initialDoc={chapter.doc}
          editable={editable}
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
                    <button type="button" onClick={retrySave}>
                      다시 시도
                    </button>
                  )}
                </p>
              )}
            </>
          }
          spans={spans}
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
            if (!lastAppliedRef.current) return false;
            void undo();
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
        suggestions={placement.placed.map((p) => p.suggestion)}
        sent={sent}
        selected={selected}
        status={status}
        review={review}
        notice={notice}
        canUndo={lastApplied !== null}
        busy={busy}
        sharedCount={shared.pendingCount}
        shared={
          <SharedTab
            role={me.role}
            items={shared.items}
            participants={shared.byId}
            selected={selected}
            unseen={shared.unseen}
            busy={busy}
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
          />
        }
        onRunReview={() => void runReview()}
        onRetry={() => void liveCheck.current?.retry()}
        onUndo={() => void undo()}
        onSelect={setSelected}
        onApply={(s, text, choice) => void apply(s, text, choice)}
        onDismiss={(s) => void dismiss(s)}
        onKeep={(s) => void keep(s)}
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
      {sending && <SendDialog suggestion={sending} onSend={(input) => send(sending, input)} onClose={() => setSending(null)} />}
      {composing && (
        <ComposeDialog kind={composing.kind} quote={composing.picked.text} onSubmit={submitCompose} onClose={() => setComposing(null)} />
      )}
    </>
  );
}
