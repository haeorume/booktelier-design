"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JoinForm } from "@/components/JoinForm";
import { MessageView } from "@/components/MessageView";
import { bookDeps, stashInviteToken, tabStorage } from "@/data";
import { setTrackContext, track } from "@/events";
import type { Role } from "@/types";
import styles from "./page.module.css";

type View = { kind: "loading" } | { kind: "unusable" } | { kind: "ready"; role: Role; title: string };

/**
 * 링크로 들어오기(JN-01). 책 제목과 받은 역할을 보여 주고 이름을 받는다(FR-06).
 * 같은 브라우저로 다시 열어도 이름을 다시 묻는다(D-16).
 */
export function JoinView({ token }: { token: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    // 주소에 실린 token은 받은 뒤 주소에서 지운다(D-27, routes 규칙 6). 새로고침해도 이어지게 이 탭에만 둔다.
    stashInviteToken(tabStorage(), token);
    if (window.location.pathname !== "/j") window.history.replaceState(null, "", "/j");
    (async () => {
      const check = await bookDeps().library.checkInvite(token).catch(() => ({ state: "unusable" }) as const);
      if (!alive) return;
      if (check.state !== "valid") {
        setView({ kind: "unusable" });
        return;
      }
      setView({ kind: "ready", role: check.role, title: check.project_title });
      // 화면이 열릴 때마다 남긴다(뒤로 가기로 다시 열어도).
      setTrackContext({ participant_id: null, project_id: check.project_id, chapter_id: null, role: check.role });
      track("role_link_opened", { role: check.role });
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (view.kind === "loading") return null;
  if (view.kind === "unusable") return <MessageView title="링크를 쓸 수 없어요" body="링크를 보낸 편집자에게 새 링크를 받아 주세요." />;

  const { role, title } = view;
  return (
    <main className={styles.main}>
      <p className={styles.brand}>Booktelier(북틀리에)</p>
      <JoinForm
        bookTitle={title}
        role={role}
        onJoin={async (name) => {
          const { participant, created, firstChapterId } = await bookDeps().library.joinInvite(token, name);
          setTrackContext({ participant_id: participant.id, project_id: participant.project_id, role });
          if (created) track("participant_joined", { role, via: "role_link" });
          router.push(firstChapterId ? `/p/${participant.project_id}/c/${firstChapterId}` : "/");
        }}
      />
    </main>
  );
}
