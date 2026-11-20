// 1차 localStorage 구현(D-20). 서버 없이 도는 단위 테스트와 e2e(NEXT_PUBLIC_DATA_SOURCE=local)가 쓴다.
// 1차 함수(books.ts·studio.ts)를 감싸서 library.ts와 같은 모양으로 맞춘다.
import { bookStage, pendingTaskCount } from "@/domain/books";
import { fillLayout } from "@/domain/layout";
import { nextChapterStatus, type ChapterAction } from "@/domain/transitions";
import type { ChapterStatus, Participant, ProjectCard, Role } from "@/types";
import { ROLES } from "@/types";
import { createBook, currentParticipant, joinWithLink, lastActivityTs, myEditorProjects, myParticipant, type BookDeps } from "./books";
import { VersionConflictError, type ChapterInfo, type Library } from "./library";
import { unseenCommentCount } from "./review";
import { saveLayout, saveSnapshot } from "./studio";

const EMPTY = { type: "doc", content: [] } as const;

function info(c: ChapterInfo): ChapterInfo {
  return { id: c.id, project_id: c.project_id, order: c.order, title: c.title, status: c.status, version: c.version };
}

/** 장 상태 전이(FR-12~14). 서버 A-14와 같은 표. */
function actionFor(from: ChapterStatus, to: ChapterStatus): ChapterAction | "reopen" | null {
  if (from === "reviewed" && to === "editing") return "reopen";
  for (const a of ["request_review", "complete_review"] as const) if (nextChapterStatus(from, a) === to) return a;
  return null;
}

export function createLocalLibrary(deps: BookDeps): Library {
  const { repo, session } = deps;

  const library: Library = {
    source: "local",

    async createBook(input) {
      const { project, chapter, editor } = await createBook(deps, input);
      return { project, chapter, editor, editorUrl: null };
    },

    async myBooks() {
      const cards: ProjectCard[] = [];
      for (const project of await myEditorProjects(deps)) {
        const chapters = await repo.listChapters(project.id);
        const last = await lastActivityTs(deps, project.id);
        cards.push({
          id: project.id,
          title: project.title,
          template_id: project.template_id,
          stage: bookStage(chapters),
          participants: (await repo.listParticipants(project.id)).map((p) => ({ id: p.id, role: p.role, display_name: p.display_name })),
          todo_count: pendingTaskCount(chapters, await unseenCommentCount(deps, project.id)),
          updated_at: last === null ? project.created_at : new Date(last).toISOString(),
          first_chapter_id: chapters[0]?.id ?? null,
        });
      }
      return cards;
    },

    async getProject(projectId) {
      const p = await repo.getProject(projectId);
      return p ? { ...p, layout: fillLayout(p.template_id, p.layout) } : null;
    },
    async listChapters(projectId) {
      return (await repo.listChapters(projectId)).map(info);
    },
    async getChapter(projectId, chapterId) {
      const c = await repo.getChapter(chapterId);
      return c && c.project_id === projectId ? c : null;
    },
    listParticipants: (projectId) => repo.listParticipants(projectId),

    me: (projectId) => currentParticipant(deps, projectId),
    async myParticipants(projectId) {
      const out: Partial<Record<Role, Participant>> = {};
      for (const r of ROLES) {
        const p = await myParticipant(deps, projectId, r);
        if (p) out[r] = p;
      }
      return out;
    },
    switchParticipant(projectId, participantId) {
      session.setCurrentParticipantId(projectId, participantId);
    },

    async saveChapterDoc(projectId, chapterId, doc, baseVersion) {
      const current = await repo.getChapter(chapterId);
      if (!current || current.project_id !== projectId) throw new Error("장을 찾을 수 없어요");
      if (current.version !== baseVersion) throw new VersionConflictError(current);
      const saved = await repo.updateChapter({ ...current, doc, version: current.version + 1 });
      return { version: saved.version, updated_at: new Date().toISOString() };
    },

    async changeChapterStatus(projectId, chapterId, to) {
      const current = await repo.getChapter(chapterId);
      if (!current || current.project_id !== projectId) throw new Error("장을 찾을 수 없어요");
      if (!actionFor(current.status, to)) throw new Error(`'${current.status}'에서 '${to}'로 바꿀 수 없어요`);
      return info(await repo.updateChapter({ ...current, status: to }));
    },

    async addChapter(projectId, title) {
      const chapters = await repo.listChapters(projectId);
      const order = chapters.reduce((m, c) => Math.max(m, c.order), 0) + 1;
      return repo.createChapter({ project_id: projectId, order, title, doc: structuredClone(EMPTY) as never });
    },

    async updateLayout(projectId, change, by) {
      const saved = await saveLayout(deps, projectId, change, by);
      return { ...saved, layout: fillLayout(saved.template_id, saved.layout) };
    },

    listRoleLinks: (projectId) => repo.listRoleLinks(projectId),
    createRoleLink: (projectId, role) => repo.createRoleLink(projectId, role),
    async rotateRoleLink(link) {
      await repo.revokeRoleLink(link.id);
      return repo.createRoleLink(link.project_id, link.role);
    },
    revokeRoleLink: (link) => repo.revokeRoleLink(link.id),

    async checkInvite(token) {
      const link = await repo.findRoleLink(token);
      const project = link && !link.revoked_at ? await repo.getProject(link.project_id) : null;
      if (!link || !project) return { state: "unusable" };
      return { state: "valid", project_id: project.id, project_title: project.title, role: link.role };
    },
    async joinInvite(token, displayName) {
      const link = await repo.findRoleLink(token);
      if (!link || link.revoked_at) throw new Error("쓸 수 없는 링크예요");
      const { participant, created } = await joinWithLink(deps, link, displayName);
      const chapters = await repo.listChapters(link.project_id);
      return { participant, created, firstChapterId: chapters[0]?.id ?? null };
    },
    async enterEditorLink() {
      return null; // 1차에는 편집자 링크가 없다(FR-46은 서버에서)
    },

    async listSnapshots(_projectId, chapterId) {
      return repo.listSnapshots(chapterId);
    },
    async createSnapshot(projectId, chapterId, label) {
      const me = await currentParticipant(deps, projectId);
      if (!me) throw new Error("이 책의 역할이 없어요");
      return saveSnapshot(deps, chapterId, label, me);
    },
    async getSnapshot(_projectId, snapshotId) {
      for (const c of await repo.listChapters(_projectId)) {
        const found = (await repo.listSnapshots(c.id)).find((s) => s.id === snapshotId);
        if (found) return found;
      }
      return null;
    },
  };
  return library;
}
