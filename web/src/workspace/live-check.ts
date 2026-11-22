// 실시간 교정 흐름(FR-20, D-18). 작가가 입력을 멈추고 1.5초 뒤, 바뀐 문단만 제공자에 보낸다.
// 실패해도 입력은 막지 않고, 실패한 문단을 '다시 시도'로 다시 보낸다.
import type { AiProvider } from "@/ai";
import type { AiSuggestion, Uuid } from "@/types";

export const LIVE_CHECK_DELAY_MS = 1500;

export type LiveCheckStatus = "idle" | "analyzing" | "failed";

export interface LiveCheckOptions {
  provider: AiProvider;
  chapterId: Uuid;
  requesterId: Uuid;
  /** 보낼 때의 문단 글자. 문단이 사라졌으면 null */
  getText: (paragraphId: string) => string | null;
  getVersion: () => number;
  onStatus: (status: LiveCheckStatus) => void;
  onSuggestions: (suggestions: AiSuggestion[]) => void;
  delayMs?: number;
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
}

export interface LiveCheck {
  /** 작가가 이 문단을 고쳤다. 기다리는 시간을 처음부터 다시 잰다. */
  markChanged(paragraphIds: string[]): void;
  /** 실패한 문단을 바로 다시 보낸다. */
  retry(): Promise<void>;
  dispose(): void;
}

export function createLiveCheck(o: LiveCheckOptions): LiveCheck {
  const delay = o.delayMs ?? LIVE_CHECK_DELAY_MS;
  const timers = o.timers ?? {
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  const pending = new Set<string>();
  let failed = new Set<string>();
  let handle: unknown = null;
  let running = 0;
  let disposed = false;

  async function run(ids: string[]) {
    if (ids.length === 0 || disposed) return;
    running += 1;
    o.onStatus("analyzing");
    const nextFailed = new Set<string>();
    const found: AiSuggestion[] = [];
    for (const paragraph_id of ids) {
      const text = o.getText(paragraph_id);
      if (text === null) continue;
      try {
        const result = await o.provider.liveCheck({
          chapter_id: o.chapterId,
          paragraph_id,
          text,
          base_version: o.getVersion(),
          requester_participant_id: o.requesterId,
        });
        found.push(...result.suggestions);
      } catch {
        nextFailed.add(paragraph_id);
      }
    }
    running -= 1;
    if (disposed) return;
    failed = new Set([...failed].filter((id) => !ids.includes(id)).concat([...nextFailed]));
    if (found.length > 0) o.onSuggestions(found);
    if (running === 0) o.onStatus(failed.size > 0 ? "failed" : "idle");
  }

  return {
    markChanged(paragraphIds) {
      if (disposed) return;
      paragraphIds.forEach((id) => pending.add(id));
      if (handle !== null) timers.clear(handle);
      handle = timers.set(() => {
        handle = null;
        const ids = [...pending];
        pending.clear();
        void run(ids);
      }, delay);
    },
    async retry() {
      await run([...failed]);
    },
    dispose() {
      disposed = true;
      if (handle !== null) timers.clear(handle);
    },
  };
}
