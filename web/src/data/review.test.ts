import { beforeEach, describe, expect, it } from "vitest";
import { createBook, joinWithLink, type BookDeps } from "./books";
import { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
import { markAccepted, markRejected, sendAiSuggestion, unseenCommentCount } from "./review";
import { createClientSession } from "./session";
import { MemoryStorage } from "./storage";
import type { Viewer } from "./repository";
import { createDemoProvider } from "@/ai";
import type { AiSuggestion, Chapter, Participant } from "@/types";

let deps: BookDeps;
let chapter: Chapter;
let projectId: string;
let editor: Viewer;
let author: Participant;
let mine: AiSuggestion[];

beforeEach(async () => {
  const local = new MemoryStorage();
  deps = {
    repo: createLocalStorageRepository({ storage: new MemoryStorage() }),
    identity: createClientIdentityStore({ local, session: new MemoryStorage() }),
    session: createClientSession(local),
  };
  const book = await createBook(deps, { title: "책", template_id: "essay" });
  chapter = book.chapter;
  projectId = book.project.id;
  editor = { participant_id: book.editor.id, role: "editor" };
  author = (await joinWithLink(deps, book.links.find((l) => l.role === "author")!, "작가 A")).participant;
  const review = await createDemoProvider({ delayMs: 0, sleep: async () => {} }).chapterReview({
    chapter_id: chapter.id,
    base_version: 1,
    requester_participant_id: editor.participant_id,
  });
  mine = await deps.repo.saveAiSuggestions(review.suggestions);
});

const pick = (original: string) => mine.find((s) => s.original === original)!;

describe("sendAiSuggestion(FR-29)", () => {
  it("수정 제안으로 보내면 수정 제안과 설명 의견이 함께 생기고, 둘 다 AI 제안을 가리킨다", async () => {
    const s = pick("몇일");
    const r = await sendAiSuggestion(deps, editor, s, { method: "suggested_edit", anchor: s.anchor, replacement: "며칠", text: "  '며칠'로 써요. " });
    expect(r.edit).toMatchObject({ original: "몇일", replacement: "며칠", status: "pending", ai_origin_id: s.id, author_id: editor.participant_id });
    expect(r.comment).toMatchObject({ body: "'며칠'로 써요.", ai_origin_id: s.id, parent_id: null, status: "open" });
    expect(r.suggestion.status).toBe("sent");
  });

  it("의견으로 보내면 의견만 생긴다", async () => {
    const s = pick("루부르");
    const r = await sendAiSuggestion(deps, editor, s, { method: "comment", anchor: s.anchor, replacement: s.replacement, text: "한 가지로 맞춰요" });
    expect(r.edit).toBeNull();
    expect(await deps.repo.listSuggestedEdits(chapter.id)).toEqual([]);
    expect(await deps.repo.listComments(chapter.id)).toHaveLength(1);
  });

  it("고른 대안으로 보낼 수 있다(FR-29 ②)", async () => {
    const s = pick("모나리자를");
    const r = await sendAiSuggestion(deps, editor, s, { method: "suggested_edit", anchor: s.anchor, replacement: "「모나리자」를", text: "작품 제목" });
    expect(r.edit?.replacement).toBe("「모나리자」를");
  });

  it("보낸 제안은 다시 보낼 수 없고, 문구가 비면 보내지 않는다(FR-29 ③)", async () => {
    const s = pick("몇일");
    await expect(sendAiSuggestion(deps, editor, s, { method: "comment", anchor: s.anchor, replacement: "", text: "  " })).rejects.toThrow();
    const { suggestion } = await sendAiSuggestion(deps, editor, s, { method: "comment", anchor: s.anchor, replacement: "", text: "a" });
    await expect(sendAiSuggestion(deps, editor, suggestion, { method: "comment", anchor: s.anchor, replacement: "", text: "b" })).rejects.toThrow();
  });

  it("보낸 뒤에도 작가에게는 AI 제안이 보이지 않는다(FR-23)", async () => {
    const s = pick("몇일");
    await sendAiSuggestion(deps, editor, s, { method: "suggested_edit", anchor: s.anchor, replacement: "며칠", text: "x" });
    expect(await deps.repo.listAiSuggestions(chapter.id, { participant_id: author.id, role: "author" })).toEqual([]);
  });
});

describe("수락과 거절(FR-34, FR-35)", () => {
  it("AI 제안에서 온 수정 제안을 수락하면 수락됨이 되고 원래 AI 제안은 반영됨이 된다", async () => {
    const s = pick("몇일");
    const { edit } = await sendAiSuggestion(deps, editor, s, { method: "suggested_edit", anchor: s.anchor, replacement: "며칠", text: "x" });
    const { accepted, merged } = await markAccepted(deps, edit!, edit!.anchor);
    expect(accepted.status).toBe("accepted");
    expect(merged).toMatchObject({ id: s.id, status: "merged", kind: "spelling" });
    expect((await deps.repo.getAiSuggestion(s.id, editor))?.status).toBe("merged");
  });

  it("직접 남긴 수정 제안은 반영할 AI 제안이 없다", async () => {
    const edit = await deps.repo.createSuggestedEdit({ chapter_id: chapter.id, anchor: { paragraph_id: "para_04", start: 0, end: 2 }, original: "다음", replacement: "이튿", author_id: editor.participant_id, ai_origin_id: null });
    expect((await markAccepted(deps, edit, edit.anchor)).merged).toBeNull();
  });

  it("거절하면 거절됨이 되고 다시 처리할 수 없다", async () => {
    const edit = await deps.repo.createSuggestedEdit({ chapter_id: chapter.id, anchor: { paragraph_id: "para_04", start: 0, end: 2 }, original: "다음", replacement: "이튿", author_id: editor.participant_id, ai_origin_id: null });
    const rejected = await markRejected(deps, edit);
    expect(rejected.status).toBe("rejected");
    await expect(markAccepted(deps, rejected, rejected.anchor)).rejects.toThrow();
  });

  it("보내지 않은 AI 제안은 반영됨으로 바꾸지 않는다", async () => {
    expect(await deps.repo.mergeAiSuggestion(pick("몇일").id)).toBeNull();
  });
});

describe("확인할 일의 의견(FR-02 ②)", () => {
  const anchor = { paragraph_id: "para_01", start: 0, end: 2 };

  it("다른 역할이 남긴 의견 중 편집자가 열어 보지 않은 것만 센다", async () => {
    const byAuthor = await deps.repo.createComment({ chapter_id: chapter.id, anchor, original: "파리", body: "봐 주세요", author_id: author.id, parent_id: null, ai_origin_id: null });
    await deps.repo.createComment({ chapter_id: chapter.id, anchor, original: "파리", body: "편집자 메모", author_id: editor.participant_id, parent_id: null, ai_origin_id: null });
    expect(await unseenCommentCount(deps, projectId)).toBe(1);
    deps.session.markCommentSeen(projectId, byAuthor.id);
    expect(await unseenCommentCount(deps, projectId)).toBe(0);
  });
});
