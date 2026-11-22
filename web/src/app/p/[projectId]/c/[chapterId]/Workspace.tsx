"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChapterList } from "@/components/ChapterList";
import { usePanelLayout, useSessionVersion } from "@/components/hooks";
import { MessageView, NOT_FOUND } from "@/components/MessageView";
import { ShareDialog } from "@/components/ShareDialog";
import { TopBar } from "@/components/TopBar";
import { bookDeps, type ChapterInfo, type PresentPerson } from "@/data";
import { mergeChapters } from "@/domain/live";
import { can } from "@/domain/permissions";
import { setTrackContext, track } from "@/events";
import type { Chapter, Participant, Project, Role, RoleLink } from "@/types";
import { ChapterWorkspace } from "./ChapterWorkspace";
import styles from "./page.module.css";

interface Ready {
  kind: "ready";
  project: Project;
  chapter: Chapter;
  chapters: ChapterInfo[];
  me: Participant;
  participants: Participant[];
  links: RoleLink[];
  /** 서버에서 다시 읽기를 마칠 때마다 바뀐다. 편집기는 이 값이 바뀔 때만 새 원고로 다시 만든다(409 복구). */
  loadId: number;
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
  const [layoutOpen, setLayoutOpen] = useState(false);
  /** 오른쪽 검토 패널 접기(DESIGN.md 3장). 접으면 지면이 넓어져요. */
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const panelLayout = usePanelLayout();
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const key = `${projectId}/${chapterId}/${version}`;

