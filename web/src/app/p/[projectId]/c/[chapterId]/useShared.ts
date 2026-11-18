"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markAccepted, markRejected, type BookDeps, type Viewer } from "@/data";
import { locate } from "@/domain/anchor";
import { track } from "@/events";
import type { CommentMark, EditMark } from "@/components/editor/underline-plugin";
import type { SharedItem } from "@/components/review/SharedTab";
import type { Anchor, ChapterDoc, Comment, Participant, SuggestedEdit } from "@/types";

interface Options {
  deps: BookDeps;
  viewer: Viewer;
  projectId: string;
  chapterId: string;
  doc: ChapterDoc;
  participants: Participant[];
}

/** 문단 순서와 글자 위치로 정렬하는 값 */
function orderOf(doc: ChapterDoc, a: Anchor): number {
  const i = doc.content.findIndex((p) => p.attrs.id === a.paragraph_id);
  return (i < 0 ? doc.content.length : i) * 1_000_000 + a.start;
}

/**
 * 함께 봄: 사람이 주고받은 의견과 수정 제안(WS-47~49). 세 역할 모두 보고, 상대가 없을 때 남겨도 나중에 보인다(NFR-11).
 */
export function useShared({ deps, viewer, projectId, chapterId, doc, participants }: Options) {
  const [edits, setEdits] = useState<SuggestedEdit[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [seenVersion, setSeenVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  /** 지금 수락하고 있는 수정 제안 id */
  const inFlight = useRef(new Set<string>());

  const reload = useCallback(async () => {
    const [e, c] = await Promise.all([deps.repo.listSuggestedEdits(chapterId), deps.repo.listComments(chapterId)]);
    setEdits(e);
    setComments(c);
  }, [deps, chapterId]);

  useEffect(() => {
    let alive = true;
    Promise.all([deps.repo.listSuggestedEdits(chapterId), deps.repo.listComments(chapterId)]).then(([e, c]) => {
      if (!alive) return;
      setEdits(e);
      setComments(c);
    });
    return () => {
      alive = false;
    };
  }, [deps, chapterId]);

  const byId = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  // 편집자가 아직 열어 보지 않은, 다른 역할이 남긴 의견(FR-02 ②). 편집자 화면에서만 센다.
  const unseen = useMemo(() => {
    void seenVersion;
    if (viewer.role !== "editor") return new Set<string>();
    const seen = deps.session.getSeenComments(projectId);
    return new Set(comments.filter((c) => byId.get(c.author_id)?.role !== "editor" && !seen.has(c.id)).map((c) => c.id));
  }, [viewer.role, deps, projectId, comments, byId, seenVersion]);

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
   * 원고가 바뀌면 의견과 대기 중인 수정 제안의 새 자리를 저장한다(NFR-05 ①).
   * 원문으로 다시 찾아 옮겨진 것만 저장한다. 원문을 찾지 못한 것은 그대로 두고 지면에 붙이지 않는다.
   */
  const relocate = useCallback(
    async (next: ChapterDoc) => {
      const movedComments = comments.flatMap((c) => {
        if (c.parent_id) return [];
        const found = locate(next, c);
        return found?.relocated ? [{ ...c, anchor: found.anchor }] : [];
      });
      const movedEdits = edits.flatMap((e) => {
        if (e.status !== "pending") return [];
        const found = locate(next, e);
        return found?.relocated ? [{ ...e, anchor: found.anchor }] : [];
      });
      if (movedComments.length === 0 && movedEdits.length === 0) return;
      // 저장하는 동안 다른 처리(수락·거절·답글)가 끝날 수 있다. 저장하기 직전에 최신 값을 다시 읽고 자리만 바꾼다.
      for (const c of movedComments) {
        const thread = (await deps.repo.listComments(chapterId)).filter((x) => x.id === c.id || x.parent_id === c.id);
        // 답글은 부모와 같은 자리를 가리킨다.
        for (const x of thread) await deps.repo.updateComment({ ...x, anchor: c.anchor });
      }
      for (const e of movedEdits) {
        // 수락 중인 수정 제안은 옮기지 않는다. 수락이 원고를 바꿔 이 저장을 부르기 때문이다(FR-34 ②).
        if (inFlight.current.has(e.id)) continue;
        const latest = (await deps.repo.listSuggestedEdits(chapterId)).find((x) => x.id === e.id);
        if (latest?.status !== "pending" || inFlight.current.has(e.id)) continue;
        await deps.repo.updateSuggestedEdit({ ...latest, anchor: e.anchor });
      }
      await reload();
    },
    [comments, edits, deps, chapterId, reload],
  );

  /** 의견 카드를 열면 그 의견과 답글을 모두 읽은 것으로 한다(FR-02 ②). */
  const markSeen = useCallback(
    (id: string) => {
      if (viewer.role !== "editor") return;
      const thread = comments.filter((c) => c.id === id || c.parent_id === id);
      if (thread.length === 0) return;
      for (const c of thread) deps.session.markCommentSeen(projectId, c.id);
      setSeenVersion((v) => v + 1);
    },
    [viewer.role, comments, deps, projectId],
  );

  async function addComment(anchor: Anchor, original: string, body: string, parent: Comment | null = null) {
    await deps.repo.createComment({
      chapter_id: chapterId,
      anchor: parent?.anchor ?? anchor,
      original: parent?.original ?? original,
      body,
      author_id: viewer.participant_id,
      parent_id: parent?.id ?? null,
      ai_origin_id: null,
    });
    await reload();
  }

  async function addEdit(anchor: Anchor, original: string, replacement: string) {
    await deps.repo.createSuggestedEdit({ chapter_id: chapterId, anchor, original, replacement, author_id: viewer.participant_id, ai_origin_id: null });
    await reload();
  }

  /**
   * 수락(FR-34). 원고를 바꾸는 일은 넘겨받은 replace가 한다(작가의 편집기).
   * 원문이 먼저 바뀌었으면 수락하지 않고 안내한다(NFR-04).
   */
  /** 수락했으면 true. 원고를 처음 바꾼 일이면 화면이 first_edit를 남긴다(정할 것 8). */
  async function accept(edit: SuggestedEdit, replace: (a: Anchor, text: string) => boolean): Promise<boolean> {
    const found = locate(doc, edit);
    if (!found) {
      setNotice("원문이 먼저 바뀌어 이 수정 제안은 수락하지 못했어요.");
      return false;
    }
    inFlight.current.add(edit.id);
    try {
      if (!replace(found.anchor, edit.replacement)) {
        setNotice("원문이 먼저 바뀌어 이 수정 제안은 수락하지 못했어요.");
        return false;
      }
      setNotice(null);
      const { merged } = await markAccepted(deps, edit, found.anchor);
      track("suggested_edit_accepted", { suggested_edit_id: edit.id, from_ai: !!edit.ai_origin_id });
      if (merged) track("ai_suggestion_merged", { suggestion_id: merged.id, kind: merged.kind });
      await reload();
      return true;
    } finally {
      inFlight.current.delete(edit.id);
    }
  }

  async function reject(edit: SuggestedEdit) {
    await markRejected(deps, edit);
    // 잠정 이름(W4): events 탭에 거절 이벤트가 없어 더했다. 보낸 AI 제안이 거절됐는지도 셀 수 있게 from_ai를 남긴다(FR-39 ②).
    track("suggested_edit_rejected", { suggested_edit_id: edit.id, from_ai: !!edit.ai_origin_id });
    await reload();
  }

  return { items, editMarks, commentMarks, unseen, pendingCount, notice, byId, reload, relocate, markSeen, addComment, addEdit, accept, reject };
}
