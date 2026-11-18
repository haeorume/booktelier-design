import { getIdentityStore, getRepository } from "@/data";
import { createTracker, type TrackContext, type Tracker, type TrackProps } from "./track";
import type { EventName } from "./names";

export * from "./names";
export { createTracker, SESSION_TIMEOUT_MS, type TrackContext, type Tracker, type TrackProps } from "./track";

let tracker: Tracker | null = null;

function defaultTracker(): Tracker {
  tracker ??= createTracker({ sink: getRepository(), identity: getIdentityStore() });
  return tracker;
}

/** 화면이 부르는 행동 기록 함수. */
export function track(name: EventName, props?: TrackProps) {
  return defaultTracker().track(name, props);
}

/** 지금 참여자·책·장·역할·패널 배치. 바뀔 때마다 화면이 알려 준다. */
export function setTrackContext(patch: Partial<TrackContext>) {
  defaultTracker().setContext(patch);
}
