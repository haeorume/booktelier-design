"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, VersionConflictError, type AppDeps, type Ctx } from "@/data";
import { locate } from "@/domain/anchor";
import { track } from "@/events";
import type { CommentMark, EditMark } from "@/components/editor/underline-plugin";
import type { SharedItem } from "@/components/review/SharedTab";
import type { AiSuggestionKind, Anchor, ChapterDoc, Comment, Participant, SuggestedEdit } from "@/types";
import type { useManuscriptSave } from "./useManuscriptSave";

interface Options {
  deps: AppDeps;
  ctx: Ctx;
  doc: ChapterDoc;
  participants: Participant[];
  save: ReturnType<typeof useManuscriptSave>;
  onConflict: () => void;
}

const NOT_ACCEPTED = "원문이 먼저 바뀌어 이 수정 제안은 수락하지 못했어요.";

/** 문단 순서와 글자 위치로 정렬하는 값 */
function orderOf(doc: ChapterDoc, a: Anchor): number {
  const i = doc.content.findIndex((p) => p.attrs.id === a.paragraph_id);
  return (i < 0 ? doc.content.length : i) * 1_000_000 + a.start;
}

/**
 * 함께 봄: 사람이 주고받은 의견과 수정 제안(WS-47~49). 세 역할 모두 보고, 상대가 없을 때 남겨도 나중에 보인다(NFR-11).
 * 서버 구현에서는 수락을 서버가 원고에 반영하고(D-30), 처음 본 기록도 서버에 남긴다(A-27, FR-02 ②).
 */
