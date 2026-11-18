"use client";

import { useCallback, useEffect, useState } from "react";
import { useSessionVersion } from "@/components/hooks";
import { MessageView, NOT_FOUND } from "@/components/MessageView";
import { PageView } from "@/components/PageView";
import { ShareDialog } from "@/components/ShareDialog";
import { TopBar } from "@/components/TopBar";
import { bookDeps, currentParticipant } from "@/data";
import { setTrackContext } from "@/events";
import type { Chapter, Participant, Project, RoleLink } from "@/types";
import styles from "./page.module.css";

type View =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "no_role" }
  | { kind: "ready"; project: Project; chapter: Chapter; me: Participant; links: RoleLink[] };

/**
 * 작업 공간(WS-01). W2는 상단 바, 역할 배지, 공유 창, 읽기 전용 지면까지다.
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
          value = { kind: "ready", project, chapter, me, links: me.role === "editor" ? await deps.repo.listRoleLinks(project.id) : [] };
          setTrackContext({ participant_id: me.id, project_id: project.id, chapter_id: chapter.id, role: me.role });
        }
      }
      if (alive) setView({ key, value });
    })();
    return () => {
      alive = false;
    };
  }, [projectId, chapterId, key]);

  const closeShare = useCallback(() => setSharing(false), []);
  const current = view.key === key || view.value.kind === "ready" ? view.value : { kind: "loading" as const };

  if (current.kind === "loading") return null;
  if (current.kind === "not_found") return <MessageView {...NOT_FOUND} />;
  if (current.kind === "no_role") return <MessageView title="받은 링크로 다시 들어와 주세요" body="이 브라우저에는 이 책의 역할이 없어요." />;

  const { project, chapter, me, links } = current;
  return (
    <div className={styles.workspace}>
      <TopBar role={me.role} bookTitle={project.title} chapterTitle={chapter.title} onShare={() => setSharing(true)} />
      <div className={styles.desk}>
        <PageView templateId={project.template_id} layout={project.layout} chapterTitle={chapter.title} doc={chapter.doc} />
      </div>
      {sharing && me.role === "editor" && <ShareDialog links={links} onClose={closeShare} />}
    </div>
  );
}
