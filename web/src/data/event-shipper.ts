// 이벤트를 서버로 보내요(A-33, F8). 몇 초마다 묶어서 보내고, 화면을 떠날 때는 남은 것을 sendBeacon으로 보내요.
// 브라우저 기록(localStorage)은 그대로 남겨요(첫 수정 확인 hasProjectEvent, 1차 /dev 화면, e2e가 읽어요).
// 원고 글자는 담지 않아요(S-09): 화면이 남기는 추가 정보는 짧은 값만이고, 서버도 긴 글자를 거절해요.
import type { TrackedEvent, Uuid } from "@/types";
import type { HttpClient } from "./http";

/** 몇 초마다 보낼지와 한 번에 보낼 수(서버는 50개까지 받아요). */
export const SHIP_INTERVAL_MS = 5_000;
export const SHIP_BATCH = 50;
/** 실패해 쌓인 이벤트를 이 수까지만 들고 있어요(브라우저 메모리를 지키려고). */
export const SHIP_KEEP = 500;

export interface EventShipper {
  enqueue(event: TrackedEvent): void;
  /** 지금 쌓인 것을 보내요(묶음마다 그 책의 토큰을 붙여요). */
  flush(): Promise<void>;
  /** 화면을 떠날 때. 토큰 헤더를 붙일 수 없어 서버가 화면이 보낸 값을 그대로 받아요. */
  flushOnLeave(): void;
  pending(): number;
}

export interface ShipperDeps {
  http: HttpClient;
  /** 그 책에서 지금 맡은 참여자의 토큰. 없으면 null(새 책 만들기 전 화면). */
  tokenFor: (projectId: Uuid) => string | null;
  /** sendBeacon. 없는 환경(테스트)에서는 넘기지 않아요. */
  beacon?: (url: string, body: Blob) => boolean;
  url: string;
}

function toWire(e: TrackedEvent): Record<string, unknown> {
  return {
    event_id: e.event_id,
    name: e.name,
    ts: e.ts,
    anon_id: e.anon_id,
    session_id: e.session_id,
    participant_id: e.participant_id,
    project_id: e.project_id,
    chapter_id: e.chapter_id,
    role: e.role,
    path: e.path,
    props: e.props,
    chapter_version: e.chapter_version ?? null,
  };
}

/** 같은 책(같은 토큰)끼리 묶어요. 한 묶음은 SHIP_BATCH개까지. */
export function groupForShipping(events: TrackedEvent[], tokenFor: (projectId: Uuid) => string | null): { token: string | null; events: TrackedEvent[] }[] {
  const byToken = new Map<string, { token: string | null; events: TrackedEvent[] }>();
  for (const e of events) {
    const token = e.project_id ? tokenFor(e.project_id) : null;
    const key = token ?? "";
    const group = byToken.get(key) ?? { token, events: [] };
    group.events.push(e);
    byToken.set(key, group);
  }
  const out: { token: string | null; events: TrackedEvent[] }[] = [];
  for (const g of byToken.values()) {
    for (let i = 0; i < g.events.length; i += SHIP_BATCH) out.push({ token: g.token, events: g.events.slice(i, i + SHIP_BATCH) });
  }
  return out;
}

export function createEventShipper(deps: ShipperDeps): EventShipper {
  let queue: TrackedEvent[] = [];
  /** 보내는 중인 묶음. 응답을 받기 전에 페이지를 닫으면 sendBeacon에 같이 실어요(Codex 검수 11.22). */
  let inflight: TrackedEvent[] = [];
  let sending = false;

  return {
    enqueue(event) {
      queue.push(event);
      if (queue.length > SHIP_KEEP) queue = queue.slice(queue.length - SHIP_KEEP);
    },

    async flush() {
      if (sending || queue.length === 0) return;
      sending = true;
      inflight = queue;
      queue = [];
      try {
        for (const group of groupForShipping(inflight, deps.tokenFor)) {
          try {
            await deps.http.request("POST", "/events", { token: group.token, body: { events: group.events.map(toWire) } });
          } catch {
            // 연결이 끊겼으면 다음 번에 다시 보내요. 같은 event_id는 서버가 한 번만 저장해요.
            queue = [...group.events, ...queue].slice(-SHIP_KEEP);
          }
          // 이 묶음은 보냈거나 대기열로 돌아갔어요. 보내는 중 목록에서 빼요.
          const done = new Set(group.events.map((e) => e.event_id));
          inflight = inflight.filter((e) => !done.has(e.event_id));
        }
      } finally {
        inflight = [];
        sending = false;
      }
    },

    flushOnLeave() {
      // 보내는 중인 묶음도 함께 실어요. 일반 요청은 페이지를 닫으면 끊길 수 있어요. 겹쳐 가도 서버가 한 번만 저장해요.
      const seen = new Set<string>();
      const taken = [...inflight, ...queue].filter((e) => !seen.has(e.event_id) && seen.add(e.event_id));
      if (!deps.beacon || taken.length === 0) return;
      queue = [];
      for (let i = 0; i < taken.length; i += SHIP_BATCH) {
        // text/plain이라 CORS 사전 요청 없이 가요. 서버가 /events에 한해 JSON으로 읽어요.
        const body = new Blob([JSON.stringify({ events: taken.slice(i, i + SHIP_BATCH).map(toWire) })], { type: "text/plain;charset=UTF-8" });
        if (!deps.beacon(deps.url, body)) queue.push(...taken.slice(i, i + SHIP_BATCH));
      }
    },

    pending() {
      return queue.length;
    },
  };
}
