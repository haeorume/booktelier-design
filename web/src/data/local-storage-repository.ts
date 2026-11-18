// localStorage 구현. 엔터티마다 키 하나에 배열로 담는다.
import type {
  AiSuggestion,
  Chapter,
  Comment,
  Participant,
  Project,
  RoleLink,
  Snapshot,
  StyleRule,
  SuggestedEdit,
  TrackedEvent,
  Uuid,
} from "@/types";
import { STORAGE_PREFIX, type KeyValueStorage } from "./storage";
import {
  NotFoundError,
  type ClientIdentityStore,
  type Repository,
  type SessionState,
  type Viewer,
} from "./repository";

export interface LocalRepositoryOptions {
  storage: KeyValueStorage;
  newId?: () => Uuid;
  now?: () => Date;
}

interface Rows {
  projects: Project;
  chapters: Chapter;
  role_links: RoleLink;
  participants: Participant;
  ai_suggestions: AiSuggestion;
  suggested_edits: SuggestedEdit;
  comments: Comment;
  style_rules: StyleRule;
  snapshots: Snapshot;
  events: TrackedEvent;
}
type Collection = keyof Rows;
type WithId = { [C in Collection]: Rows[C] extends { id: string } ? C : never }[Collection];

const defaultNewId = () => crypto.randomUUID();

/** 같은 사람에게 같은 문장·같은 수정안으로 뜬 제안인가(FR-28 ②). */
function sameSuggestion(a: AiSuggestion, b: AiSuggestion): boolean {
  return (
    a.owner_participant_id === b.owner_participant_id &&
    a.chapter_id === b.chapter_id &&
    a.anchor.paragraph_id === b.anchor.paragraph_id &&
    a.original === b.original &&
    a.replacement === b.replacement
  );
}

/**
 * 새 제안 s가 기존의 어느 제안과 같은 것인지 찾는다. 기존 제안 하나는 한 번만 짝지어진다.
 * - 같은 id가 있으면 그것.
 * - 아직 짝짓지 않은 같은 제안 중 처음 위치(start)가 가장 가까운 것. 그래서 한 문단의 서로 다른
 *   두 자리에 같은 원문·수정안이 있어도 하나로 합쳐지지 않는다.
 * - 남은 짝이 없는데 같은 제안을 이미 처리했다면 "blocked": 다시 띄우지 않는다(FR-28 ②).
 * - 아무것도 없으면 -1: 새 제안.
 */
function matchExisting(rows: AiSuggestion[], claimed: Set<number>, s: AiSuggestion): number | "blocked" {
  const byId = rows.findIndex((e) => e.id === s.id);
  if (byId !== -1) return byId;
  let best = -1;
  let processed = false;
  rows.forEach((e, i) => {
    if (!sameSuggestion(e, s)) return;
    if (e.status !== "pending") processed = true;
    if (claimed.has(i)) return;
    if (best === -1 || Math.abs(e.anchor.start - s.anchor.start) < Math.abs(rows[best].anchor.start - s.anchor.start)) best = i;
  });
  if (best !== -1) return best;
  return processed ? "blocked" : -1;
}

