"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { EditorHandle } from "@/components/editor/ManuscriptEditor";
import type { ChapterReviewState } from "@/components/review/ReviewPanel";
import { ApiError, VersionConflictError, type AppDeps, type Ctx, type SendMethod } from "@/data";
import { locate } from "@/domain/anchor";
import { KIND_ORDER } from "@/domain/labels";
import { transitionAiSuggestion } from "@/domain/transitions";
import { mergeUnderlines } from "@/domain/underlines";
import { track } from "@/events";
import type { AiSuggestion, AiSuggestionKind, ChapterDoc, Participant } from "@/types";
import { createLiveCheck, type LiveCheck, type LiveCheckStatus } from "@/workspace/live-check";
import { appliedRange, canUndo, placeSuggestions, type LastApplied } from "@/workspace/suggestions";
import type { useManuscriptSave } from "./useManuscriptSave";

export const NOT_APPLIED = "원고가 먼저 바뀌어 이 제안은 적용하지 못했어요.";
export const NOT_UNDONE = "원고가 바뀌어 실행 취소할 수 없어요.";
export const NOT_SAVED = "원고를 저장하지 못해 진행하지 않았어요. 저장을 다시 시도해 주세요.";

export function eventProps(s: AiSuggestion, role: string) {
  return { suggestion_id: s.id, role, kind: s.kind, source: s.source };
}

interface Options {
  deps: AppDeps;
  ctx: Ctx;
  me: Participant;
  editable: boolean;
  doc: ChapterDoc;
  save: ReturnType<typeof useManuscriptSave>;
  editor: RefObject<EditorHandle | null>;
  onConflict: () => void;
  onFirstEdit: (via: "apply") => void;
  /** 카드 선택에서 처리한 제안을 뺀다 */
  onHandled: (id: string) => void;
}

/**
 * 내 AI 제안(WS-41~46, 리뷰 R-3로 작업 공간에서 나눔). 보내기 전에는 나만 본다(FR-23, D-29).
 * 실시간 교정(FR-20, D-18), 장 검토(FR-21), 적용·실행 취소·무시·유지(FR-27·28·30), 보내기(FR-29).
 * 서버 구현에서는 적용·실행 취소를 서버가 원고에 반영하고(D-30) 화면은 같은 글자만 편집기에 반영한다.
 */
