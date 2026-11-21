// 행동 기록. 공통 칸(events 탭 '1. 공통 칸')을 채우고 props에는 늘 panel_layout을 넣는다(D-10).
import type { ClientIdentityStore, Repository } from "@/data";
import { isOneOf, type PanelLayout, type Role, type TrackedEvent, type Uuid } from "@/types";
import { EVENT_NAMES, type EventName } from "./names";

/** 30분 동안 아무 이벤트가 없으면 방문을 새로 센다(정할 것 12). */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export interface TrackContext {
  participant_id: Uuid | null;
  project_id: Uuid | null;
  chapter_id: Uuid | null;
  role: Role | null;
  panel_layout: PanelLayout;
  /** 지금 보는 장의 원고 버전(공통 칸, F8). 작업 공간·미리보기가 알려 줘요. */
  chapter_version: number | null;
}

export interface TrackerOptions {
  sink: Pick<Repository, "appendEvent">;
  identity: ClientIdentityStore;
  now?: () => number;
  newId?: () => Uuid;
  /** 화면 경로. 기본은 브라우저 주소의 pathname. */
  path?: () => string;
}

export type TrackProps = Record<string, unknown> & { panel_layout?: never };

export interface Tracker {
  track(name: EventName, props?: TrackProps): TrackedEvent;
  setContext(patch: Partial<TrackContext>): void;
  getContext(): TrackContext;
}

const EMPTY_CONTEXT: TrackContext = {
  participant_id: null,
  project_id: null,
  chapter_id: null,
  role: null,
  panel_layout: "single",
  chapter_version: null,
};

function browserPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

export function createTracker(options: TrackerOptions): Tracker {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const path = options.path ?? browserPath;
  let context: TrackContext = { ...EMPTY_CONTEXT };

  function sessionId(ts: number): Uuid {
    const prev = options.identity.readSession();
    const id = prev && ts - prev.last_ts < SESSION_TIMEOUT_MS ? prev.id : newId();
    options.identity.writeSession({ id, last_ts: ts });
    return id;
  }

  return {
    track(name, props = {}) {
      if (!isOneOf(EVENT_NAMES, name)) throw new Error(`events 탭에 없는 이벤트 이름이에요: ${String(name)}`);
      const ts = now();
      const event: TrackedEvent = {
        event_id: newId(),
        name,
        ts,
        anon_id: options.identity.getAnonId(),
        session_id: sessionId(ts),
        participant_id: context.participant_id,
        project_id: context.project_id,
        chapter_id: context.chapter_id,
        role: context.role,
        path: path(),
        props: { ...props, panel_layout: context.panel_layout },
        chapter_version: context.chapter_version,
      };
      void options.sink.appendEvent(event);
      return event;
    },
    setContext(patch) {
      context = { ...context, ...patch };
    },
    getContext() {
      return { ...context };
    },
  };
}
