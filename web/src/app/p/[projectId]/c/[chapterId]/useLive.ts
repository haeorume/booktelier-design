"use client";

import { useEffect, useRef, type RefObject } from "react";
import { CHANGES_INTERVAL_MS, PRESENCE_INTERVAL_MS, type AppDeps, type ChapterInfo, type PresentPerson } from "@/data";
import type { EditorHandle } from "@/components/editor/ManuscriptEditor";
import type { Project } from "@/types";
import type { useManuscriptSave } from "./useManuscriptSave";

interface Options {
  deps: AppDeps;
  project: Project;
  chapterId: string;
  editor: RefObject<EditorHandle | null>;
  save: ReturnType<typeof useManuscriptSave>;
  /** 의견·수정 제안이 바뀌었다. 함께 봄 목록을 다시 읽는다(A-22). */
  reloadShared: () => Promise<void>;
  onChapters: (changed: ChapterInfo[]) => void;
  onProjectChange: (project: Project) => void;
  onPresence: (people: PresentPerson[]) => void;
  /** 받은 원고를 편집기에 반영하지 못했다. 최신 원고로 다시 그린다. */
  onConflict: () => void;
}

/**
 * 함께 작업(F4). 몇 초마다 내 위치를 알리고(A-30) 바뀐 것을 받아(A-31) 지금 화면에 합친다(D-31).
 * - 원고: 이 장의 버전이 올라갔으면 장을 다시 읽어 바뀐 문단만 갈아 끼운다. 입력 중인 글은 덮어쓰지 않는다(FR-18 ④):
 *   저장이 남아 있거나 한글을 조합하는 중이면 반영을 미룬다. 그사이 내 저장이 409로 막히면 최신 원고로 다시 그린다(C-4).
 *   반영할 때는 저장할 것이 없어 내 원고가 서버의 옛 버전과 같으므로, 내 문단을 남기지 않고 받은 원고를 그대로 쓴다.
 *   (남기면 다른 곳에서 그 문단을 고친 것이 지워진다. 같은 작가의 두 탭, server-flow C-4 e2e)
 * - 장 목록·상태, 조판 값, 함께 봄 목록, 접속자를 바꾼다.
 * 서버가 없으면(deps.live가 null) 아무것도 하지 않는다. 위치는 이벤트로 남기지 않는다(FR-47).
 */
export function useLive(options: Options) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const { deps, project, chapterId } = options;
  const live = deps.live;
  const projectId = project.id;

  // 내 위치 알리기
  useEffect(() => {
    if (!live) return;
    const report = () => {
      const paragraphId = latest.current.editor.current?.currentParagraphId() ?? null;
      live.reportPresence(projectId, chapterId, paragraphId).catch(() => undefined);
    };
    report();
    const timer = window.setInterval(report, PRESENCE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [live, projectId, chapterId]);

  // 바뀐 것 받기
  useEffect(() => {
    if (!live) return;
    let alive = true;
    let since: string | null = null;
    /** 받았지만 아직 편집기에 반영하지 못한 이 장의 버전 */
    let wanted = 0;
    let running = false;

    async function syncDoc() {
      const { save, editor } = latest.current;
      if (wanted <= save.version.current || !save.isIdle()) return;
      const remote = await deps.library.getChapter(projectId, chapterId);
      if (!alive || !remote || remote.version <= save.version.current || !save.isIdle()) return;
      const handle = editor.current;
      // 한글을 조합하는 중이면 다음 간격으로 미룬다. 조합 중인 글자는 아직 저장 줄에 들어오지 않았다.
      if (!handle || handle.isComposing()) return;
      if (!save.applyRemote(remote.version, () => handle.syncDoc(remote.doc))) latest.current.onConflict();
    }

    /**
     * 조판 값이 바뀌었으면 책을 다시 읽어 통째로 바꾼다. 템플릿을 바꾸면 조판 값과 template_id가 함께 바뀌고,
     * 마지막에 바꾼 사람·시각(FR-16 ⑤)도 같이 와야 해서 A-31의 layout만으로는 모자란다(Codex 검수 11.21).
     */
    async function reloadProject() {
      const project = await deps.library.getProject(projectId);
      if (alive && project) latest.current.onProjectChange(project);
    }

    /**
     * 커서는 받자마자 넘기지만 다시 읽을 일은 성공할 때까지 남겨 둔다. 다시 읽기가 한 번 실패해도
     * 다음 간격에 다시 해서 변경을 놓치지 않는다(Codex 검수 11.21). 원고는 wanted로 같은 일을 한다.
     */
    let sharedDirty = false;
    let projectDirty = false;

    async function catchUp() {
      if (projectDirty) {
        await reloadProject();
        projectDirty = false;
      }
      if (sharedDirty) {
        await latest.current.reloadShared();
        sharedDirty = false;
      }
      await syncDoc();
    }

    async function tick() {
      if (running) return;
      running = true;
      try {
        const o = latest.current;
        const first = since === null;
        const got = await live!.changes(projectId, o.project.template_id, since);
        if (!alive) return;
        since = got.cursor;
        if (got.chapters.length > 0) o.onChapters(got.chapters);
        const mine = got.chapters.find((c) => c.id === chapterId);
        if (mine) wanted = Math.max(wanted, mine.version);
        // 처음 받기(since 없음)는 장 전부와 조판 값을 주지만, 화면은 방금 읽은 값을 이미 들고 있다.
        if (got.layout && !first) projectDirty = true;
        if (got.sharedChapterIds.includes(chapterId)) sharedDirty = true;
        o.onPresence(got.presence);
      } catch {
        // 연결이 잠시 끊겨도 다음 간격에 같은 since로 다시 받는다.
      }
      try {
        await catchUp();
      } catch {
        // 남은 일은 다음 간격에 다시 한다.
      } finally {
        running = false;
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), CHANGES_INTERVAL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [live, deps, projectId, chapterId]);
}
