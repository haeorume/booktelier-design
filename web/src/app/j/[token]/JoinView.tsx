"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JoinForm } from "@/components/JoinForm";
import { MessageView } from "@/components/MessageView";
import { bookDeps, joinWithLink } from "@/data";
import { setTrackContext, track } from "@/events";
import type { Project, RoleLink } from "@/types";
import styles from "./page.module.css";

type View = { kind: "loading" } | { kind: "unusable" } | { kind: "ready"; link: RoleLink; project: Project; firstChapterId: string };

/**
 * 링크로 들어오기(JN-01). 책 제목과 받은 역할을 보여 주고 이름을 받는다(FR-06).
 * 같은 브라우저로 다시 열어도 이름을 다시 묻는다(D-16).
 */
export function JoinView({ token }: { token: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    const deps = bookDeps();
    (async () => {
      const link = await deps.repo.findRoleLink(token);
      const project = link && !link.revoked_at ? await deps.repo.getProject(link.project_id) : null;
      const chapters = project ? await deps.repo.listChapters(project.id) : [];
      if (!alive) return;
      if (!link || !project || chapters.length === 0) {
        setView({ kind: "unusable" });
        return;
      }
      setView({ kind: "ready", link, project, firstChapterId: chapters[0].id });
      // 화면이 열릴 때마다 남긴다(뒤로 가기로 다시 열어도). 개발 모드에서 효과가 두 번 돌아도
      // 먼저 돈 쪽은 읽기가 끝나기 전에 정리되어(alive=false) 여기까지 오지 않는다.
      setTrackContext({ participant_id: null, project_id: project.id, chapter_id: null, role: link.role });
      track("role_link_opened", { role: link.role });
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (view.kind === "loading") return null;
  if (view.kind === "unusable") return <MessageView title="링크를 쓸 수 없어요" body="링크를 보낸 편집자에게 새 링크를 받아 주세요." />;

  const { link, project, firstChapterId } = view;
  return (
    <main className={styles.main}>
      <p className={styles.brand}>Booktelier(북틀리에)</p>
      <JoinForm
        bookTitle={project.title}
        role={link.role}
        onJoin={async (name) => {
          const { participant, created } = await joinWithLink(bookDeps(), link, name);
          setTrackContext({ participant_id: participant.id, project_id: project.id, role: link.role });
          if (created) track("participant_joined", { role: link.role, via: "role_link" });
          router.push(`/p/${project.id}/c/${firstChapterId}`);
        }}
      />
    </main>
  );
}
