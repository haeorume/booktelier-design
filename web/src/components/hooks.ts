"use client";

import { useSyncExternalStore } from "react";
import { getClientSession } from "@/data";
import type { PanelLayout } from "@/types";

/** 지금 참여자나 패널 배치가 바뀌면 다시 그리게 하는 값. 서버에서는 0. */
export function useSessionVersion(): number {
  const session = getClientSession();
  return useSyncExternalStore(session.subscribe, session.getVersion, () => 0);
}

/** 지금 패널 배치(D-10). 서버에서 그릴 때는 기본값 '하나씩'. */
export function usePanelLayout(): PanelLayout {
  const session = getClientSession();
  return useSyncExternalStore(session.subscribe, session.getPanelLayout, () => "single");
}
