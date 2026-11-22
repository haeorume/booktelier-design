"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageView } from "@/components/MessageView";
import { bookDeps } from "@/data";
import { setTrackContext, track } from "@/events";

/**
 * 편집자 링크로 들어오기(JN-03, FR-46 ②). 화면 없이 토큰을 확인하고 이 브라우저에 저장한 뒤 편집자 홈으로 보낸다.
 * 주소의 토큰은 바로 지운다(D-27, routes 규칙 6). 맞지 않으면 안내를 보인다.
 */
export function EditorLinkView({ token }: { token: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (window.location.pathname !== "/e") window.history.replaceState(null, "", "/e");
    (async () => {
      const { library } = bookDeps();
      const before = (await library.myBooks().catch(() => [])).length;
      const projectId = await library.enterEditorLink(token).catch(() => null);
      if (!alive) return;
      if (!projectId) {
        setFailed(true);
        return;
      }
      const me = await library.me(projectId);
      setTrackContext({ participant_id: me?.id ?? null, project_id: projectId, chapter_id: null, role: "editor", chapter_version: null });
      track("editor_link_opened", { had_books: before > 0 });
      router.replace("/home");
    })();
    return () => {
      alive = false;
    };
  }, [token, router]);

  if (!failed) return null;
  return <MessageView eyebrow="EDITOR LINK UNAVAILABLE" title="링크를 쓸 수 없어요" body="편집자 링크가 맞는지 확인해 주세요. 책을 만든 브라우저에서는 편집자 홈으로 들어올 수 있어요." />;
}