export function useAiSuggestions(o: Options) {
  const { deps, ctx, me, editable, doc, save, editor, onConflict, onFirstEdit, onHandled } = o;
  const { review: store } = deps;
  const [mine, setMine] = useState<AiSuggestion[]>([]);
  const [status, setStatus] = useState<LiveCheckStatus>("idle");
  const [review, setReview] = useState<ChapterReviewState>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<LastApplied | null>(null);
  const [busy, setBusy] = useState(false);
  const mineRef = useRef<AiSuggestion[]>([]);
  const lastAppliedRef = useRef<LastApplied | null>(null);
  const liveCheck = useRef<LiveCheck | null>(null);
  const shown = useRef(new Set<string>());

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

  const update = useCallback(
    async (s: AiSuggestion) => {
      const saved = await store.update(ctx, s);
      replaceOne(saved);
      return saved;
    },
    [store, ctx, replaceOne],
  );

  /**
   * 지금 원고에 맞춰 대기 제안을 정리한다(1차 구현만 저장. 서버는 A-19에서 스스로 한다).
   * 원문이 사라진 제안은 무효(NFR-04, Q-15 잠정), 자리가 옮겨진 제안은 새 자리(NFR-05).
   */
  const reconcile = useCallback(
    async (docNow: ChapterDoc) => {
      if (store.source === "server") return;
      const { placed, lost } = placeSuggestions(docNow, mineRef.current);
      const changes = [
        ...lost.map((s) => transitionAiSuggestion(s, "invalidate")),
        ...placed.filter((p) => p.relocated).map((p) => ({ ...p.suggestion, anchor: p.anchor })),
      ];
      for (const c of changes) {
        if (mineRef.current.find((x) => x.id === c.id)?.status !== "pending") continue;
        await update(c);
      }
    },
    [store, update],
  );

  const reload = useCallback(async () => {
    commit(await store.listMine(ctx));
    await reconcile(save.docRef.current);
  }, [store, ctx, commit, reconcile, save.docRef]);

  // 처음 열 때 내 AI 제안을 읽는다.
  useEffect(() => {
    let alive = true;
    store
      .listMine(ctx)
      .then(async (list) => {
        if (!alive) return;
        commit(list);
        await reconcile(save.docRef.current);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [store, ctx, commit, reconcile, save.docRef]);

  // 실시간 교정은 원고를 고치는 작가에게만 돈다(D-18). 저장이 끝난 버전으로 부른다(A-16).
  const { ensureSaved, version, docRef } = save;
  useEffect(() => {
    if (!editable) return;
    const lc = createLiveCheck({
      provider: {
        async liveCheck(req) {
          // 저장이 실패했으면 옛 원고를 검사하게 되니 보내지 않고 실패로 넘긴다. 그 문단은 '다시 시도'에 남는다(FR-20).
          if (!(await ensureSaved())) throw new Error("원고를 저장하지 못해 교정하지 않았어요");
          const suggestions = await store.liveCheck(ctx, { paragraphIds: [req.paragraph_id], baseVersion: version.current, doc: docRef.current });
          return { source: "live_check", chapter_id: req.chapter_id, paragraph_id: req.paragraph_id, base_version: version.current, suggestions };
        },
        chapterReview: () => Promise.reject(new Error("작가 화면에서는 장 검토를 돌리지 않아요")),
      },
      chapterId: ctx.chapterId,
      requesterId: me.id,
      getText: (pid) => {
        const p = docRef.current.content.find((n) => n.attrs.id === pid);
        return p ? (p.content ?? []).map((t) => t.text).join("") : null;
      },
      getVersion: () => version.current,
      onStatus: setStatus,
      onSuggestions: () => void reload(),
    });
    liveCheck.current = lc;
    return () => {
      lc.dispose();
      liveCheck.current = null;
    };
  }, [editable, store, ctx, me.id, reload, ensureSaved, version, docRef]);

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

  /**
   * 서버가 '원문이 먼저 바뀜'이나 '이미 처리됨'으로 막으면 목록을 다시 읽고 안내한다.
   * 원고를 바꾸는 동작(적용·실행 취소)이면 원고도 이미 바뀌었을 수 있어 최신 장까지 다시 읽는다(D-30, Codex 검수 11.21).
   */
  async function refused(e: unknown, message: string, changesDoc = false): Promise<boolean> {
    if (e instanceof VersionConflictError || (changesDoc && e instanceof ApiError && e.status === 409)) {
      onConflict();
      return true;
    }
    if (e instanceof ApiError && e.status === 409) {
      setNotice(message);
      await reload();
      return true;
    }
    return false;
  }

  async function apply(s: AiSuggestion, text: string, choice: number) {
    setBusy(true);
    try {
      if (!(await save.ensureSaved())) {
        setNotice(NOT_SAVED);
        return;
      }
      // 누르는 순간의 원고에서 다시 찾는다. 못 찾으면 적용하지 않고 덮어쓰지 않는다(FR-27 ④, NFR-04).
      const found = locate(save.docRef.current, s);
      if (!found) {
        await update(transitionAiSuggestion(s, "invalidate"));
        setNotice(NOT_APPLIED);
        return;
      }
      const { anchor } = found;
      const replace = () => editor.current?.replaceText(anchor.paragraph_id, anchor.start, anchor.end, text) ?? false;
      let result;
      try {
        // 서버 구현은 기다리는 동안 편집기를 잠그고, 응답 뒤 편집기에 같은 글자를 반영한다(serverEdit).
        result = await save.serverEdit(async () => {
          const r = await store.apply(ctx, s, { choice, anchor, baseVersion: save.version.current });
          return { value: r, newVersion: r.chapterVersion };
        }, replace);
      } catch (e) {
        if (await refused(e, NOT_APPLIED, true)) return;
        throw e;
      }
      if (result === null) return; // 그사이 원고가 바뀌어 최신 원고로 다시 그린다
      // 원고를 바꾸기 전에 적용됨으로 둬야 정리(reconcile)가 무효로 덮지 않는다(1차 구현).
      replaceOne(result.item);
      if (result.chapterVersion === null && !replace()) {
        replaceOne(s);
        await update(transitionAiSuggestion(s, "invalidate"));
        setNotice(NOT_APPLIED);
        return;
      }
      rememberApplied({ suggestion: { ...result.item, anchor }, inserted: appliedRange(anchor, text), insertedText: text });
      setNotice(null);
      track("ai_suggestion_applied", { ...eventProps(s, me.role), choice: choice === 0 ? "replacement" : "alternative" });
      onFirstEdit("apply");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    const last = lastAppliedRef.current;
    rememberApplied(null);
    if (!last) return;
    if (!canUndo(save.docRef.current, last) || !(await save.ensureSaved())) {
      setNotice(NOT_UNDONE);
      return;
    }
    const { inserted } = last;
    const anchor = { ...inserted, end: inserted.start + last.suggestion.original.length };
    const replace = () => editor.current?.replaceText(inserted.paragraph_id, inserted.start, inserted.end, last.suggestion.original) ?? false;
    let result;
    try {
      result = await save.serverEdit(async () => {
        const r = await store.undo(ctx, last.suggestion, { anchor, baseVersion: save.version.current });
        return { value: r, newVersion: r.chapterVersion };
      }, replace);
    } catch (e) {
      if (await refused(e, NOT_UNDONE, true)) return;
      throw e;
    }
    if (result === null) return;
    if (result.chapterVersion === null && !replace()) {
      setNotice(NOT_UNDONE);
      return;
    }
    replaceOne(result.item);
  }

  async function act(s: AiSuggestion, run: () => Promise<void>) {
    setBusy(true);
    try {
      await run();
      onHandled(s.id);
    } catch (e) {
      if (!(await refused(e, NOT_APPLIED))) throw e;
    } finally {
      setBusy(false);
    }
  }

  const dismiss = (s: AiSuggestion) =>
    act(s, async () => {
      replaceOne(await store.dismiss(ctx, s));
      track("ai_suggestion_dismissed", eventProps(s, me.role));
    });

  // 이 표현을 표기 원칙의 유지 표현으로 남기고 제안은 무효로 한다(FR-30, data-contract stale).
  const keep = (s: AiSuggestion) =>
    act(s, async () => {
      replaceOne(await store.keep(ctx, s));
      track("ai_suggestion_kept", eventProps(s, me.role));
    });

  /** 장 검토(FR-21). 편집자가 눌러야만 돌고, 결과는 실행한 편집자에게만 보인다. */
  async function runReview() {
    setReview({ kind: "running" });
    track("chapter_review_run");
    try {
      await save.ensureSaved();
      const saved = await store.chapterReview(ctx, { baseVersion: save.version.current });
      await reload();
      // 요약과 '발견된 항목이 없어요'는 정리(reload) 뒤 지금 원고에서 보이는 제안으로 센다(FR-21 ②, FR-22).
      const savedIds = new Set(saved.map((s) => s.id));
      const shownNow = placeSuggestions(save.docRef.current, mineRef.current).placed.map((p) => p.suggestion).filter((s) => savedIds.has(s.id));
      const summary = Object.fromEntries(KIND_ORDER.map((k) => [k, shownNow.filter((s) => s.kind === k).length])) as Record<AiSuggestionKind, number>;
      setReview({ kind: "done", summary, total: shownNow.length });
    } catch (e) {
      if (e instanceof VersionConflictError) onConflict();
      setReview({ kind: "failed" });
    }
  }

  /** 보내기(FR-29). 누르는 순간의 원고에서 자리를 다시 찾는다. 다 됐으면 true. */
  async function send(s: AiSuggestion, input: { method: SendMethod; replacement: string; text: string }): Promise<boolean> {
    const found = locate(save.docRef.current, s);
    if (!found) {
      await update(transitionAiSuggestion(s, "invalidate"));
      setNotice(NOT_APPLIED);
      return true;
    }
    const choice = Math.max(0, [s.replacement, ...s.alternatives].indexOf(input.replacement));
    try {
      replaceOne(await store.send(ctx, s, { ...input, choice, anchor: found.anchor }));
    } catch (e) {
      if (await refused(e, NOT_APPLIED)) return true;
      throw e;
    }
    track("ai_suggestion_sent", { ...eventProps(s, me.role), method: input.method });
    return true;
  }

  const sent = mine.filter((s) => s.status === "sent" || s.status === "merged");

  return {
    placement,
    spans,
    sent,
    status,
    review,
    notice,
    setNotice,
    lastApplied,
    lastAppliedRef,
    busy,
    reconcile,
    rememberApplied,
    markChanged: (ids: string[]) => liveCheck.current?.markChanged(ids),
    retry: () => liveCheck.current?.retry(),
    apply,
    undo,
    dismiss,
    keep,
    runReview,
    send,
  };
}
