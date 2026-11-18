// 화면이 데이터를 읽고 쓰는 유일한 길(D-07, NFR-15 ①). 1차는 localStorage 구현, 나중에 HTTP 구현으로 바꾼다.
// 모두 Promise를 돌려주는 것은 HTTP 구현으로 바꿀 때 화면을 고치지 않으려는 것.
import type {
  AiSuggestion,
  Chapter,
  ChapterDoc,
  Comment,
  Layout,
  Participant,
  Project,
  Role,
  RoleLink,
  Snapshot,
  StyleRule,
  StyleRuleType,
  SuggestedEdit,
  TemplateId,
  TrackedEvent,
  Uuid,
  Anchor,
} from "@/types";

/** 지금 이 화면을 보는 사람. 역할별로 걸러 줄 때 쓴다(D-09). */
export interface Viewer {
  participant_id: Uuid;
  role: Role;
}

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what}을(를) 찾을 수 없어요: ${id}`);
    this.name = "NotFoundError";
  }
}

export interface Repository {
  // 책
  createProject(input: { title: string; template_id: TemplateId; layout: Layout }): Promise<Project>;
  getProject(id: Uuid): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  updateProject(project: Project): Promise<Project>;

  // 장
  createChapter(input: { project_id: Uuid; order: number; title: string; doc: ChapterDoc }): Promise<Chapter>;
  getChapter(id: Uuid): Promise<Chapter | null>;
  listChapters(projectId: Uuid): Promise<Chapter[]>;
  updateChapter(chapter: Chapter): Promise<Chapter>;

  // 역할 링크와 참여자
  createRoleLink(projectId: Uuid, role: Role): Promise<RoleLink>;
  findRoleLink(token: Uuid): Promise<RoleLink | null>;
  listRoleLinks(projectId: Uuid): Promise<RoleLink[]>;
  createParticipant(input: { project_id: Uuid; anon_id: Uuid; role: Role; display_name: string }): Promise<Participant>;
  getParticipant(id: Uuid): Promise<Participant | null>;
  listParticipants(projectId: Uuid): Promise<Participant[]>;

  // AI 제안: 보내기 전까지 본인만 본다. 읽기는 언제나 viewer의 것만 돌려준다(FR-23, D-09).
  /**
   * 새로 받은 AI 제안을 저장하고, 지금 대기(pending)인 것을 돌려준다.
   * 같은 주인·장·문단에 원문과 수정안이 같은 제안이 이미 있으면 새로 만들지 않는다.
   * 이미 처리한 것(무시·보냄·적용 등)은 그대로 두어 다시 뜨지 않게 하고(FR-28 ②, FR-29 ③),
   * 대기 중인 것은 id를 유지한 채 위치·버전만 새 값으로 바꾼다.
   */
  saveAiSuggestions(suggestions: AiSuggestion[]): Promise<AiSuggestion[]>;
  listAiSuggestions(chapterId: Uuid, viewer: Viewer): Promise<AiSuggestion[]>;
  getAiSuggestion(id: Uuid, viewer: Viewer): Promise<AiSuggestion | null>;
  updateAiSuggestion(suggestion: AiSuggestion, viewer: Viewer): Promise<AiSuggestion>;

  // 수정 제안·의견
  createSuggestedEdit(input: {
    chapter_id: Uuid;
    anchor: Anchor;
    original: string;
    replacement: string;
    author_id: Uuid;
    ai_origin_id: Uuid | null;
  }): Promise<SuggestedEdit>;
  listSuggestedEdits(chapterId: Uuid): Promise<SuggestedEdit[]>;
  updateSuggestedEdit(edit: SuggestedEdit): Promise<SuggestedEdit>;
  createComment(input: {
    chapter_id: Uuid;
    anchor: Anchor;
    body: string;
    author_id: Uuid;
    parent_id: Uuid | null;
    ai_origin_id: Uuid | null;
  }): Promise<Comment>;
  listComments(chapterId: Uuid): Promise<Comment[]>;
  updateComment(comment: Comment): Promise<Comment>;

  // 표기 원칙·검토본
  createStyleRule(input: { project_id: Uuid; type: StyleRuleType; text: string; created_by: Uuid }): Promise<StyleRule>;
  listStyleRules(projectId: Uuid): Promise<StyleRule[]>;
  createSnapshot(input: { chapter_id: Uuid; doc: ChapterDoc; label: string; created_by: Uuid }): Promise<Snapshot>;
  listSnapshots(chapterId: Uuid): Promise<Snapshot[]>;

  // 행동 기록
  appendEvent(event: TrackedEvent): Promise<void>;
  listEvents(): Promise<TrackedEvent[]>;
}

/** 이 브라우저·이 탭에만 있는 값. 서버가 생겨도 브라우저에 남는다. */
export interface SessionState {
  id: Uuid;
  last_ts: number;
}

export interface ClientIdentityStore {
  /** 브라우저에 저장하는 익명 id. 없으면 만든다. */
  getAnonId(): Uuid;
  /** 이 탭의 방문(session) 기록. */
  readSession(): SessionState | null;
  writeSession(state: SessionState): void;
}
