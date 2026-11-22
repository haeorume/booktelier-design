// 브라우저 저장소를 직접 만지는 곳은 web/src/data/ 안뿐이다(D-07, R1).

/** localStorage·sessionStorage와 같은 모양. 테스트에서는 메모리 구현을 넣는다. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

function browserStorage(kind: "local" | "session"): KeyValueStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** 브라우저가 아니거나 저장소를 쓸 수 없으면 메모리로 대신한다. */
export function defaultLocalStorage(): KeyValueStorage {
  return browserStorage("local") ?? new MemoryStorage();
}

export function defaultSessionStorage(): KeyValueStorage {
  return browserStorage("session") ?? new MemoryStorage();
}

export const STORAGE_PREFIX = "booktelier:";
