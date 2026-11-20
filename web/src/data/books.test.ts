import { TEMPLATES } from "@/domain/templates";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createBook,
  currentParticipant,
  demoManuscript,
  joinWithLink,
  lastActivityTs,
  myEditorProjects,
  myParticipant,
  type BookDeps,
} from "./books";
import { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
import { createClientSession } from "./session";
import { MemoryStorage } from "./storage";
import manuscript from "@/fixtures/manuscript.json";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 한 브라우저. 같은 저장소를 쓰는 다른 브라우저는 local만 다르게 만든다. */
function browser(shared = new MemoryStorage(), local = new MemoryStorage()): BookDeps {
  return {
    repo: createLocalStorageRepository({ storage: shared }),
    identity: createClientIdentityStore({ local, session: new MemoryStorage() }),
    session: createClientSession(local),
  };
}

let deps: BookDeps;
beforeEach(() => {
  deps = browser();
});

describe("createBook: 새 책 만들기(FR-01)", () => {
  it("책, 첫 장, 편집자 참여자, 작가·디자이너 링크를 한 번에 만든다", async () => {
    const { project, chapter, editor, links } = await createBook(deps, { title: "  파리 일기 ", template_id: "essay" });
    expect(project.title).toBe("파리 일기");
    expect(project.template_id).toBe("essay");
    expect(project.layout).toEqual(TEMPLATES.essay.layout);
    expect(editor).toMatchObject({ role: "editor", project_id: project.id, anon_id: deps.identity.getAnonId() });
    expect(links.map((l) => l.role)).toEqual(["author", "designer"]);
    expect(new Set(links.map((l) => l.url)).size).toBe(2);
    for (const l of links) expect(l.url).toMatch(/^\/j\/[0-9a-f-]{36}$/);
    expect(chapter).toMatchObject({ project_id: project.id, order: 1, status: "editing" });
  });

  it("첫 장은 예시 원고다. 장 id는 새 UUID, 문단 id와 글자는 그대로(D-19)", async () => {
    const { chapter } = await createBook(deps, { title: "책", template_id: "novel" });
    expect(chapter.id).toMatch(UUID);
    expect(chapter.id).not.toBe(manuscript.chapter.id);
    expect(chapter.title).toBe(manuscript.chapter.title);
    expect(chapter.doc).toEqual(manuscript.chapter.doc);
  });

  it("만든 브라우저가 그 책의 편집자가 된다", async () => {
    const { project, editor } = await createBook(deps, { title: "책", template_id: "novel" });
    expect((await currentParticipant(deps, project.id))?.id).toBe(editor.id);
  });

  it("제목이 비면 만들지 않는다(FR-01 ②)", async () => {
    await expect(createBook(deps, { title: "   ", template_id: "novel" })).rejects.toThrow();
    expect(await deps.repo.listProjects()).toEqual([]);
  });

  it("두 권을 만들어도 장 id가 겹치지 않는다", async () => {
    const a = await createBook(deps, { title: "가", template_id: "novel" });
    const b = await createBook(deps, { title: "나", template_id: "novel" });
    expect(a.chapter.id).not.toBe(b.chapter.id);
  });
});

describe("joinWithLink: 링크로 들어오기(FR-06)", () => {
  it("링크의 역할로 참여자를 만들고 지금 참여자로 삼는다", async () => {
    const { project, links } = await createBook(deps, { title: "책", template_id: "novel" });
    const author = links.find((l) => l.role === "author")!;
    const { participant, created } = await joinWithLink(deps, author, " 작가 A ");
    expect(created).toBe(true);
    expect(participant).toMatchObject({ role: "author", display_name: "작가 A", project_id: project.id });
    expect((await currentParticipant(deps, project.id))?.role).toBe("author");
  });

  it("같은 브라우저로 다시 들어오면 새로 만들지 않고 이름만 바꾼다", async () => {
    const { project, links } = await createBook(deps, { title: "책", template_id: "novel" });
    const author = links.find((l) => l.role === "author")!;
    const first = await joinWithLink(deps, author, "작가 A");
    const again = await joinWithLink(deps, author, "작가 B");
    expect(again.created).toBe(false);
    expect(again.participant.id).toBe(first.participant.id);
    expect(again.participant.display_name).toBe("작가 B");
    expect((await deps.repo.listParticipants(project.id)).filter((p) => p.role === "author")).toHaveLength(1);
  });

  it("이름이 비면 들어가지 않는다(FR-06 ②)", async () => {
    const { links } = await createBook(deps, { title: "책", template_id: "novel" });
    await expect(joinWithLink(deps, links[0], " ")).rejects.toThrow();
  });

  it("회수된 링크로는 들어가지 않는다", async () => {
    const { links } = await createBook(deps, { title: "책", template_id: "novel" });
    await expect(joinWithLink(deps, { ...links[0], revoked_at: new Date().toISOString() }, "A")).rejects.toThrow();
  });
});

describe("책 범위(FR-07)", () => {
  it("편집자 홈에는 이 브라우저가 편집자로 만든 책만 보인다", async () => {
    const shared = new MemoryStorage();
    const editorBrowser = browser(shared);
    const authorBrowser = browser(shared);
    const { project, links } = await createBook(editorBrowser, { title: "책", template_id: "novel" });
    await joinWithLink(authorBrowser, links[0], "작가");
    expect((await myEditorProjects(editorBrowser)).map((p) => p.id)).toEqual([project.id]);
    expect(await myEditorProjects(authorBrowser)).toEqual([]);
  });

  it("남의 브라우저가 고른 참여자는 지금 참여자로 쓰지 않는다", async () => {
    const shared = new MemoryStorage();
    const a = browser(shared);
    const b = browser(shared);
    const { project, editor } = await createBook(a, { title: "책", template_id: "novel" });
    b.session.setCurrentParticipantId(project.id, editor.id);
    expect(await currentParticipant(b, project.id)).toBeNull();
    expect(await myParticipant(b, project.id, "editor")).toBeNull();
  });
});

describe("기타", () => {
  it("demoManuscript는 예시 원고를 그대로 돌려준다", () => {
    expect(demoManuscript().doc).toEqual(manuscript.chapter.doc);
  });

  it("lastActivityTs는 그 책의 마지막 이벤트 시각", async () => {
    const { project } = await createBook(deps, { title: "책", template_id: "novel" });
    expect(await lastActivityTs(deps, project.id)).toBeNull();
    const base = { anon_id: "a", session_id: "s", participant_id: null, chapter_id: null, role: null, path: "/", props: { panel_layout: "single" as const } };
    await deps.repo.appendEvent({ ...base, event_id: "1", name: "project_created", ts: 100, project_id: project.id });
    await deps.repo.appendEvent({ ...base, event_id: "2", name: "role_link_copied", ts: 300, project_id: project.id });
    await deps.repo.appendEvent({ ...base, event_id: "3", name: "project_created", ts: 900, project_id: "other" });
    expect(await lastActivityTs(deps, project.id)).toBe(300);
  });
});
