// 1차 브라우저 저장 구현(D-20). 데모 제공자와 Repository로 1차와 같게 동작한다. 원고는 화면 편집기가 바꾼다.
import type { AiProvider } from "@/ai";
import { transitionAiSuggestion } from "@/domain/transitions";
import type { AiSuggestion } from "@/types";
import type { BookDeps } from "./books";
import { markAccepted, markRejected } from "./review";
import type { ReviewStore } from "./review-store";

function paragraphText(doc: { content: { attrs: { id: string }; content?: { text: string }[] }[] }, id: string): string | null {
  const p = doc.content.find((n) => n.attrs.id === id);
  return p ? (p.content ?? []).map((t) => t.text).join("") : null;
}

export function createLocalReview(deps: BookDeps, provider: () => AiProvider): ReviewStore {
  const { repo, session } = deps;
  return {
    source: "local",

    listMine: (ctx) => repo.listAiSuggestions(ctx.chapterId, ctx.viewer),

    async liveCheck(ctx, input) {
      const found: AiSuggestion[] = [];
      for (const paragraph_id of input.paragraphIds) {
        const text = paragraphText(input.doc, paragraph_id);
        if (text === null) continue;
        const result = await provider().liveCheck({
          chapter_id: ctx.chapterId,
          paragraph_id,
          text,
          base_version: input.baseVersion,
          requester_participant_id: ctx.viewer.participant_id,
        });
        found.push(...result.suggestions);
      }
      return found.length > 0 ? repo.saveAiSuggestions(found) : [];
    },

    async chapterReview(ctx, input) {
      const result = await provider().chapterReview({
        chapter_id: ctx.chapterId,
        base_version: input.baseVersion,
        requester_participant_id: ctx.viewer.participant_id,
      });
      return repo.saveAiSuggestions(result.suggestions);
    },

    update: (ctx, s) => repo.updateAiSuggestion(s, ctx.viewer),

    async apply(ctx, s, input) {
      const item = await repo.updateAiSuggestion(transitionAiSuggestion({ ...s, anchor: input.anchor }, "apply"), ctx.viewer);
      return { item, chapterVersion: null };
    },
    async undo(ctx, s, input) {
      const item = await repo.updateAiSuggestion(transitionAiSuggestion({ ...s, anchor: input.anchor }, "undo_apply"), ctx.viewer);
      return { item, chapterVersion: null };
    },
    dismiss: (ctx, s) => repo.updateAiSuggestion(transitionAiSuggestion(s, "dismiss"), ctx.viewer),
    async keep(ctx, s) {
      await repo.createStyleRule({ project_id: ctx.projectId, type: "keep", text: s.original, created_by: ctx.viewer.participant_id });
      return repo.updateAiSuggestion(transitionAiSuggestion(s, "keep"), ctx.viewer);
    },
    async send(ctx, s, input) {
      // 수정 제안이면 이유·종류가 담긴 카드 하나(FR-29 ⑤), 의견이면 의견 하나. 둘 다 ai_origin_id를 단다.
      if (input.method === "suggested_edit") {
        await repo.createSuggestedEdit({
          chapter_id: ctx.chapterId,
          anchor: input.anchor,
          original: s.original,
          replacement: input.replacement,
          author_id: ctx.viewer.participant_id,
          ai_origin_id: s.id,
          reason: input.text,
          kind: s.kind,
        });
      } else {
        await repo.createComment({
          chapter_id: ctx.chapterId,
          anchor: input.anchor,
          original: s.original,
          body: input.text,
          author_id: ctx.viewer.participant_id,
          parent_id: null,
          ai_origin_id: s.id,
        });
      }
      return repo.updateAiSuggestion(transitionAiSuggestion({ ...s, anchor: input.anchor }, "send"), ctx.viewer);
    },

    async listShared(ctx) {
      const [edits, comments] = await Promise.all([repo.listSuggestedEdits(ctx.chapterId), repo.listComments(ctx.chapterId)]);
      return { edits, comments, seen: session.getSeenComments(ctx.projectId) };
    },
    async addComment(ctx, input) {
      await repo.createComment({
        chapter_id: ctx.chapterId,
        anchor: input.parent?.anchor ?? input.anchor,
        original: input.parent?.original ?? input.original,
        body: input.body,
        author_id: ctx.viewer.participant_id,
        parent_id: input.parent?.id ?? null,
        ai_origin_id: null,
      });
    },
    async addEdit(ctx, input) {
      await repo.createSuggestedEdit({
        chapter_id: ctx.chapterId,
        anchor: input.anchor,
        original: input.original,
        replacement: input.replacement,
        author_id: ctx.viewer.participant_id,
        ai_origin_id: null,
        reason: input.reason,
        kind: input.kind,
      });
    },
    setCommentResolved: (ctx, c, resolved) =>
      repo.updateComment(
        resolved
          ? { ...c, status: "resolved", resolved_by: ctx.viewer.participant_id, resolved_at: new Date().toISOString() }
          : { ...c, status: "open", resolved_by: null, resolved_at: null },
      ),
    async accept(_ctx, e, input) {
      const { accepted, merged } = await markAccepted(deps, e, input.anchor);
      return { item: accepted, chapterVersion: null, merged: merged ? { id: merged.id, kind: merged.kind } : null };
    },
    reject: (_ctx, e) => markRejected(deps, e),
    async markSeen(ctx, target) {
      // 1차 읽음 기록은 책마다 하나라 편집자가 연 것만 남긴다(FR-02 ②, 1차와 같음, Codex 검수 11.21).
      if (target.type === "comment" && ctx.viewer.role === "editor") session.markCommentSeen(ctx.projectId, target.id);
    },
    async saveAnchors(ctx, moved) {
      // 저장하는 동안 다른 처리가 끝날 수 있다. 저장하기 직전에 최신 값을 다시 읽고 자리만 바꾼다(1차와 같음).
      for (const { comment, anchor } of moved.comments) {
        const thread = (await repo.listComments(ctx.chapterId)).filter((x) => x.id === comment.id || x.parent_id === comment.id);
        for (const x of thread) await repo.updateComment({ ...x, anchor });
      }
      for (const { edit, anchor } of moved.edits) {
        const latest = (await repo.listSuggestedEdits(ctx.chapterId)).find((x) => x.id === edit.id);
        if (latest?.status !== "pending") continue;
        await repo.updateSuggestedEdit({ ...latest, anchor });
      }
    },
  };
}
