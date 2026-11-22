// 조판 설정 저장(FR-16)과 검토본 저장(FR-38).
import { isValidLayout, type LayoutChange } from "@/domain/layout";
import { can } from "@/domain/permissions";
import type { Participant, Project, Snapshot, Uuid } from "@/types";
import type { BookDeps } from "./books";

/**
 * 조판 값을 책에 저장한다(FR-16 ②). 마지막으로 바꾼 사람과 시각을 함께 남긴다(⑤).
 * 작가는 바꿀 수 없다(③). 최신 책을 다시 읽어 그 위에 바꾼 값만 얹는다.
 */
export async function saveLayout(deps: Pick<BookDeps, "repo">, projectId: Uuid, change: LayoutChange, by: Participant, now = new Date()): Promise<Project> {
  if (!can(by.role, "change_layout")) throw new Error("조판 값을 바꿀 수 없는 역할이에요");
  if (!isValidLayout(change.layout)) throw new Error("조판 값이 범위를 벗어났어요");
  const current = await deps.repo.getProject(projectId);
  if (!current) throw new Error("책을 찾을 수 없어요");
  return deps.repo.updateProject({
    ...current,
    template_id: change.template_id,
    layout: { ...change.layout },
    layout_updated_by: by.id,
    layout_updated_at: now.toISOString(),
  });
}

/** 검토본 저장(FR-38 ①). 편집자만. 저장 중인 원고가 있으면 화면이 기다린 뒤 부른다. */
export async function saveSnapshot(deps: Pick<BookDeps, "repo">, chapterId: Uuid, label: string, by: Participant): Promise<Snapshot> {
  if (!can(by.role, "save_snapshot")) throw new Error("검토본을 저장할 수 없는 역할이에요");
  const name = label.trim();
  if (!name) throw new Error("검토본 이름이 비어 있어요");
  const chapter = await deps.repo.getChapter(chapterId);
  if (!chapter) throw new Error("장을 찾을 수 없어요");
  return deps.repo.createSnapshot({ chapter_id: chapterId, doc: structuredClone(chapter.doc), label: name, created_by: by.id });
}
