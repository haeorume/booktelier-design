"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { bookDeps, currentParticipant, getClientSession, joinWithLink, myParticipant } from "@/data";
import { ROLE_LABEL } from "@/domain/labels";
import { setTrackContext, track } from "@/events";
import { ROLES, type PanelLayout, type Project, type Role, type RoleLink } from "@/types";
import { usePanelLayout, useSessionVersion } from "./hooks";
import { JoinForm } from "./JoinForm";
import styles from "./DevBar.module.css";

/**
 * 개발용 막대(FR-41 ④, 불변 규칙 R14).
 * 개발 서버(npm run dev, e2e)에서는 보이고, 배포 빌드에서는 NEXT_PUBLIC_DEV_BAR=1일 때만 보여요.
 * 개발 서버에서도 숨기려면 NEXT_PUBLIC_DEV_BAR=0.
 */
const DEV_BAR_FLAG = process.env.NEXT_PUBLIC_DEV_BAR;
export const DEV_BAR_ENABLED =
  DEV_BAR_FLAG === "1" || (DEV_BAR_FLAG !== "0" && process.env.NODE_ENV === "development");

const PANEL_LABEL: Record<PanelLayout, string> = { single: "하나씩", split: "나란히" };

interface BarState {
  projectId: string;
  project: Project | null;
  current: Role | null;
  /** 이 브라우저가 이미 그 역할로 들어와 있는지 */
  joined: Record<Role, boolean>;
  links: RoleLink[];
}

function projectIdFrom(pathname: string): string | null {
  return /^\/p\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

/**
 * 개발용 역할 전환 막대(DV-02). 주소는 그대로 두고 이 브라우저의 지금 참여자만 바꾼다(정할 것 4).
 * 작가·디자이너로 처음 바꿀 때는 이름을 묻고(FR-41 ②), 그 뒤에는 입력한 이름을 쓴다(D-16).
 * 개발용 요소라 권한이 없는 버튼을 숨기지 않고 비활성으로 둔다(D-15 예외).
 */
export function DevBar() {
  const pathname = usePathname();
  const projectId = projectIdFrom(pathname);
  const version = useSessionVersion();
  const [state, setState] = useState<BarState | null>(null);
  const [joining, setJoining] = useState<Role | null>(null);
  const panel = usePanelLayout();

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const deps = bookDeps();
    (async () => {
      const project = await deps.repo.getProject(projectId);
      const me = await currentParticipant(deps, projectId);
      const joined = Object.fromEntries(
        await Promise.all(ROLES.map(async (r) => [r, !!(await myParticipant(deps, projectId, r))] as const)),
      ) as Record<Role, boolean>;
      const links = await deps.repo.listRoleLinks(projectId);
      if (alive) setState({ projectId, project, current: me?.role ?? null, joined, links });
    })();
    return () => {
      alive = false;
    };
  }, [projectId, version]);

  if (!DEV_BAR_ENABLED) return null;
  const bar = state && state.projectId === projectId && state.project ? state : null;

  async function switchTo(role: Role) {
    if (!bar) return;
    const deps = bookDeps();
    const mine = await myParticipant(deps, bar.projectId, role);
    if (mine) {
      deps.session.setCurrentParticipantId(bar.projectId, mine.id);
      return;
    }
    if (role !== "editor") setJoining(role);
  }

  async function join(role: Role, name: string) {
    if (!bar) return;
    const link = bar.links.find((l) => l.role === role && !l.revoked_at);
    if (!link) return;
    const { participant, created } = await joinWithLink(bookDeps(), link, name);
    setTrackContext({ participant_id: participant.id, project_id: bar.projectId, role });
    if (created) track("participant_joined", { role, via: "dev_bar" });
    setJoining(null);
  }

  return (
    <>
      <div className={styles.bar} role="toolbar" aria-label="개발용 막대" data-testid="dev-bar">
        <span className={styles.tag}>개발용</span>
        <span className={styles.group}>
          <span className={styles.groupLabel}>역할</span>
          {ROLES.map((r) => {
            const disabled = !bar || (r === "editor" && !bar.joined.editor);
            return (
              <button
                key={r}
                type="button"
                className={styles.option}
                aria-pressed={bar?.current === r}
                disabled={disabled}
                title={disabled && bar ? "이 브라우저가 만든 책이 아니에요" : undefined}
                onClick={() => switchTo(r)}
              >
                {ROLE_LABEL[r]}
              </button>
            );
          })}
        </span>
        <span className={styles.group}>
          <span className={styles.groupLabel}>패널</span>
          {(["single", "split"] as const).map((p) => (
            <button key={p} type="button" className={styles.option} aria-pressed={panel === p} onClick={() => getClientSession().setPanelLayout(p)}>
              {PANEL_LABEL[p]}
            </button>
          ))}
        </span>
      </div>
      {joining && bar?.project && (
        <div className={styles.backdrop}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="이름 넣기">
            <JoinForm bookTitle={bar.project.title} role={joining} onJoin={(name) => join(joining, name)} onCancel={() => setJoining(null)} />
          </div>
        </div>
      )}
    </>
  );
}
