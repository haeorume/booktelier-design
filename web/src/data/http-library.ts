// 서버 구현(F2·F3). 계약은 web/src/types/api.ts(서버 Pydantic에서 만든 것, D-25).
// 토큰은 그 책에서 지금 맡은 참여자의 것을 쓴다(TokenStore + ClientSession).
import { fillLayout, type LayoutChange } from "@/domain/layout";
import type { components } from "@/types/api";
import type { Chapter, ChapterDoc, InviteCheck, Participant, Project, ProjectCard, Role, RoleLink, Snapshot, Uuid } from "@/types";
import { ApiError, type HttpClient } from "./http";
import { VersionConflictError, type ChapterInfo, type Library } from "./library";
import type { ClientIdentityStore } from "./repository";
import type { ClientSession } from "./session";
import type { TokenStore } from "./tokens";

type S = components["schemas"];

export function toProject(p: S["Project"]): Project {
  return {
    id: p.id,
    title: p.title,
    template_id: p.template_id,
    layout: fillLayout(p.template_id, p.layout),
    layout_updated_by: p.layout_updated_by ?? null,
    layout_updated_at: p.layout_updated_at ?? null,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

export function toChapterInfo(c: S["ChapterSummary"]): ChapterInfo {
  return { id: c.id, project_id: c.project_id, order: c.order, title: c.title, status: c.status, version: c.version };
}

/** 서버 오류를 화면 오류로: 409 version_conflict면 최신 장을 담은 VersionConflictError. */
export function rethrowConflict(e: unknown): never {
  if (e instanceof ApiError && e.status === 409 && e.code === "version_conflict" && e.body.latest) {
    throw new VersionConflictError(toChapter(e.body.latest as S["Chapter"]));
  }
  throw e;
}

export function toChapter(c: S["Chapter"]): Chapter {
  return { ...toChapterInfo(c), doc: c.doc as unknown as ChapterDoc };
}

export function toParticipant(p: S["Participant"]): Participant {
  return { id: p.id, project_id: p.project_id, role: p.role, display_name: p.display_name };
}

export function toRoleLink(i: S["Invite"]): RoleLink {
  return { id: i.id, project_id: i.project_id, role: i.role, url: i.url, revoked_at: i.revoked_at ?? null, created_at: i.created_at };
}

function toSnapshot(s: S["Snapshot"] | S["SnapshotSummary"]): Snapshot {
  return {
    id: s.id,
    chapter_id: s.chapter_id,
    version: s.version,
    label: s.label,
    created_by: s.created_by,
    created_at: s.created_at,
    doc: ("doc" in s ? s.doc : { type: "doc", content: [] }) as unknown as ChapterDoc,
  };
}

/** 없거나(404) 내 책이 아니거나(403) 토큰이 틀리면(401) 화면에는 '없는 주소'로 보인다. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && [401, 403, 404].includes(e.status)) return null;
    throw e;
  }
}

/** 이 책에서 지금 맡은 참여자의 토큰. 없으면 이 책의 아무 토큰(편집자 먼저). */
export function createTokenResolver(tokens: TokenStore, session: ClientSession): (projectId: Uuid) => string | null {
  return (projectId) => {
    const current = session.getCurrentParticipantId(projectId);
    const entry = current ? tokens.get(current) : null;
    if (entry && entry.project_id === projectId) return entry.token;
    const all = tokens.forProject(projectId);
    return (all.find((e) => e.role === "editor") ?? all[0])?.token ?? null;
  };
}

export interface HttpLibraryDeps {
  http: HttpClient;
  tokens: TokenStore;
  session: ClientSession;
  identity: ClientIdentityStore;
  newId?: () => Uuid;
}

export function createHttpLibrary(deps: HttpLibraryDeps): Library {
  const { http, tokens, session, identity } = deps;
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const tokenFor = createTokenResolver(tokens, session);

  function need(projectId: Uuid): string {
    const t = tokenFor(projectId);
    if (!t) throw new ApiError(401, "unauthorized", "이 책의 토큰이 없어요");
    return t;
  }

  function remember(p: Participant, token: string) {
    tokens.save({ participant_id: p.id, project_id: p.project_id, role: p.role, token });
    session.setCurrentParticipantId(p.project_id, p.id);
  }

  const library: Library = {
    source: "server",

    async createBook(input) {
      const res = await http.request<S["ProjectCreateOut"]>("POST", "/projects", {
        body: {
          id: newId(),
          title: input.title,
          template_id: input.template_id,
          first_chapter_id: newId(),
          anon_id: identity.getAnonId(),
          start_with_sample: input.startWithSample ?? false,
        },
      });
      const editor = toParticipant(res.participant);
      remember(editor, res.editor_token);
      return { project: toProject(res.project), chapter: toChapter(res.chapter), editor, editorUrl: res.editor_url };
    },

    async myBooks() {
      const editorTokens = tokens.editorTokens();
      if (editorTokens.length === 0) return [];
      const cards = await http.request<S["ProjectCard"][]>("POST", "/projects/list", { body: { editor_tokens: editorTokens } });
      return cards.map(
        (c): ProjectCard => ({
          id: c.id,
          title: c.title,
          template_id: c.template_id,
          stage: c.stage,
          participants: c.participants,
          todo_count: c.todo_count,
          updated_at: c.updated_at,
          first_chapter_id: c.first_chapter_id ?? null,
        }),
      );
    },

    async getProject(projectId) {
      const token = tokenFor(projectId);
      if (!token) return null;
      const res = await orNull(http.request<S["ProjectDetail"]>("GET", `/projects/${projectId}`, { token }));
      return res ? toProject(res.project) : null;
    },

    async listChapters(projectId) {
      const res = await http.request<S["ProjectDetail"]>("GET", `/projects/${projectId}`, { token: need(projectId) });
      return res.chapters.map(toChapterInfo);
    },

    async getChapter(projectId, chapterId) {
      const token = tokenFor(projectId);
      if (!token) return null;
      const res = await orNull(http.request<S["Chapter"]>("GET", `/chapters/${chapterId}`, { token }));
      return res && res.project_id === projectId ? toChapter(res) : null;
    },

    async listParticipants(projectId) {
      const res = await http.request<S["ProjectDetail"]>("GET", `/projects/${projectId}`, { token: need(projectId) });
      return res.participants.map(toParticipant);
    },

    async me(projectId) {
      const token = tokenFor(projectId);
      if (!token) return null;
      const res = await orNull(http.request<S["MeOut"]>("GET", "/me", { token }));
      if (!res || res.project_id !== projectId) return null;
      return { id: res.participant_id, project_id: res.project_id, role: res.role, display_name: res.display_name };
    },

    async myParticipants(projectId) {
      const out: Partial<Record<Role, Participant>> = {};
      for (const e of tokens.forProject(projectId)) {
        const res = await orNull(http.request<S["MeOut"]>("GET", "/me", { token: e.token }));
        if (res) out[res.role] = { id: res.participant_id, project_id: res.project_id, role: res.role, display_name: res.display_name };
      }
      return out;
    },

    switchParticipant(projectId, participantId) {
      session.setCurrentParticipantId(projectId, participantId);
    },

    async saveChapterDoc(projectId, chapterId, doc, baseVersion) {
      try {
        return await http.request<S["DocSaveOut"]>("PUT", `/chapters/${chapterId}/doc`, {
          token: need(projectId),
          body: { doc, base_version: baseVersion },
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.code === "version_conflict" && e.body.latest) {
          throw new VersionConflictError(toChapter(e.body.latest as S["Chapter"]));
        }
        throw e;
      }
    },

    async changeChapterStatus(projectId, chapterId, to) {
      const res = await http.request<S["ChapterSummary"]>("POST", `/chapters/${chapterId}/status`, { token: need(projectId), body: { to } });
      return toChapterInfo(res);
    },

    async addChapter(projectId, title) {
      const res = await http.request<S["Chapter"]>("POST", `/projects/${projectId}/chapters`, {
        token: need(projectId),
        body: { id: newId(), title },
      });
      return toChapter(res);
    },

    async updateLayout(projectId, change: LayoutChange) {
      const body = change.reset_to_default ? { template_id: change.template_id } : { layout: change.patch };
      await http.request<S["LayoutOut"]>("PATCH", `/projects/${projectId}/layout`, { token: need(projectId), body });
      const project = await library.getProject(projectId);
      if (!project) throw new ApiError(404, "not_found", "책을 찾을 수 없어요");
      return project;
    },

    async listRoleLinks(projectId) {
      const res = await http.request<S["Invite"][]>("GET", `/projects/${projectId}/invites`, { token: need(projectId) });
      return res.map(toRoleLink);
    },

    async createRoleLink(projectId, role) {
      if (role === "editor") throw new Error("편집자 링크는 초대 링크로 만들지 않아요");
      const res = await http.request<S["Invite"]>("POST", `/projects/${projectId}/invites`, { token: need(projectId), body: { role } });
      return toRoleLink(res);
    },

    async rotateRoleLink(link) {
      const res = await http.request<S["InviteRotateOut"]>("POST", `/invites/${link.id}/rotate`, { token: need(link.project_id) });
      return toRoleLink(res.created);
    },

    async revokeRoleLink(link) {
      const res = await http.request<S["Invite"]>("POST", `/invites/${link.id}/revoke`, { token: need(link.project_id) });
      return toRoleLink(res);
    },

    async checkInvite(token): Promise<InviteCheck> {
      const res = await orNull(http.request<S["InviteCheckOut"]>("GET", `/invites/${encodeURIComponent(token)}`));
      if (!res || res.state !== "valid" || !res.project_id || !res.project_title || !res.role) return { state: "unusable" };
      return { state: "valid", project_id: res.project_id, project_title: res.project_title, role: res.role };
    },

    async joinInvite(token, displayName) {
      const res = await http.request<S["JoinOut"]>("POST", `/invites/${encodeURIComponent(token)}/join`, {
        body: { display_name: displayName, anon_id: identity.getAnonId() },
      });
      const participant = toParticipant(res.participant);
      const created = tokens.get(participant.id) === null;
      remember(participant, res.participant_token);
      const chapters = await library.listChapters(participant.project_id);
      return { participant, created, firstChapterId: chapters[0]?.id ?? null };
    },

    async enterEditorLink(token) {
      const res = await orNull(http.request<S["MeOut"]>("GET", "/me", { token }));
      if (!res || res.kind !== "editor") return null;
      remember({ id: res.participant_id, project_id: res.project_id, role: res.role, display_name: res.display_name }, token);
      return res.project_id;
    },

    async listSnapshots(projectId, chapterId) {
      const res = await http.request<S["SnapshotSummary"][]>("GET", `/chapters/${chapterId}/snapshots`, { token: need(projectId) });
      return res.map(toSnapshot);
    },

    async createSnapshot(projectId, chapterId, label) {
      const res = await http.request<S["Snapshot"]>("POST", `/chapters/${chapterId}/snapshots`, { token: need(projectId), body: { label } });
      return toSnapshot(res);
    },

    async getSnapshot(projectId, snapshotId) {
      const token = tokenFor(projectId);
      if (!token) return null;
      const res = await orNull(http.request<S["Snapshot"]>("GET", `/snapshots/${snapshotId}`, { token }));
      return res ? toSnapshot(res) : null;
    },
  };
  return library;
}
