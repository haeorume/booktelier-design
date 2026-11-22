import { eventSink, getClientSession, getIdentityStore } from "@/data";
import { createTracker, type TrackContext, type Tracker, type TrackProps } from "./track";
import type { EventName } from "./names";

export * from "./names";
export { createTracker, SESSION_TIMEOUT_MS, type TrackContext, type Tracker, type TrackProps } from "./track";

let tracker: Tracker | null = null;

function defaultTracker(): Tracker {
  // 브라우저에 남기고, 서버가 있으면 서버로도 보내요(A-33, F8).
  tracker ??= createTracker({ sink: eventSink(), identity: getIdentityStore() });
  return tracker;
}

/** 화면이 부르는 행동 기록 함수. panel_layout은 늘 지금 배치로 채운다(D-10). */
export function track(name: EventName, props?: TrackProps) {
  const t = defaultTracker();
  t.setContext({ panel_layout: getClientSession().getPanelLayout() });
  return t.track(name, props);
}

/** 지금 참여자·책·장·역할. 화면이 바뀔 때마다 알려 준다. */
export function setTrackContext(patch: Partial<Omit<TrackContext, "panel_layout">>) {
  defaultTracker().setContext(patch);
}
