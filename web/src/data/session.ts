// 이 브라우저에만 있는 화면 상태: 책마다 지금 참여자, 패널 배치(D-10), 개발용 막대 상태.
// 서버가 생겨도 브라우저에 남는 값이라 Repository와 따로 둔다. 바뀌면 구독자에게 알린다.
import type { PanelLayout, Uuid } from "@/types";
import { isOneOf, PANEL_LAYOUTS } from "@/types";
import { STORAGE_PREFIX, type KeyValueStorage } from "./storage";

/** 화면 테마(다크 테마, 11.22 결정). system이면 컴퓨터 설정을 따라요. */
export type ThemeChoice = "system" | "light" | "dark";
const THEMES: readonly ThemeChoice[] = ["system", "light", "dark"];

export interface ClientSession {
  /** 이 책에서 지금 이 브라우저가 맡은 참여자. 없으면 null. */
  getCurrentParticipantId(projectId: Uuid): Uuid | null;
  setCurrentParticipantId(projectId: Uuid, participantId: Uuid): void;
  /** 편집자가 이 브라우저에서 열어 본 의견 id(FR-02 ②: 의견은 카드를 열어 보면 확인할 일에서 줄어든다). */
  getSeenComments(projectId: Uuid): Set<Uuid>;
  markCommentSeen(projectId: Uuid, commentId: Uuid): void;
  getPanelLayout(): PanelLayout;
  setPanelLayout(layout: PanelLayout): void;
  getTheme(): ThemeChoice;
  setTheme(theme: ThemeChoice): void;
  /** 값이 바뀌면 부른다. 돌려준 함수로 구독을 끊는다. */
  subscribe(listener: () => void): () => void;
  /** 바뀔 때마다 달라지는 값. useSyncExternalStore에 쓴다. */
  getVersion(): number;
}

export function createClientSession(storage: KeyValueStorage): ClientSession {
  const listeners = new Set<() => void>();
  let version = 0;
  const notify = () => {
    version += 1;
    listeners.forEach((l) => l());
  };
  const currentKey = (projectId: Uuid) => `${STORAGE_PREFIX}current:${projectId}`;
  const PANEL = `${STORAGE_PREFIX}panel_layout`;
  const THEME = `${STORAGE_PREFIX}theme`;
  const seenKey = (projectId: Uuid) => `${STORAGE_PREFIX}seen_comments:${projectId}`;
  function readSeen(projectId: Uuid): Set<Uuid> {
    try {
      const v: unknown = JSON.parse(storage.getItem(seenKey(projectId)) ?? "[]");
      return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set();
    }
  }

  return {
    getCurrentParticipantId(projectId) {
      return storage.getItem(currentKey(projectId));
    },
    setCurrentParticipantId(projectId, participantId) {
      storage.setItem(currentKey(projectId), participantId);
      notify();
    },
    getSeenComments: readSeen,
    markCommentSeen(projectId, commentId) {
      const seen = readSeen(projectId);
      if (seen.has(commentId)) return;
      seen.add(commentId);
      storage.setItem(seenKey(projectId), JSON.stringify([...seen]));
      notify();
    },
    getPanelLayout() {
      const v = storage.getItem(PANEL);
      return isOneOf(PANEL_LAYOUTS, v) ? v : "single";
    },
    setPanelLayout(layout) {
      storage.setItem(PANEL, layout);
      notify();
    },
    getTheme() {
      const v = storage.getItem(THEME);
      return isOneOf(THEMES, v) ? v : "system";
    },
    setTheme(theme) {
      storage.setItem(THEME, theme);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion() {
      return version;
    },
  };
}
