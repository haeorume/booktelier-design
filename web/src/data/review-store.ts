// AI 제안·의견·수정 제안(F5). 서버 구현은 서버가 원고를 바꾸고(D-30) 새 버전을 돌려준다.
// 1차 브라우저 저장 구현은 화면 편집기가 원고를 바꾸고 저장한다(chapterVersion = null).
// 화면은 결과의 chapterVersion으로 둘을 구분한다: 값이 있으면 편집기에 같은 글자를 반영하고 다시 저장하지 않는다.
import type { AiSuggestion, Anchor, AiSuggestionKind, ChapterDoc, Comment, StyleRule, StyleRuleType, SuggestedEdit, Uuid } from "@/types";
import type { Viewer } from "./repository";

import type { SendMethod } from "./review";
export type { SendMethod };

export interface ChangeResult<T> {
  item: T;
  /** 서버가 원고를 바꿨으면 새 장 버전. 화면이 원고를 바꿔야 하면 null. */
  chapterVersion: number | null;
}

export interface SharedList {
  comments: Comment[];
  edits: SuggestedEdit[];
  /** 지금 보는 사람이 처음 본 기록이 있는 id(FR-02 ②). */
  seen: Set<Uuid>;
}

export interface Ctx {
  projectId: Uuid;
  chapterId: Uuid;
  viewer: Viewer;
}

export interface ReviewStore {
  readonly source: "server" | "local";

  listMine(ctx: Ctx): Promise<AiSuggestion[]>;
  /** 바뀐 문단만(D-18). 1차 구현은 문단 글자를 제공자에 보내고, 서버는 저장본을 읽는다(C-9). */
  liveCheck(ctx: Ctx, input: { paragraphIds: string[]; baseVersion: number; doc: ChapterDoc }): Promise<AiSuggestion[]>;
  chapterReview(ctx: Ctx, input: { baseVersion: number }): Promise<AiSuggestion[]>;
  /** 1차 구현만 쓰는 정리(무효·자리 옮김). 서버는 읽을 때 스스로 한다. */
  update(ctx: Ctx, s: AiSuggestion): Promise<AiSuggestion>;

  apply(ctx: Ctx, s: AiSuggestion, input: { choice: number; anchor: Anchor; baseVersion: number }): Promise<ChangeResult<AiSuggestion>>;
  undo(ctx: Ctx, s: AiSuggestion, input: { anchor: Anchor; baseVersion: number }): Promise<ChangeResult<AiSuggestion>>;
  dismiss(ctx: Ctx, s: AiSuggestion): Promise<AiSuggestion>;
  keep(ctx: Ctx, s: AiSuggestion): Promise<AiSuggestion>;
  send(ctx: Ctx, s: AiSuggestion, input: { method: SendMethod; choice: number; replacement: string; text: string; anchor: Anchor }): Promise<AiSuggestion>;

  listShared(ctx: Ctx): Promise<SharedList>;
  addComment(ctx: Ctx, input: { anchor: Anchor; original: string; body: string; parent: Comment | null }): Promise<void>;
  addEdit(ctx: Ctx, input: { anchor: Anchor; original: string; replacement: string; reason: string | null; kind: AiSuggestionKind | null }): Promise<void>;
  setCommentResolved(ctx: Ctx, c: Comment, resolved: boolean): Promise<Comment>;
  /** 수락(FR-34). merged는 원래 AI 제안이 반영됨이 됐을 때 그 종류(이벤트용). */
  accept(ctx: Ctx, e: SuggestedEdit, input: { anchor: Anchor; baseVersion: number }): Promise<ChangeResult<SuggestedEdit> & { merged: { id: Uuid; kind: AiSuggestionKind } | null }>;
  reject(ctx: Ctx, e: SuggestedEdit): Promise<SuggestedEdit>;
  markSeen(ctx: Ctx, target: { type: "comment" | "suggested_edit"; id: Uuid }): Promise<void>;
  /** 1차 구현만: 원고가 바뀌면 의견·수정 제안의 새 자리를 저장한다. 서버는 읽을 때 스스로 한다. */
  /** 표기 원칙 목록(A-28, FR-31). 통일 규칙(rule)과 유지 표현(keep). */
  listStyleRules(ctx: Ctx): Promise<StyleRule[]>;
  /** 표기 원칙 한 줄 더하기(A-28). 그 책 참여자면 누구나. */
  addStyleRule(ctx: Ctx, input: { type: StyleRuleType; text: string }): Promise<StyleRule>;
  saveAnchors(ctx: Ctx, moved: { comments: { comment: Comment; anchor: Anchor }[]; edits: { edit: SuggestedEdit; anchor: Anchor }[] }): Promise<void>;
}
