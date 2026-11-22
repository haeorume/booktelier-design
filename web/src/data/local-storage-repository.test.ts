import { TEMPLATES } from "@/domain/templates";
import { beforeEach, describe, expect, it } from "vitest";
import { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
import { MemoryStorage } from "./storage";
import { NotFoundError, type Repository, type Viewer } from "./repository";
import { parseChapterDoc, parseChapterReviewResult } from "@/types";
import { createDemoProvider } from "@/ai";
import chapterReview from "@/fixtures/chapter_review.json";
import manuscript from "@/fixtures/manuscript.json";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const layout = structuredClone(TEMPLATES.novel.layout);

let storage: MemoryStorage;
let repo: Repository;

beforeEach(() => {
  storage = new MemoryStorage();
  repo = createLocalStorageRepository({ storage });
});

describe("ID와 token은 UUID(D-07, QA-48)", () => {
  it("책·장·역할 링크·참여자", async () => {
    const p = await repo.createProject({ title: "파리 일기", template_id: "essay", layout });
    const c = await repo.createChapter({ project_id: p.id, order: 1, title: "1장", doc: parseChapterDoc(manuscript.chapter.doc) });
    const link = await repo.createRoleLink(p.id, "author");
    const who = await repo.createParticipant({ project_id: p.id, anon_id: crypto.randomUUID(), role: "author", display_name: "작가" });
    for (const id of [p.id, c.id, link.id, link.url.slice(3), who.id]) expect(id).toMatch(UUID);
  });
});

describe("저장한 값은 확정 상태 값으로 남고 다시 열어도 그대로다", () => {
  it("새 장은 editing, 새 수정 제안은 pending, 새 의견은 open", async () => {
    const p = await repo.createProject({ title: "책", template_id: "novel", layout });
    const c = await repo.createChapter({ project_id: p.id, order: 1, title: "1장", doc: parseChapterDoc(manuscript.chapter.doc) });
    const anchor = { paragraph_id: "para_01", start: 0, end: 2 };
    const e = await repo.createSuggestedEdit({ chapter_id: c.id, anchor, original: "파리", replacement: "Paris", author_id: "x", ai_origin_id: null });
    const m = await repo.createComment({ chapter_id: c.id, anchor, original: "파리", body: "좋아요", author_id: "x", parent_id: null, ai_origin_id: null });
    expect([c.status, e.status, m.status]).toEqual(["editing", "pending", "open"]);

    const reopened = createLocalStorageRepository({ storage });
    expect((await reopened.getChapter(c.id))?.status).toBe("editing");
    expect(await reopened.listSuggestedEdits(c.id)).toEqual([e]);
  });

  it("장 목록은 order 순", async () => {
    const p = await repo.createProject({ title: "책", template_id: "novel", layout });
    const doc = parseChapterDoc(manuscript.chapter.doc);
    await repo.createChapter({ project_id: p.id, order: 2, title: "2장", doc });
    await repo.createChapter({ project_id: p.id, order: 1, title: "1장", doc });
    expect((await repo.listChapters(p.id)).map((c) => c.title)).toEqual(["1장", "2장"]);
  });

  it("없는 것을 고치면 NotFoundError", async () => {
    const p = await repo.createProject({ title: "책", template_id: "novel", layout });
    await expect(repo.updateProject({ ...p, id: crypto.randomUUID() })).rejects.toThrow(NotFoundError);
  });
});

describe("AI 제안은 보내기 전까지 본인만 본다(FR-23, D-09)", () => {
  const editor: Viewer = { participant_id: crypto.randomUUID(), role: "editor" };
  const author: Viewer = { participant_id: crypto.randomUUID(), role: "author" };
  const review = parseChapterReviewResult(chapterReview);
  const mine = review.suggestions.map((s) => ({ ...s, owner_participant_id: editor.participant_id }));

  beforeEach(async () => {
    await repo.saveAiSuggestions(mine);
  });

  it("주인에게는 보이고 다른 역할에는 보이지 않는다", async () => {
    expect(await repo.listAiSuggestions(review.chapter_id, editor)).toHaveLength(5);
    expect(await repo.listAiSuggestions(review.chapter_id, author)).toEqual([]);
    expect(await repo.getAiSuggestion(mine[0].id, author)).toBeNull();
  });

  it("보낸 뒤에도 상대에게는 AI 제안이 보이지 않는다", async () => {
    await repo.updateAiSuggestion({ ...mine[0], status: "sent" }, editor);
    expect(await repo.listAiSuggestions(review.chapter_id, author)).toEqual([]);
    expect((await repo.getAiSuggestion(mine[0].id, editor))?.status).toBe("sent");
  });

  it("남의 AI 제안은 고칠 수 없다", async () => {
    await expect(repo.updateAiSuggestion({ ...mine[0], status: "dismissed" }, author)).rejects.toThrow(NotFoundError);
  });

});

describe("AI 제안을 다시 받아 저장할 때", () => {
  const author: Viewer = { participant_id: crypto.randomUUID(), role: "author" };
  const editor: Viewer = { participant_id: crypto.randomUUID(), role: "editor" };
  let chapterId: string;
  const ai = createDemoProvider({ delayMs: 0 });
  const review = (who: Viewer) => ai.chapterReview({ chapter_id: chapterId, base_version: 1, requester_participant_id: who.participant_id });

  beforeEach(async () => {
    const p = await repo.createProject({ title: "책", template_id: "essay", layout });
    chapterId = (await repo.createChapter({ project_id: p.id, order: 1, title: "1장", doc: parseChapterDoc(manuscript.chapter.doc) })).id;
  });

  it("브라우저에서 만든 장으로 받은 제안을 그 장에서 읽을 수 있다", async () => {
    await repo.saveAiSuggestions((await review(editor)).suggestions);
    expect(await repo.listAiSuggestions(chapterId, editor)).toHaveLength(5);
  });

  it("무시하거나 보낸 제안은 다시 검토해도 대기로 돌아오지 않는다(FR-28 ②, FR-29 ③)", async () => {
    const [first, second] = await repo.saveAiSuggestions((await review(editor)).suggestions);
    await repo.updateAiSuggestion({ ...first, status: "dismissed" }, editor);
    await repo.updateAiSuggestion({ ...second, status: "sent" }, editor);

    const pendingAgain = await repo.saveAiSuggestions((await review(editor)).suggestions);
    expect(pendingAgain).toHaveLength(3);
    const list = await repo.listAiSuggestions(chapterId, editor);
    expect(list).toHaveLength(5);
    expect(list.find((s) => s.id === first.id)?.status).toBe("dismissed");
    expect(list.find((s) => s.id === second.id)?.status).toBe("sent");
  });

  it("대기 중인 제안은 다시 받아도 id가 그대로다", async () => {
    const a = await repo.saveAiSuggestions((await review(editor)).suggestions);
    const b = await repo.saveAiSuggestions((await review(editor)).suggestions);
    expect(b.map((s) => s.id)).toEqual(a.map((s) => s.id));
  });

  it("한 문단의 서로 다른 두 자리에 같은 원문·수정안이 있으면 둘 다 남는다", async () => {
    const [base] = (await review(editor)).suggestions;
    const at = (start: number) => ({ ...base, id: crypto.randomUUID(), anchor: { ...base.anchor, start, end: start + base.original.length } });
    const saved = await repo.saveAiSuggestions([at(4), at(30)]);
    expect(new Set(saved.map((s) => s.id)).size).toBe(2);
    const list = await repo.listAiSuggestions(chapterId, editor);
    expect(list.map((s) => s.anchor.start).sort((a, b) => a - b)).toEqual([4, 30]);

    // 다시 받아도 두 자리 모두 id를 유지한 채 하나씩 짝지어진다.
    const again = await repo.saveAiSuggestions([at(30), at(4)]);
    expect(new Set(again.map((s) => s.id))).toEqual(new Set(saved.map((s) => s.id)));
    expect(await repo.listAiSuggestions(chapterId, editor)).toHaveLength(2);
  });

  it("같은 문장·수정안을 무시했으면 다른 자리로 다시 와도 뜨지 않는다(FR-28 ②)", async () => {
    const [base] = (await review(editor)).suggestions;
    const [first] = await repo.saveAiSuggestions([base]);
    await repo.updateAiSuggestion({ ...first, status: "dismissed" }, editor);
    const moved = { ...base, id: crypto.randomUUID(), anchor: { ...base.anchor, start: 40, end: 40 + base.original.length } };
    expect(await repo.saveAiSuggestions([moved])).toEqual([]);
    expect(await repo.listAiSuggestions(chapterId, editor)).toHaveLength(1);
  });

  it("다른 참여자가 같은 검토를 받아도 서로 덮어쓰지 않는다(FR-23)", async () => {
    await repo.saveAiSuggestions((await review(editor)).suggestions);
    const [mine] = await repo.listAiSuggestions(chapterId, editor);
    await repo.updateAiSuggestion({ ...mine, status: "dismissed" }, editor);

    await repo.saveAiSuggestions((await review(author)).suggestions);
    const editorList = await repo.listAiSuggestions(chapterId, editor);
    const authorList = await repo.listAiSuggestions(chapterId, author);
    expect(editorList).toHaveLength(5);
    expect(editorList.find((s) => s.id === mine.id)?.status).toBe("dismissed");
    expect(authorList).toHaveLength(5);
    expect(authorList.every((s) => s.status === "pending")).toBe(true);
  });
});

describe("브라우저 id", () => {
  it("anon_id는 한 번 만들면 유지된다", () => {
    const local = new MemoryStorage();
    const a = createClientIdentityStore({ local, session: new MemoryStorage() }).getAnonId();
    const b = createClientIdentityStore({ local, session: new MemoryStorage() }).getAnonId();
    expect(a).toMatch(UUID);
    expect(b).toBe(a);
  });

  it("깨진 저장 값은 빈 것으로 본다", async () => {
    storage.setItem("booktelier:projects", "{깨짐");
    expect(await repo.listProjects()).toEqual([]);
  });
});

describe("1차에 저장된 초대 링크(Codex 검수 11.21)", () => {
  it("token만 있는 옛 행을 id·주소가 있는 새 모양으로 읽고, 취소도 된다", async () => {
    const storage = new MemoryStorage();
    const old = { token: crypto.randomUUID(), project_id: "book", role: "author", revoked_at: null };
    storage.setItem("booktelier:role_links", JSON.stringify([old]));
    const legacy = createLocalStorageRepository({ storage });
    const [link] = await legacy.listRoleLinks("book");
    expect(link).toMatchObject({ id: old.token, url: `/j/${old.token}`, role: "author", revoked_at: null });
    expect((await legacy.findRoleLink(old.token))?.url).toBe(`/j/${old.token}`);
    const revoked = await legacy.revokeRoleLink(link.id);
    expect(revoked.revoked_at).not.toBeNull();
    expect((await legacy.listRoleLinks("book"))[0].revoked_at).not.toBeNull();
  });
});
