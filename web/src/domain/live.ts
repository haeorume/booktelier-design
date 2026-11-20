// 함께 작업(F4): 받은 변경을 지금 화면에 합치는 순수 함수. 화면·서버와 무관하다.
import type { ChapterDoc } from "@/types";

/** 문단 id 순서가 같으면 글자가 바뀐 문단의 번호만, 다르면 null(통째로 바꾼다). */
export function changedParagraphIndexes(before: ChapterDoc, after: ChapterDoc): number[] | null {
  if (before.content.length !== after.content.length) return null;
  const out: number[] = [];
  for (let i = 0; i < before.content.length; i++) {
    const a = before.content[i];
    const b = after.content[i];
    if (a.attrs.id !== b.attrs.id) return null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(i);
  }
  return out;
}

interface ChapterLike {
  id: string;
  order: number;
  version: number;
}

/**
 * 받은 장 목록을 지금 목록에 합친다. 새 장은 더하고, 버전이 같거나 높은 것만 바꾼다
 * (서버는 같은 변경을 두 번 줄 수 있고, 내가 막 저장한 장은 내 쪽이 앞설 수 있다).
 */
export function mergeChapters<T extends ChapterLike>(current: T[], changed: T[]): T[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of changed) {
    const old = byId.get(c.id);
    if (!old || c.version >= old.version) byId.set(c.id, c);
  }
  return [...byId.values()].sort((a, b) => a.order - b.order);
}
