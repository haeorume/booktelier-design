// 책·장·참여·초대 링크·검토본(서버로 옮긴 것, F2·F3). 화면은 이 함수들만 부른다.
// '엔터티 통째 덮어쓰기'(updateChapter(장 전체)) 대신 하려는 일을 그대로 보낸다(리뷰 B-4).
// 서버 구현(http-library.ts)과 1차 localStorage 구현(local-library.ts)이 같은 모양이다(D-20).
// AI 제안·의견·수정 제안·표기 원칙·이벤트는 아직 Repository(localStorage)에 있다(F5·F8에서 옮김).
import type { LayoutChange } from "@/domain/layout";
import type {
  Chapter,
  ChapterDoc,
  ChapterStatus,
  InviteCheck,
  Participant,
  Project,
  ProjectCard,
  Role,
  RoleLink,
  Snapshot,
  TemplateId,
  Uuid,
} from "@/types";

/** 장 목록의 한 줄. 원고(doc)는 장을 열 때 따로 읽는다(A-10). */
export type ChapterInfo = Omit<Chapter, "doc">;

/** 원고를 저장하려는데 그사이 다른 곳에서 바뀌었다(409, C-4, D-30). latest는 최신 장. */
export class VersionConflictError extends Error {
  readonly latest: Chapter;
  constructor(latest: Chapter) {
    super("그사이 원고가 바뀌었어요");
    this.name = "VersionConflictError";
    this.latest = latest;
  }
}

export interface CreatedBook {
  project: Project;
  chapter: Chapter;
  editor: Participant;
  /** 다른 브라우저에서 다시 들어올 편집자 링크(FR-46, ST-02). 서버가 없으면 null. */
  editorUrl: string | null;
}

export interface JoinOutcome {
  participant: Participant;
  /** 이번에 참여자가 새로 생겼는지. participant_joined는 이때만 남긴다. */
  created: boolean;
  firstChapterId: Uuid | null;
}

export interface Library {
  readonly source: "server" | "local";

  /** startWithSample: 발표용으로 첫 장을 1차 예시 원고로 채운다(D-39). 1차 구현은 늘 예시 원고로 시작한다. */
  createBook(input: { title: string; template_id: TemplateId; startWithSample?: boolean }): Promise<CreatedBook>;
  /** 이 브라우저가 편집자로 가진 책(FR-02, FR-07). */
  myBooks(): Promise<ProjectCard[]>;

  getProject(projectId: Uuid): Promise<Project | null>;
  listChapters(projectId: Uuid): Promise<ChapterInfo[]>;
  getChapter(projectId: Uuid, chapterId: Uuid): Promise<Chapter | null>;
  listParticipants(projectId: Uuid): Promise<Participant[]>;

  /** 이 브라우저가 이 책에서 지금 맡은 참여자. 없으면 null. */
  me(projectId: Uuid): Promise<Participant | null>;
  /** 이 브라우저가 이 책에서 가진 역할별 참여자(개발용 막대). */
  myParticipants(projectId: Uuid): Promise<Partial<Record<Role, Participant>>>;
  switchParticipant(projectId: Uuid, participantId: Uuid): void;

  saveChapterDoc(projectId: Uuid, chapterId: Uuid, doc: ChapterDoc, baseVersion: number): Promise<{ version: number; updated_at: string }>;
  changeChapterStatus(projectId: Uuid, chapterId: Uuid, to: ChapterStatus): Promise<ChapterInfo>;
  addChapter(projectId: Uuid, title: string): Promise<Chapter>;
  updateLayout(projectId: Uuid, change: LayoutChange, by: Participant): Promise<Project>;

  listRoleLinks(projectId: Uuid): Promise<RoleLink[]>;
  createRoleLink(projectId: Uuid, role: Role): Promise<RoleLink>;
  rotateRoleLink(link: RoleLink): Promise<RoleLink>;
  revokeRoleLink(link: RoleLink): Promise<RoleLink>;

  checkInvite(token: string): Promise<InviteCheck>;
  joinInvite(token: string, displayName: string): Promise<JoinOutcome>;
  /** 편집자 링크(/e/[token], FR-46). 맞으면 토큰을 저장하고 그 책 id. */
  enterEditorLink(token: string): Promise<Uuid | null>;

  listSnapshots(projectId: Uuid, chapterId: Uuid): Promise<Snapshot[]>;
  createSnapshot(projectId: Uuid, chapterId: Uuid, label: string): Promise<Snapshot>;
  getSnapshot(projectId: Uuid, snapshotId: Uuid): Promise<Snapshot | null>;
}
