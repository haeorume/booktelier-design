"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAiProvider } from "@/ai";
import { ManuscriptEditor, type ChangeSource, type EditorHandle } from "@/components/editor/ManuscriptEditor";
import { ReviewPanel, type ReviewPanelHandle } from "@/components/review/ReviewPanel";
import { bookDeps, hasProjectEvent, saveChapterDoc, type Viewer } from "@/data";
import { locate } from "@/domain/anchor";
import { can } from "@/domain/permissions";
import { transitionAiSuggestion } from "@/domain/transitions";
import { mergeUnderlines } from "@/domain/underlines";
import { track } from "@/events";
import { createLiveCheck, type LiveCheck, type LiveCheckStatus } from "@/workspace/live-check";
import { appliedRange, canUndo, placeSuggestions, type LastApplied } from "@/workspace/suggestions";
import type { AiSuggestion, Chapter, ChapterDoc, Participant, Project } from "@/types";
import styles from "./page.module.css";

interface Props {
  project: Project;
  chapter: Chapter;
  me: Participant;
}

const NOT_APPLIED = "원고가 먼저 바뀌어 이 제안은 적용하지 못했어요.";
const NOT_UNDONE = "원고가 바뀌어 실행 취소할 수 없어요.";

function eventProps(s: AiSuggestion, role: string) {
  return { suggestion_id: s.id, role, kind: s.kind, source: s.source };
}

/**
 * 한 장의 지면과 검토 패널. 실시간 교정(FR-20), 밑줄(FR-25), 카드 동작(FR-27·28·30)을 잇는다.
 * 보내기 전 AI 제안은 data/ 가 주인 것만 돌려준다(FR-23, D-09).
 */
export function ChapterWorkspace({ project, chapter, me }: Props) {
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

  const editor = useRef<EditorHandle>(null);
  const panel = useRef<ReviewPanelHandle>(null);
  const lastAppliedRef = useRef<LastApplied | null>(null);
  const docRef = useRef(chapter.doc);
  const mineRef = useRef<AiSuggestion[]>([]);
  const version = useRef(chapter.version);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
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

  // 밑줄과 카드가 처음 보일 때 한 번 남긴다.
  useEffect(() => {
    for (const p of placement.placed) {
      if (shown.current.has(p.suggestion.id)) continue;
      shown.current.add(p.suggestion.id);
      track("ai_suggestion_shown", eventProps(p.suggestion, me.role));
    }
  }, [placement, me.role]);

  const firstEdit = useCallback(
    async (via: "direct" | "apply") => {
      if (firstEditChecked.current || me.role !== "author") return;
      firstEditChecked.current = true;
      if (!(await hasProjectEvent(deps, project.id, "first_edit"))) track("first_edit", { via });
    },
    [deps, project.id, me.role],
  );

  const onDocChange = useCallback(
    (next: ChapterDoc, changed: string[], source: ChangeSource) => {
      docRef.current = next;
      setDoc(next);
      saving.current = saving.current.then(async () => {
        const saved = await saveChapterDoc(deps, chapter.id, next);
        version.current = saved.version;
      });
      void reconcile(next);
      if (source === "typing" && changed.length > 0) {
        rememberApplied(null);
        setNotice(null);
        liveCheck.current?.markChanged(changed);
        void firstEdit("direct");
      }
    },
    [deps, chapter.id, firstEdit, reconcile, rememberApplied],
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

  return (
    <>
      <div className={styles.desk}>
        <ManuscriptEditor
          ref={editor}
          initialDoc={chapter.doc}
          editable={editable}
          templateId={project.template_id}
          layout={project.layout}
          chapterTitle={chapter.title}
          spans={spans}
          selected={selected}
          onDocChange={onDocChange}
          onUnderlineClick={(ids) => {
            panel.current?.reveal(ids); // AI 제안 탭을 열고 가리는 거르기를 푼다(N-07)
            setSelected(ids);
          }}
          onUndoShortcut={() => {
            // 적용 직후면 Ctrl/Cmd+Z가 원고와 제안을 함께 되돌린다(G-11). 아니면 편집기 되돌리기.
            if (!lastAppliedRef.current) return false;
            void undo();
            return true;
          }}
        />
      </div>
      <ReviewPanel
        ref={panel}
        role={me.role}
        suggestions={placement.placed.map((p) => p.suggestion)}
        selected={selected}
        status={status}
        notice={notice}
        canUndo={lastApplied !== null}
        busy={busy}
        onRetry={() => void liveCheck.current?.retry()}
        onUndo={() => void undo()}
        onSelect={setSelected}
        onApply={(s, text, choice) => void apply(s, text, choice)}
        onDismiss={(s) => void dismiss(s)}
        onKeep={(s) => void keep(s)}
      />
    </>
  );
}