export function useShared({ deps, ctx, doc, participants, save, onConflict }: Options) {
  const { review: store } = deps;
  const [edits, setEdits] = useState<SuggestedEdit[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  /** 지금 수락하고 있는 수정 제안 id */
  const inFlight = useRef(new Set<string>());

  const reload = useCallback(async () => {
    const list = await store.listShared(ctx);
    setEdits(list.edits);
    setComments(list.comments);
    setSeen(list.seen);
  }, [store, ctx]);

  useEffect(() => {
    let alive = true;
    store
      .listShared(ctx)
      .then((list) => {
        if (!alive) return;
        setEdits(list.edits);
        setComments(list.comments);
        setSeen(list.seen);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [store, ctx]);

  const byId = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  // 편집자가 아직 열어 보지 않은, 다른 역할이 남긴 의견(FR-02 ②). 편집자 화면에서만 센다.
  const unseen = useMemo(() => {
    if (ctx.viewer.role !== "editor") return new Set<string>();
    return new Set(comments.filter((c) => byId.get(c.author_id)?.role !== "editor" && !seen.has(c.id)).map((c) => c.id));
  }, [ctx.viewer.role, comments, byId, seen]);

  const items: SharedItem[] = useMemo(() => {
    const out: SharedItem[] = [];
    for (const e of edits) {
      const found = e.status === "pending" ? locate(doc, e) : null;
      out.push({ kind: "edit", edit: e, order: orderOf(doc, found?.anchor ?? e.anchor) });
    }
    for (const c of comments) {
      if (c.parent_id) continue;
      // 인용문은 저장한 원문이다. 지금 원고에서 그 글자를 찾지 못하면 지면에 붙이지 않는다(NFR-05 ②).
      const found = locate(doc, c);
      out.push({
        kind: "comment",
        comment: c,
        replies: comments.filter((r) => r.parent_id === c.id),
        quote: c.original,
        detached: !found,
        order: orderOf(doc, found?.anchor ?? c.anchor) + 0.5,
      });
    }
    return out.sort((a, b) => a.order - b.order);
  }, [edits, comments, doc]);

  /** 지면 표시: 대기 중인 수정 제안의 지운 글자·더한 글자, 의견 자리 */
  const editMarks: EditMark[] = useMemo(
    () =>
      edits.flatMap((e) => {
        if (e.status !== "pending") return [];
        const found = locate(doc, e);
        return found ? [{ id: e.id, anchor: found.anchor, replacement: e.replacement }] : [];
      }),
    [edits, doc],
  );
  const commentMarks: CommentMark[] = useMemo(
    () =>
      comments.flatMap((c) => {
        if (c.parent_id) return [];
        const found = locate(doc, c);
        return found ? [{ id: c.id, anchor: found.anchor }] : [];
      }),
    [comments, doc],
  );

  const pendingCount = edits.filter((e) => e.status === "pending").length + unseen.size;

  /**
   * 원고가 바뀌면 의견과 대기 중인 수정 제안의 새 자리를 저장한다(NFR-05 ①). 1차 구현만 쓴다.
   * 서버는 A-22로 읽을 때 스스로 다시 찾아 저장한다.
   */
  const relocate = useCallback(
    async (next: ChapterDoc) => {
      if (store.source === "server") return;
      const movedComments = comments.flatMap((c) => {
        if (c.parent_id) return [];
        const found = locate(next, c);
        return found?.relocated ? [{ comment: c, anchor: found.anchor }] : [];
      });
      const movedEdits = edits.flatMap((e) => {
        // 수락 중인 수정 제안은 옮기지 않는다. 수락이 원고를 바꿔 이 저장을 부르기 때문이다(FR-34 ②).
        if (e.status !== "pending" || inFlight.current.has(e.id)) return [];
        const found = locate(next, e);
        return found?.relocated ? [{ edit: e, anchor: found.anchor }] : [];
      });
      if (movedComments.length === 0 && movedEdits.length === 0) return;
      await store.saveAnchors(ctx, { comments: movedComments, edits: movedEdits });
      await reload();
    },
    [store, ctx, comments, edits, reload],
  );

  /** 의견 카드를 열면 그 의견과 답글을 모두 읽은 것으로 한다(FR-02 ②, A-27). */
  const markSeen = useCallback(
    (id: string) => {
      const thread = comments.filter((c) => c.id === id || c.parent_id === id);
      const targets = thread.length > 0 ? thread.map((c) => ({ type: "comment" as const, id: c.id })) : edits.some((e) => e.id === id) ? [{ type: "suggested_edit" as const, id }] : [];
      const fresh = targets.filter((t) => !seen.has(t.id));
      // 서버에 남은 뒤에만 읽음으로 바꾼다. 실패하면 그대로 두어 다음에 열 때 다시 보낸다(FR-02 ②, Codex 검수 11.21).
      for (const t of fresh) {
        store
          .markSeen(ctx, t)
          .then(() => setSeen((s) => new Set([...s, t.id])))
          .catch(() => undefined);
      }
    },
    [comments, edits, seen, store, ctx],
  );

  async function addComment(anchor: Anchor, original: string, body: string, parent: Comment | null = null) {
    await store.addComment(ctx, { anchor, original, body, parent });
    await reload();
  }

  async function addEdit(anchor: Anchor, original: string, replacement: string, reason: string | null = null, kind: AiSuggestionKind | null = null) {
    await store.addEdit(ctx, { anchor, original, replacement, reason, kind });
    await reload();
  }

  /** 의견 해결·다시 열기(FR-36). 쓴 사람과 편집자만(Q-21). */
  async function setResolved(c: Comment, resolved: boolean) {
    await store.setCommentResolved(ctx, c, resolved);
    track(resolved ? "comment_resolved" : "comment_reopened", { comment_id: c.id });
    await reload();
  }

  /**
   * 수락(FR-34). 서버 구현은 서버가 원고에 반영하고 화면은 같은 글자를 편집기에 반영한다(D-30).
   * 1차 구현은 넘겨받은 replace(작가의 편집기)가 원고를 바꾼다. 원문이 먼저 바뀌었으면 수락하지 않고 안내한다(NFR-04).
   * 수락했으면 true. 원고를 처음 바꾼 일이면 화면이 first_edit를 남긴다(정할 것 8).
   */
  async function accept(edit: SuggestedEdit, replace: (a: Anchor, text: string) => boolean): Promise<boolean> {
    if (!(await save.ensureSaved())) {
      setNotice("원고를 저장하지 못해 수락하지 않았어요. 저장을 다시 시도해 주세요.");
      return false;
    }
    const found = locate(save.docRef.current, edit);
    if (!found) {
      setNotice(NOT_ACCEPTED);
      return false;
    }
    inFlight.current.add(edit.id);
    try {
      const apply = () => replace(found.anchor, edit.replacement);
      let result;
      try {
        // 서버 구현은 기다리는 동안 편집기를 잠그고, 응답 뒤 편집기에 같은 글자를 반영한다(serverEdit).
        result = await save.serverEdit(async () => {
          const r = await store.accept(ctx, edit, { anchor: found.anchor, baseVersion: save.version.current });
          return { value: r, newVersion: r.chapterVersion };
        }, apply);
      } catch (e) {
        // 수락은 원고를 바꾸는 동작이라, 이미 처리됐다는 409여도 원고가 바뀌었을 수 있다. 최신 장까지 다시 읽는다(D-30).
        if (e instanceof VersionConflictError || (e instanceof ApiError && e.status === 409)) {
          setNotice(NOT_ACCEPTED);
          onConflict();
          return false;
        }
        throw e;
      }
      if (result === null) return false;
      if (result.chapterVersion === null && !apply()) {
        setNotice(NOT_ACCEPTED);
        return false;
      }
      setNotice(null);
      track("suggested_edit_accepted", { suggested_edit_id: edit.id, from_ai: !!edit.ai_origin_id });
      if (result.merged) track("ai_suggestion_merged", { suggestion_id: result.merged.id, kind: result.merged.kind });
      await reload();
      return true;
    } finally {
      inFlight.current.delete(edit.id);
    }
  }

  async function reject(edit: SuggestedEdit) {
    try {
      await store.reject(ctx, edit);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e;
    }
    // 잠정 이름(W4): events 탭에 거절 이벤트가 없어 더했다. 보낸 AI 제안이 거절됐는지도 셀 수 있게 from_ai를 남긴다(FR-39 ②).
    track("suggested_edit_rejected", { suggested_edit_id: edit.id, from_ai: !!edit.ai_origin_id });
    await reload();
  }

  return { items, editMarks, commentMarks, unseen, pendingCount, notice, byId, reload, relocate, markSeen, addComment, addEdit, setResolved, accept, reject };
}