  // 원고 저장이 409로 막혀 최신 원고로 다시 그려야 할 때 늘린다(C-4). 편집 상태를 새로 시작한다.
  const [reloads, setReloads] = useState(0);
  const router = useRouter();
  /** 지금 이 책을 연 다른 사람(F4, A-31). 서버가 없으면 null(1차 데모는 참여자를 모두 보여 준다). */
  const [present, setPresent] = useState<PresentPerson[] | null>(() => (bookDeps().live ? [] : null));
  /** 같은 장 안에서 다른 사람의 작업 위치로 갈 때. n은 같은 문단을 다시 눌러도 움직이게 한다. */
  const [jump, setJump] = useState<{ paragraphId: string; n: number } | null>(null);
  /** 상단 바의 자리(장 머리, 저장 상태). 상단 바가 그려진 뒤 작업 공간이 여기에 그려 넣어요. */
  const [chapterSlot, setChapterSlot] = useState<HTMLElement | null>(null);
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    const { library } = bookDeps();
    const loadId = reloads;
    (async () => {
      let value: View;
      try {
        const project = await library.getProject(projectId);
        const chapter = project ? await library.getChapter(project.id, chapterId) : null;
        if (!project || !chapter) value = { kind: "not_found" };
        else {
          const me = await library.me(project.id);
          if (!me) value = { kind: "no_role" };
          else {
            const [chapters, participants] = await Promise.all([library.listChapters(project.id), library.listParticipants(project.id)]);
            const links = me.role === "editor" ? await library.listRoleLinks(project.id) : [];
            value = { kind: "ready", project, chapter, chapters, me, participants, links, loadId };
            setTrackContext({ participant_id: me.id, project_id: project.id, chapter_id: chapter.id, role: me.role, chapter_version: chapter.version });
            // 이 장·버전을 화면에 보였어요. 지면 영향 확인 시간 KPI가 디자이너의 이 기록을 써요(db 탭 5번, F8).
            if (alive) track("screen_entered", { screen: "workspace" });
          }
        }
      } catch {
        value = { kind: "not_found" };
      }
      if (alive) setView({ key, value });
    })();
    return () => {
      alive = false;
    };
  }, [projectId, chapterId, key, reloads]);

  /**
   * 다른 곳에서 원고가 바뀌어 저장이 막혔다(409). 최신 원고를 다시 읽고, 다 읽은 뒤에(loadId가 바뀐 뒤에)
   * 편집기를 새 원고로 다시 만든다. 먼저 다시 만들면 옛 원고로 만들어져 계속 충돌한다(Codex 검수 11.21).
   */
  const onConflict = useCallback(() => setReloads((n) => n + 1), []);

  const reloadLinks = useCallback(async () => {
    const links = await bookDeps().library.listRoleLinks(projectId);
    setView((v) => (v.value.kind === "ready" ? { ...v, value: { ...v.value, links } } : v));
  }, [projectId]);

  const addChapter = useCallback(
    async (title: string) => {
      const created = await bookDeps().library.addChapter(projectId, title);
      track("chapter_added", { order: created.order });
      router.push(`/p/${projectId}/c/${created.id}`);
    },
    [projectId, router],
  );

  /** 장 상태가 바뀌면 장 머리와 원고 구조의 배지를 함께 바꾼다(FR-12). */
  const onChapterChange = useCallback((next: ChapterInfo) => {
    setView((v) =>
      v.value.kind === "ready" && v.value.chapter.id === next.id
        ? {
            ...v,
            // 상태 칸만 합친다. 원고·버전은 편집기가 들고 있어서 여기서 바꾸면 옛 원고로 되돌아간다.
            value: { ...v.value, chapter: { ...v.value.chapter, status: next.status }, chapters: v.value.chapters.map((c) => (c.id === next.id ? { ...c, status: next.status } : c)) },
          }
        : v,
    );
  }, []);

  /** 조판 값이 바뀌면 지면과 조판 설정 패널을 함께 바꾼다(FR-16 ①). */
  const onProjectChange = useCallback((next: Project) => {
    setView((v) => (v.value.kind === "ready" && v.value.project.id === next.id ? { ...v, value: { ...v.value, project: next } } : v));
  }, []);

  /** 다른 곳에서 장이 더해지거나 상태가 바뀌었다(A-31). 원고·버전은 편집기가 따로 받는다(useLive). */
  const onChapters = useCallback((changed: ChapterInfo[]) => {
    setView((v) => {
      const ready = v.value;
      if (ready.kind !== "ready") return v;
      const current = changed.find((c) => c.id === ready.chapter.id);
      return {
        ...v,
        value: {
          ...ready,
          chapters: mergeChapters(ready.chapters, changed),
          chapter: current ? { ...ready.chapter, status: current.status, title: current.title } : ready.chapter,
        },
      };
    });
  }, []);

  /** 접속자를 받는다. 새로 들어온 사람이 있으면 참여자 목록도 다시 읽는다(의견 카드의 이름). */
  const onPresence = useCallback(
    (people: PresentPerson[]) => {
      setPresent(people);
      setView((v) => {
        if (v.value.kind !== "ready") return v;
        const known = new Set(v.value.participants.map((p) => p.id));
        if (people.some((p) => !known.has(p.participant_id))) {
          void bookDeps()
            .library.listParticipants(projectId)
            .then((participants) => setView((w) => (w.value.kind === "ready" ? { ...w, value: { ...w.value, participants } } : w)))
            .catch(() => undefined);
        }
        return v;
      });
    },
    [projectId],
  );

  /** 아바타를 눌러 그 사람의 작업 위치로 간다(FR-47 ②, QA-F10). 위치 자체는 이벤트로 남기지 않는다. */
  const onJump = useCallback(
    (person: PresentPerson) => {
      if (!person.chapter_id || view.value.kind !== "ready") return;
      track("presence_jumped", { target_role: person.role });
      if (person.chapter_id === view.value.chapter.id) {
        if (person.paragraph_id) setJump((j) => ({ paragraphId: person.paragraph_id!, n: (j?.n ?? 0) + 1 }));
        return;
      }
      const hash = person.paragraph_id ? `#para=${encodeURIComponent(person.paragraph_id)}` : "";
      router.push(`/p/${projectId}/c/${person.chapter_id}${hash}`);
    },
    [view.value, projectId, router],
  );

  const chapterTitles = useMemo(
    () => new Map(view.value.kind === "ready" ? view.value.chapters.map((c) => [c.id, c.title]) : []),
    [view.value],
  );

  const closeShare = useCallback(() => setSharing(false), []);
  const current = view.key === key || view.value.kind === "ready" ? view.value : { kind: "loading" as const };

  if (current.kind === "loading") return null;
  if (current.kind === "not_found") return <MessageView {...NOT_FOUND} />;
  if (current.kind === "no_role") return <MessageView title="받은 링크로 다시 들어와 주세요" body="이 브라우저에는 이 책의 역할이 없어요." />;

  const { project, chapter, chapters, me, participants, links, loadId } = current;
  return (
    <div className={styles.workspace}>
      <TopBar
        role={me.role}
        bookTitle={project.title}
        chapterTitle={chapter.title}
        participants={participants}
        currentId={me.id}
        present={present}
        chapterTitles={chapterTitles}
        onJump={onJump}
        chapterSlotRef={setChapterSlot}
        saveSlotRef={setSaveSlot}
        previewHref={`/p/${project.id}/c/${chapter.id}/preview?from=top_bar`}
        panelCollapsed={panelCollapsed}
        onTogglePanel={() => {
          // 펼 때 '하나씩' 배치(D-10)면 조판 설정을 닫아야 검토 패널이 보여요(지면 표시를 누를 때와 같아요, Codex 검수 11.22).
          if (panelCollapsed && panelLayout === "single") setLayoutOpen(false);
          setPanelCollapsed((v) => !v);
        }}
        layoutOpen={layoutOpen}
        onShare={() => setSharing(true)}
        onSnapshots={() => setSnapshotsOpen(true)}
        onToggleLayout={() => setLayoutOpen((o) => !o)}
      />
      <div className={styles.columns}>
        <ChapterList projectId={project.id} chapters={chapters} currentId={chapter.id} onAdd={can(me.role, "add_chapter") ? addChapter : undefined} />
        {/* 역할이나 장이 바뀌면 편집 상태를 새로 시작한다. */}
        <ChapterWorkspace
          key={`${chapter.id}/${me.id}/${loadId}`}
          project={project}
          chapter={chapter}
          me={me}
          participants={participants}
          onChapterChange={onChapterChange}
          onProjectChange={onProjectChange}
          onChapters={onChapters}
          onPresence={onPresence}
          jump={jump}
          slots={{ chapter: chapterSlot, save: saveSlot }}
          layoutOpen={layoutOpen}
          onLayoutOpenChange={setLayoutOpen}
          panelCollapsed={panelCollapsed}
          onPanelReveal={() => setPanelCollapsed(false)}
          snapshotsOpen={snapshotsOpen}
          onSnapshotsClose={() => setSnapshotsOpen(false)}
          onConflict={onConflict}
        />
      </div>
      {sharing && me.role === "editor" && (
        <ShareDialog
          links={links}
          onCreate={async (role: Role) => {
            await bookDeps().library.createRoleLink(project.id, role);
            track("invite_link_created", { role });
            await reloadLinks();
          }}
          onRotate={async (link: RoleLink) => {
            await bookDeps().library.rotateRoleLink(link);
            track("invite_link_rotated", { role: link.role });
            await reloadLinks();
          }}
          onRevoke={async (link: RoleLink) => {
            await bookDeps().library.revokeRoleLink(link);
            track("invite_link_revoked", { role: link.role });
            await reloadLinks();
          }}
          onClose={closeShare}
        />
      )}
    </div>
  );
}
