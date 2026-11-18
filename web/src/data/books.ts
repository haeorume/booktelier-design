// 여러 엔터티를 한 번에 다루는 일. 화면은 이 함수들을 부른다.
// 예시 원고(fixtures)는 data/ 를 거쳐 읽는다(D-07, D-19).
import manuscriptFixture from "@/fixtures/manuscript.json";
import { TEMPLATES } from "@/domain/templates";
import { parseChapterDoc, type Chapter, type ChapterDoc, type Participant, type Project, type Role, type RoleLink, type TemplateId, type Uuid } from "@/types";
import type { ClientIdentityStore, Repository } from "./repository";
import type { ClientSession } from "./session";

export interface BookDeps {
  repo: Repository;
  identity: ClientIdentityStore;
  session: ClientSession;
}

/** 데모의 시작 원고. 문단 id와 글자는 예시 그대로다(D-19). */
export function demoManuscript(): { title: string; doc: ChapterDoc } {
  return { title: manuscriptFixture.chapter.title, doc: parseChapterDoc(manuscriptFixture.chapter.doc) };
}

export interface CreatedBook {
  project: Project;
  chapter: Chapter;
  editor: Participant;
  links: RoleLink[];
}

/**
 * 새 책 만들기(FR-01). 책, 첫 장, 이 브라우저의 편집자 참여자(정할 것 13), 작가·디자이너 링크(FR-05)를 만든다.
 * 1차는 데모 모드라 첫 장을 예시 원고로 채운다(W2 결정, FR-01 비고 '빈 첫 장'과 다름).
 */
export async function createBook(deps: BookDeps, input: { title: string; template_id: TemplateId }): Promise<CreatedBook> {
  const title = input.title.trim();
  if (!title) throw new Error("책 제목이 비어 있어요");
  const { repo } = deps;
  const project = await repo.createProject({ title, template_id: input.template_id, layout: { ...TEMPLATES[input.template_id].layout } });
  const manuscript = demoManuscript();
  const chapter = await repo.createChapter({ project_id: project.id, order: 1, title: manuscript.title, doc: manuscript.doc });
  const editor = await repo.createParticipant({
    project_id: project.id,
    anon_id: deps.identity.getAnonId(),
    role: "editor",
    display_name: "편집자",
  });
  const links = [await repo.createRoleLink(project.id, "author"), await repo.createRoleLink(project.id, "designer")];
  deps.session.setCurrentParticipantId(project.id, editor.id);
  return { project, chapter, editor, links };
}

/** 이 브라우저가 이 책에서 맡은 참여자 중 그 역할인 사람. */
export async function myParticipant(deps: BookDeps, projectId: Uuid, role: Role): Promise<Participant | null> {
  const anon = deps.identity.getAnonId();
  const all = await deps.repo.listParticipants(projectId);
  return all.find((p) => p.anon_id === anon && p.role === role) ?? null;
}

/** 이 브라우저가 편집자로 만든 책(FR-02 ①, FR-07). 최근에 만든 것이 먼저. */
export async function myEditorProjects(deps: BookDeps): Promise<Project[]> {
  const projects = await deps.repo.listProjects();
  const mine: Project[] = [];
  for (const p of projects) {
    if (await myParticipant(deps, p.id, "editor")) mine.push(p);
  }
  return mine.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export interface JoinResult {
  participant: Participant;
  /** 이번에 참여자가 새로 생겼는지. participant_joined는 이때만 남긴다. */
  created: boolean;
}

/**
 * 역할 링크로 들어오기(FR-06). 이 브라우저가 그 역할로 이미 들어온 적이 있으면 새로 만들지 않고 이름만 바꾼다.
 * 링크의 역할만 받는다(FR-05 ②). 지금 참여자를 그 사람으로 바꾼다.
 */
export async function joinWithLink(deps: BookDeps, link: RoleLink, displayName: string): Promise<JoinResult> {
  const name = displayName.trim();
  if (!name) throw new Error("이름이 비어 있어요");
  if (link.revoked_at) throw new Error("쓸 수 없는 링크예요");
  const existing = await myParticipant(deps, link.project_id, link.role);
  const participant = existing
    ? await deps.repo.updateParticipant({ ...existing, display_name: name })
    : await deps.repo.createParticipant({ project_id: link.project_id, anon_id: deps.identity.getAnonId(), role: link.role, display_name: name });
  deps.session.setCurrentParticipantId(link.project_id, participant.id);
  return { participant, created: !existing };
}

/** 지금 이 브라우저가 이 책에서 맡은 참여자. 없거나 남의 참여자면 null. */
export async function currentParticipant(deps: BookDeps, projectId: Uuid): Promise<Participant | null> {
  const id = deps.session.getCurrentParticipantId(projectId);
  if (!id) return null;
  const p = await deps.repo.getParticipant(id);
  return p && p.project_id === projectId && p.anon_id === deps.identity.getAnonId() ? p : null;
}

/** 장 원고를 저장한다(FR-09 ②). 저장할 때마다 version이 1 오른다. */
export async function saveChapterDoc(deps: Pick<BookDeps, "repo">, chapterId: Uuid, doc: ChapterDoc): Promise<Chapter> {
  const current = await deps.repo.getChapter(chapterId);
  if (!current) throw new Error("장을 찾을 수 없어요");
  return deps.repo.updateChapter({ ...current, doc, version: current.version + 1 });
}

/** 이 책에서 그 이름의 이벤트가 이미 남았는지. first_edit를 한 번만 남길 때 쓴다(정할 것 8). */
export async function hasProjectEvent(deps: Pick<BookDeps, "repo">, projectId: Uuid, name: string): Promise<boolean> {
  return (await deps.repo.listEvents()).some((e) => e.project_id === projectId && e.name === name);
}

/** 이 책에서 마지막으로 남은 이벤트의 시각(ms). 책 카드의 '최근 변경'. */
export async function lastActivityTs(deps: BookDeps, projectId: Uuid): Promise<number | null> {
  const events = await deps.repo.listEvents();
  let last: number | null = null;
  for (const e of events) if (e.project_id === projectId && (last === null || e.ts > last)) last = e.ts;
  return last;
}
