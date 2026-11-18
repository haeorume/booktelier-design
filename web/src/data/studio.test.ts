import { beforeEach, describe, expect, it } from "vitest";
import { createBook, joinWithLink, saveChapterDoc, type BookDeps } from "./books";
import { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
import { createClientSession } from "./session";
import { MemoryStorage } from "./storage";
import { saveLayout, saveSnapshot } from "./studio";
import { changeTemplate, changeValue } from "@/domain/layout";
import { replaceInDoc } from "@/workspace/suggestions";
import type { Chapter, Participant, Project } from "@/types";

let deps: BookDeps;
let project: Project;
let chapter: Chapter;
let editor: Participant;
let author: Participant;
let designer: Participant;

beforeEach(async () => {
  const local = new MemoryStorage();
  deps = {
    repo: createLocalStorageRepository({ storage: new MemoryStorage() }),
    identity: createClientIdentityStore({ local, session: new MemoryStorage() }),
    session: createClientSession(local),
  };
  const book = await createBook(deps, { title: "책", template_id: "essay" });
  ({ project, chapter, editor } = book);
  author = (await joinWithLink(deps, book.links.find((l) => l.role === "author")!, "작가 A")).participant;
  designer = (await joinWithLink(deps, book.links.find((l) => l.role === "designer")!, "디자이너 C")).participant;
});

describe("saveLayout(FR-16)", () => {
  it("바꾼 값과 마지막으로 바꾼 사람·시각을 책에 남긴다(②⑤)", async () => {
    const at = new Date("2026-11-19T10:00:00Z");
    const saved = await saveLayout(deps, project.id, changeValue(project, "line_height", 2), designer, at);
    expect(saved.layout.line_height).toBe(2);
    expect(saved.layout_updated_by).toBe(designer.id);
    expect(saved.layout_updated_at).toBe(at.toISOString());
    expect((await deps.repo.getProject(project.id))?.layout.line_height).toBe(2);
  });

  it("템플릿을 바꾸면 기본값으로 돌아간 값이 저장된다(④)", async () => {
    const saved = await saveLayout(deps, project.id, changeTemplate(project, "novel"), editor);
    expect(saved.template_id).toBe("novel");
    expect(saved.layout).toEqual({ trim: "128x188", margin: 20, line_height: 1.8 });
  });

  it("작가는 바꿀 수 없다(③)", async () => {
    await expect(saveLayout(deps, project.id, changeValue(project, "margin", 15), author)).rejects.toThrow();
    expect((await deps.repo.getProject(project.id))?.layout.margin).toBe(22);
  });

  it("원고는 그대로다(①)", async () => {
    await saveLayout(deps, project.id, changeValue(project, "margin", 15), editor);
    expect((await deps.repo.getChapter(chapter.id))?.doc).toEqual(chapter.doc);
  });
});

describe("saveSnapshot(FR-38)", () => {
  it("그때의 장 원고를 이름과 함께 남기고, 뒤에 원고가 바뀌어도 검토본은 그대로다", async () => {
    const snap = await saveSnapshot(deps, chapter.id, " 1차 검토본 ", editor);
    expect(snap).toMatchObject({ chapter_id: chapter.id, label: "1차 검토본", created_by: editor.id });
    expect(snap.doc).toEqual(chapter.doc);
    await saveChapterDoc(deps, chapter.id, replaceInDoc(chapter.doc, { paragraph_id: "para_01", start: 0, end: 2 }, "런던"));
    expect((await deps.repo.listSnapshots(chapter.id))[0].doc).toEqual(chapter.doc);
  });

  it("편집자만 저장하고, 이름이 비면 저장하지 않는다", async () => {
    await expect(saveSnapshot(deps, chapter.id, "검토본", author)).rejects.toThrow();
    await expect(saveSnapshot(deps, chapter.id, "검토본", designer)).rejects.toThrow();
    await expect(saveSnapshot(deps, chapter.id, "  ", editor)).rejects.toThrow();
    expect(await deps.repo.listSnapshots(chapter.id)).toEqual([]);
  });
});