export function createLocalStorageRepository(options: LocalRepositoryOptions): Repository {
  const { storage } = options;
  const newId = options.newId ?? defaultNewId;
  const nowIso = () => (options.now ? options.now() : new Date()).toISOString();

  const key = (c: Collection) => `${STORAGE_PREFIX}${c}`;

  function read<C extends Collection>(c: C): Rows[C][] {
    const raw = storage.getItem(key(c));
    if (!raw) return [];
    try {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? (v as Rows[C][]) : [];
    } catch {
      return [];
    }
  }
  function write<C extends Collection>(c: C, rows: Rows[C][]) {
    storage.setItem(key(c), JSON.stringify(rows));
  }
  function insert<C extends Collection>(c: C, row: Rows[C]): Rows[C] {
    write(c, [...read(c), row]);
    return structuredClone(row);
  }
  function where<C extends Collection>(c: C, pred: (r: Rows[C]) => boolean): Rows[C][] {
    return read(c).filter(pred);
  }
  function byId<C extends WithId>(c: C, id: string): Rows[C] | null {
    return read(c).find((r) => (r as { id: string }).id === id) ?? null;
  }
  function replace<C extends WithId>(c: C, row: Rows[C], what: string): Rows[C] {
    const id = (row as { id: string }).id;
    const rows = read(c);
    const i = rows.findIndex((r) => (r as { id: string }).id === id);
    if (i === -1) throw new NotFoundError(what, id);
    rows[i] = row;
    write(c, rows);
    return structuredClone(row);
  }
  const ownedBy = (viewer: Viewer) => (s: AiSuggestion) => s.owner_participant_id === viewer.participant_id;

  return {
    async createProject(input) {
      return insert("projects", {
        id: newId(),
        title: input.title,
        template_id: input.template_id,
        layout: input.layout,
        layout_updated_by: null,
        layout_updated_at: null,
        created_at: nowIso(),
      });
    },
    async getProject(id) {
      return byId("projects", id);
    },
    async listProjects() {
      return read("projects");
    },
    async updateProject(project) {
      return replace("projects", project, "책");
    },

    async createChapter(input) {
      return insert("chapters", { id: newId(), ...input, status: "editing", version: 1 });
    },
    async getChapter(id) {
      return byId("chapters", id);
    },
    async listChapters(projectId) {
      return where("chapters", (c) => c.project_id === projectId).sort((a, b) => a.order - b.order);
    },
    async updateChapter(chapter) {
      return replace("chapters", chapter, "장");
    },

    async createRoleLink(projectId, role) {
      return insert("role_links", { token: newId(), project_id: projectId, role, revoked_at: null });
    },
    async findRoleLink(token) {
      return read("role_links").find((l) => l.token === token) ?? null;
    },
    async listRoleLinks(projectId) {
      return where("role_links", (l) => l.project_id === projectId);
    },
    async createParticipant(input) {
      return insert("participants", { id: newId(), ...input });
    },
    async getParticipant(id) {
      return byId("participants", id);
    },
    async updateParticipant(participant) {
      return replace("participants", participant, "참여자");
    },
    async listParticipants(projectId) {
      return where("participants", (p) => p.project_id === projectId);
    },

    async saveAiSuggestions(suggestions) {
      const rows = read("ai_suggestions");
      const claimed = new Set<number>(); // 이번 저장에서 이미 짝지은 기존 제안
      const pending: AiSuggestion[] = [];
      for (const s of suggestions) {
        const i = matchExisting(rows, claimed, s);
        if (i === "blocked") continue; // 같은 문장·수정안을 이미 처리했다(FR-28 ②)
        if (i === -1) {
          rows.push(s);
          claimed.add(rows.length - 1);
          if (s.status === "pending") pending.push(s);
          continue;
        }
        claimed.add(i);
        if (rows[i].status !== "pending") continue; // 처리한 제안은 그대로 둔다
        rows[i] = { ...s, id: rows[i].id };
        pending.push(rows[i]);
      }
      write("ai_suggestions", rows);
      return structuredClone(pending);
    },
    async listAiSuggestions(chapterId, viewer) {
      return where("ai_suggestions", (s) => s.chapter_id === chapterId && ownedBy(viewer)(s));
    },
    async getAiSuggestion(id, viewer) {
      const s = byId("ai_suggestions", id);
      return s && ownedBy(viewer)(s) ? s : null;
    },
    async updateAiSuggestion(suggestion, viewer) {
      const current = byId("ai_suggestions", suggestion.id);
      // 남의 AI 제안은 없는 것과 같다(FR-23). 주인은 바꿀 수 없다.
      if (!current || !ownedBy(viewer)(current)) throw new NotFoundError("AI 제안", suggestion.id);
      return replace("ai_suggestions", { ...suggestion, owner_participant_id: current.owner_participant_id }, "AI 제안");
    },

    async mergeAiSuggestion(id) {
      const current = byId("ai_suggestions", id);
      if (!current || current.status !== "sent") return null;
      return replace("ai_suggestions", { ...current, status: "merged" }, "AI 제안");
    },

    async createSuggestedEdit(input) {
      return insert("suggested_edits", { id: newId(), ...input, status: "pending" });
    },
    async listSuggestedEdits(chapterId) {
      return where("suggested_edits", (e) => e.chapter_id === chapterId);
    },
    async updateSuggestedEdit(edit) {
      return replace("suggested_edits", edit, "수정 제안");
    },
    async createComment(input) {
      return insert("comments", { id: newId(), ...input, status: "open" });
    },
    async listComments(chapterId) {
      return where("comments", (c) => c.chapter_id === chapterId);
    },
    async updateComment(comment) {
      return replace("comments", comment, "의견");
    },

    async createStyleRule(input) {
      return insert("style_rules", { id: newId(), ...input });
    },
    async listStyleRules(projectId) {
      return where("style_rules", (r) => r.project_id === projectId);
    },
    async createSnapshot(input) {
      return insert("snapshots", { id: newId(), ...input, created_at: nowIso() });
    },
    async listSnapshots(chapterId) {
      return where("snapshots", (s) => s.chapter_id === chapterId);
    },

    async appendEvent(event) {
      insert("events", event);
    },
    async listEvents() {
      return read("events");
    },
  };
}

export interface IdentityStoreOptions {
  local: KeyValueStorage;
  session: KeyValueStorage;
  newId?: () => Uuid;
}

export function createClientIdentityStore(options: IdentityStoreOptions): ClientIdentityStore {
  const newId = options.newId ?? defaultNewId;
  const ANON = `${STORAGE_PREFIX}anon_id`;
  const SESSION = `${STORAGE_PREFIX}session`;
  return {
    getAnonId() {
      const existing = options.local.getItem(ANON);
      if (existing) return existing;
      const id = newId();
      options.local.setItem(ANON, id);
      return id;
    },
    readSession() {
      const raw = options.session.getItem(SESSION);
      if (!raw) return null;
      try {
        const v = JSON.parse(raw) as Partial<SessionState>;
        return typeof v.id === "string" && typeof v.last_ts === "number" ? { id: v.id, last_ts: v.last_ts } : null;
      } catch {
        return null;
      }
    },
    writeSession(state) {
      options.session.setItem(SESSION, JSON.stringify(state));
    },
  };
}
