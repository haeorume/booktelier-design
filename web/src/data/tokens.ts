// 서버가 준 토큰(편집자 토큰·참여자 토큰)을 이 브라우저에 둔다(D-27, routes 규칙 6).
// 참여자 하나에 토큰 하나. 책을 열 때는 그 책에서 지금 맡은 참여자(ClientSession)의 토큰을 쓴다.
// 원문 토큰은 브라우저에만 있고 서버는 해시만 가진다. 이벤트·로그에 넣지 않는다.
import type { Role, Uuid } from "@/types";
import { STORAGE_PREFIX, type KeyValueStorage } from "./storage";

export interface TokenEntry {
  participant_id: Uuid;
  project_id: Uuid;
  role: Role;
  token: string;
}

export interface TokenStore {
  save(entry: TokenEntry): void;
  get(participantId: Uuid): TokenEntry | null;
  forProject(projectId: Uuid): TokenEntry[];
  /** 편집자 토큰 전부(A-03 내 책 목록). */
  editorTokens(): string[];
  remove(participantId: Uuid): void;
}

const KEY = `${STORAGE_PREFIX}tokens`;
/** 주소에서 지운 초대 링크 token을 이 탭에 잠시 둔다(새로고침해도 참여 화면이 이어지게). */
const PENDING_INVITE = `${STORAGE_PREFIX}pending_invite`;

export function createTokenStore(storage: KeyValueStorage): TokenStore {
  function read(): Record<Uuid, TokenEntry> {
    try {
      const v: unknown = JSON.parse(storage.getItem(KEY) ?? "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<Uuid, TokenEntry>) : {};
    } catch {
      return {};
    }
  }
  const write = (all: Record<Uuid, TokenEntry>) => storage.setItem(KEY, JSON.stringify(all));
  return {
    save(entry) {
      write({ ...read(), [entry.participant_id]: entry });
    },
    get(participantId) {
      return read()[participantId] ?? null;
    },
    forProject(projectId) {
      return Object.values(read()).filter((e) => e.project_id === projectId);
    },
    editorTokens() {
      return Object.values(read())
        .filter((e) => e.role === "editor")
        .map((e) => e.token);
    },
    remove(participantId) {
      const all = read();
      delete all[participantId];
      write(all);
    },
  };
}

export function stashInviteToken(session: KeyValueStorage, token: string): void {
  session.setItem(PENDING_INVITE, token);
}

export function readInviteToken(session: KeyValueStorage): string | null {
  return session.getItem(PENDING_INVITE);
}

export function clearInviteToken(session: KeyValueStorage): void {
  session.removeItem(PENDING_INVITE);
}
