// 서버 구현(F5). 계약은 web/src/types/api.ts. 보내기 전 AI 제안은 주인 것만 온다(D-29).
// 적용·실행 취소·수락은 서버가 원고를 바꾸고 새 버전을 준다(D-30). 그사이 원고가 바뀌었으면 VersionConflictError.
import type { components } from "@/types/api";
import type { AiSuggestion, Anchor, Comment, SuggestedEdit, Uuid } from "@/types";
import { ApiError, type HttpClient } from "./http";
import { rethrowConflict } from "./http-library";
import type { Ctx, ReviewStore } from "./review-store";

type S = components["schemas"];

export function toSuggestion(s: S["AiSuggestion"]): AiSuggestion {
  return {
    id: s.id,
    chapter_id: s.chapter_id,
    anchor: s.anchor,
    original: s.original,
    replacement: s.replacement,
    alternatives: s.alternatives,
    kind: s.kind,
    reason: s.reason,
    source: s.source,
    target_role: s.target_role,
    base_version: s.base_version,
    created_at: s.created_at,
    status: s.status,
    owner_participant_id: s.owner_participant_id,
    evidence: s.evidence ? { type: s.evidence.type, label: s.evidence.label, excerpt: s.evidence.excerpt, chunk_id: s.evidence.chunk_id } : null,
  };
}

function toEdit(e: S["SuggestedEdit"]): SuggestedEdit {
  return {
    id: e.id,
    chapter_id: e.chapter_id,
    anchor: e.anchor,
    original: e.original,
    replacement: e.replacement,
    author_id: e.author_id,
    status: e.status,
    ai_origin_id: e.ai_origin_id ?? null,
    reason: e.reason ?? null,
    kind: e.kind ?? null,
  };
}

/** 답글은 서버에서 자리가 비어 있다. 화면은 1차처럼 원래 의견의 자리와 원문을 함께 쓴다. */
function toComments(list: S["Comment"][]): Comment[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  return list.map((c) => {
    const root = c.parent_id ? byId.get(c.parent_id) : undefined;
    const anchor: Anchor = c.anchor ?? root?.anchor ?? { paragraph_id: "", start: 0, end: 0 };
    return {
      id: c.id,
      chapter_id: c.chapter_id,
      anchor,
      original: c.original ?? root?.original ?? "",
      body: c.body,
      author_id: c.author_id,
      status: c.status,
      parent_id: c.parent_id ?? null,
      ai_origin_id: c.ai_origin_id ?? null,
      resolved_by: c.resolved_by ?? null,
      resolved_at: c.resolved_at ?? null,
    };
  });
}

export function createHttpReview(http: HttpClient, tokenFor: (projectId: Uuid) => string | null): ReviewStore {
  function token(ctx: Ctx): string {
    const t = tokenFor(ctx.projectId);
    if (!t) throw new ApiError(401, "unauthorized", "이 책의 토큰이 없어요");
    return t;
  }
  async function call<T>(ctx: Ctx, method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await http.request<T>(method, path, { token: token(ctx), body });
    } catch (e) {
      rethrowConflict(e);
    }
  }

  return {
    source: "server",

    async listMine(ctx) {
      return (await call<S["AiSuggestion"][]>(ctx, "GET", `/chapters/${ctx.chapterId}/ai-suggestions`)).map(toSuggestion);
    },
    async liveCheck(ctx, input) {
      // 원문은 보내지 않는다. 서버가 저장본을 읽는다(C-9).
      const res = await call<S["AiSuggestion"][]>(ctx, "POST", `/chapters/${ctx.chapterId}/live-check`, {
        paragraph_ids: input.paragraphIds,
        base_version: input.baseVersion,
      });
      return res.map(toSuggestion);
    },
    async chapterReview(ctx, input) {
      const res = await call<S["ReviewOut"]>(ctx, "POST", `/chapters/${ctx.chapterId}/review`, { base_version: input.baseVersion });
      return res.suggestions.map(toSuggestion);
    },
    async update(_ctx, s) {
      return s; // 서버는 읽을 때 스스로 정리한다(A-19)
    },

    async apply(ctx, s, input) {
      const res = await call<S["AiActionOut"]>(ctx, "POST", `/ai-suggestions/${s.id}/apply`, { choice: input.choice, base_version: input.baseVersion });
      return { item: toSuggestion(res.suggestion), chapterVersion: res.chapter_version ?? null };
    },
    async undo(ctx, s, input) {
      const res = await call<S["AiActionOut"]>(ctx, "POST", `/ai-suggestions/${s.id}/undo`, { base_version: input.baseVersion });
      return { item: toSuggestion(res.suggestion), chapterVersion: res.chapter_version ?? null };
    },
    async dismiss(ctx, s) {
      return toSuggestion((await call<S["AiActionOut"]>(ctx, "POST", `/ai-suggestions/${s.id}/dismiss`)).suggestion);
    },
    async keep(ctx, s) {
      return toSuggestion((await call<S["AiActionOut"]>(ctx, "POST", `/ai-suggestions/${s.id}/keep`)).suggestion);
    },
    async send(ctx, s, input) {
      const choice = Math.max(0, [s.replacement, ...s.alternatives].indexOf(input.replacement));
      const res = await call<S["SendOut"]>(ctx, "POST", `/ai-suggestions/${s.id}/send`, { as: input.method, text: input.text, choice });
      return toSuggestion(res.suggestion);
    },

    async listShared(ctx) {
      const res = await call<S["SharedOut"]>(ctx, "GET", `/chapters/${ctx.chapterId}/shared`);
      return { comments: toComments(res.comments), edits: res.suggested_edits.map(toEdit), seen: new Set(res.seen) };
    },
    async addComment(ctx, input) {
      await call(ctx, "POST", `/chapters/${ctx.chapterId}/comments`, {
        id: crypto.randomUUID(),
        body: input.body,
        ...(input.parent ? { parent_id: input.parent.id } : { anchor: input.anchor, original: input.original }),
      });
    },
    async addEdit(ctx, input) {
      await call(ctx, "POST", `/chapters/${ctx.chapterId}/suggested-edits`, {
        id: crypto.randomUUID(),
        anchor: input.anchor,
        original: input.original,
        replacement: input.replacement,
        reason: input.reason,
        kind: input.kind,
      });
    },
    async setCommentResolved(ctx, c, resolved) {
      const res = await call<S["Comment"]>(ctx, "POST", `/comments/${c.id}/${resolved ? "resolve" : "reopen"}`);
      return { ...c, ...toComments([res])[0], anchor: c.anchor, original: c.original };
    },
    async accept(ctx, e, input) {
      const res = await call<S["AcceptOut"]>(ctx, "POST", `/suggested-edits/${e.id}/accept`, { base_version: input.baseVersion });
      const merged = res.merged_ai_suggestion_id ? { id: res.merged_ai_suggestion_id, kind: e.kind ?? "polish" } : null;
      return { item: toEdit(res.suggested_edit), chapterVersion: res.chapter_version, merged };
    },
    async reject(ctx, e) {
      return toEdit(await call<S["SuggestedEdit"]>(ctx, "POST", `/suggested-edits/${e.id}/reject`));
    },
    async markSeen(ctx, target) {
      await call(ctx, "POST", "/views", { target_type: target.type, target_id: target.id });
    },
    async saveAnchors() {
      // 서버는 읽을 때 자리를 다시 찾아 저장한다(A-22, NFR-05).
    },
  };
}
