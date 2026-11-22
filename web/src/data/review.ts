// 사람끼리 주고받는 일: 보내기(FR-29), 수정 제안 수락·거절(FR-34, FR-35), 확인할 일의 의견 세기(FR-02 ②).
import { transitionAiSuggestion, transitionSuggestedEdit } from "@/domain/transitions";
import type { AiSuggestion, Anchor, Comment, SuggestedEdit, Uuid } from "@/types";
import type { BookDeps } from "./books";
import type { Viewer } from "./repository";

export type SendMethod = "comment" | "suggested_edit";

export interface SendInput {
  method: SendMethod;
  /** 지금 원고에서 다시 찾은 자리 */
  anchor: Anchor;
  /** 수정 제안으로 보낼 때 고른 수정안 또는 대안(FR-29 ②) */
  replacement: string;
  /** 다듬은 설명 문구 */
  text: string;
}

export interface SendResult {
  suggestion: AiSuggestion;
  comment: Comment;
  edit: SuggestedEdit | null;
}

/**
 * AI 제안을 보낸다(FR-29). 의견으로 보내면 의견 하나, 수정 제안으로 보내면 수정 제안과
 * 설명 문구를 담은 의견을 함께 만든다(W4 결정: 수정 제안에는 글을 담을 칸이 없어서). 둘 다 ai_origin_id를 단다.
 * 원래 AI 제안은 보냄이 되어 다시 보낼 수 없다(FR-29 ③).
 */
export async function sendAiSuggestion(deps: Pick<BookDeps, "repo">, viewer: Viewer, s: AiSuggestion, input: SendInput): Promise<SendResult> {
  const text = input.text.trim();
  if (!text) throw new Error("보내는 문구가 비어 있어요");
  const sent = transitionAiSuggestion({ ...s, anchor: input.anchor }, "send");
  const edit =
    input.method === "suggested_edit"
      ? await deps.repo.createSuggestedEdit({
          chapter_id: s.chapter_id,
          anchor: input.anchor,
          original: s.original,
          replacement: input.replacement,
          author_id: viewer.participant_id,
          ai_origin_id: s.id,
        })
      : null;
  const comment = await deps.repo.createComment({
    chapter_id: s.chapter_id,
    anchor: input.anchor,
    original: s.original,
    body: text,
    author_id: viewer.participant_id,
    parent_id: null,
    ai_origin_id: s.id,
  });
  const suggestion = await deps.repo.updateAiSuggestion(sent, viewer);
  return { suggestion, comment, edit };
}

/**
 * 수정 제안을 수락한 뒤의 기록(FR-34 ②). 원고를 바꾸는 일은 화면의 편집기가 먼저 한다.
 * AI 제안에서 온 것이면 원래 AI 제안을 반영됨으로 바꾼다(data-contract merged).
 */
export async function markAccepted(deps: Pick<BookDeps, "repo">, edit: SuggestedEdit, anchor: Anchor) {
  const accepted = await deps.repo.updateSuggestedEdit(transitionSuggestedEdit({ ...edit, anchor }, "accept"));
  const merged = edit.ai_origin_id ? await deps.repo.mergeAiSuggestion(edit.ai_origin_id) : null;
  return { accepted, merged };
}

export async function markRejected(deps: Pick<BookDeps, "repo">, edit: SuggestedEdit) {
  return deps.repo.updateSuggestedEdit(transitionSuggestedEdit(edit, "reject"));
}

/** 다른 역할이 남긴 의견 중 이 브라우저의 편집자가 아직 열어 보지 않은 수(FR-02 ②). */
export async function unseenCommentCount(deps: BookDeps, projectId: Uuid): Promise<number> {
  const participants = await deps.repo.listParticipants(projectId);
  const editorIds = new Set(participants.filter((p) => p.role === "editor").map((p) => p.id));
  const seen = deps.session.getSeenComments(projectId);
  let count = 0;
  for (const chapter of await deps.repo.listChapters(projectId)) {
    for (const c of await deps.repo.listComments(chapter.id)) {
      if (!editorIds.has(c.author_id) && !seen.has(c.id)) count += 1;
    }
  }
  return count;
}
