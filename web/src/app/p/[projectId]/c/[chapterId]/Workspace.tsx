"use client";

import { useCallback, useEffect, useState } from "react";
import { ChapterList } from "@/components/ChapterList";
import { useSessionVersion } from "@/components/hooks";
import { MessageView, NOT_FOUND } from "@/components/MessageView";
import { ShareDialog } from "@/components/ShareDialog";
import { TopBar } from "@/components/TopBar";
import { bookDeps, currentParticipant } from "@/data";
import { setTrackContext } from "@/events";
import type { Chapter, Participant, Project, RoleLink } from "@/types";
import { ChapterWorkspace } from "./ChapterWorkspace";
import styles from "./page.module.css";

interface Ready {
  kind: "ready";
  project: Project;
  chapter: Chapter;
  chapters: Chapter[];
  me: Participant;
  participants: Participant[];
  links: RoleLink[];
}

type View = { kind: "loading" } | { kind: "not_found" } | { kind: "no_role" } | Ready;

/**
 * 작업 공간(WS-01). 원고 구조 · 지면 · 검토 패널.
 * 이 브라우저에 그 책의 역할이 없으면 안내를, 책이나 장이 없으면 '없는 주소'를 보여 준다(정할 것 2).
 */
export function Workspace({ projectId, chapterId }: { projectId: string; chapterId: string }) {
  const version = useSessionVersion();
  const [view, setView] = useState<{ key: string; value: View }>({ key: "", value: { kind: "loading" } });
  const [sharing, setSharing] = useState(false);
  const key = `${projectId}/${chapterId}/${version}`;

  useEffect(() => {
    let alive = true;
    const deps = bookDeps();
    (async () => {
      const project = await deps.repo.getProject(projectId);
      const chapter = project ? await deps.repo.getChapter(chapterId) : null;
      let value: View;
      if (!project || !chapter || chapter.project_id !== project.id) value = { kind: "not_found" };
      else {
        const me = await currentParticipant(deps, project.id);
        if (!me) value = { kind: "no_role" };
        else {
          const [chapters, participants] = await Promise.all([deps.repo.listChapters(project.id), deps.repo.listParticipants(project.id)]);
          const links = me.role === "editor" ? await deps.repo.listRoleLinks(project.id) : [];
          value = { kind: "ready", project, chapter, chapters, me, participants, links };
          setTrackContext({ participant_id: me.id, project_id: project.id, chapter_id: chapter.id, role: me.role });
        }
      }
      if (alive) setView({ key, value });
    })();
    return () => {
      alive = false;
    };
  }, [projectId, chapterId, key]);

  /** 장 상태가 바뀌면 장 머리와 원고 구조의 배지를 함께 바꾼다(FR-12). */
  const onChapterChange = useCallback((next: Chapter) => {
    setView((v) =>
      v.value.kind === "ready" && v.value.chapter.id === next.id
        ? { ...v, value: { ...v.value, chapter: next, chapters: v.value.chapters.map((c) => (c.id === next.id ? next : c)) } }
        : v,
    );
  }, []);

  const closeShare = useCallback(() => setSharing(false), []);
  const current = view.key === key || view.value.kind === "ready" ? view.value : { kind: "loading" as const };

  if (current.kind === "loading") return null;
  if (current.kind === "not_found") return <MessageView {...NOT_FOUND} />;
  if (current.kind === "no_role") return <MessageView title="받은 링크로 다시 들어와 주세요" body="이 브라우저에는 이 책의 역할이 없어요." />;

  const { project, chapter, chapters, me, participants, links } = current;
  return (
    <div className={styles.workspace}>
      <TopBar
        role={me.role}
        bookTitle={project.title}
        chapterTitle={chapter.title}
        participants={participants}
        currentId={me.id}
        onShare={() => setSharing(true)}
      />
      <div className={styles.columns}>
        <ChapterList projectId={project.id} chapters={chapters} currentId={chapter.id} />
        {/* 역할이나 장이 바뀌면 편집 상태를 새로 시작한다. */}
        <ChapterWorkspace
          key={`${chapter.id}/${me.id}`}
          project={project}
          chapter={chapter}
          me={me}
          participants={participants}
          onChapterChange={onChapterChange}
        />
      </div>
      {sharing && me.role === "editor" && <ShareDialog links={links} onClose={closeShare} />}
    </div>
  );
}
