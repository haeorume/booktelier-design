"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { bookDeps, getClientSession } from "@/data";
import { ROLE_LABEL } from "@/domain/labels";
import { setTrackContext, track } from "@/events";
import { ROLES, type PanelLayout, type Project, type Role, type RoleLink } from "@/types";
import { usePanelLayout, useSessionVersion } from "./hooks";
import { JoinForm } from "./JoinForm";
import { isTourActive, TOUR_ACTIVITY_EVENT } from "./tour-start";
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
/** 시안 호버 레일처럼, 화면 맨 위 이 높이 안에 포인터가 있으면 연다. */
const EDGE_PX = 20;
const OPEN_MS = 160;
const CLOSE_MS = 180;

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
 * 평소에는 숨기고, 화면 맨 위에 마우스를 두거나 F1을 누르면 연다(시안 bf-demo-rail).
 * 작가·디자이너로 처음 바꿀 때는 이름을 묻고(FR-41 ②), 그 뒤에는 입력한 이름을 쓴다(D-16).
 * 개발용 요소라 권한이 없는 버튼을 숨기지 않고 비활성으로 둔다(D-15 예외).
 */
export function DevBar() {
  const pathname = usePathname();
  const projectId = projectIdFrom(pathname);
  const version = useSessionVersion();
  const [state, setState] = useState<BarState | null>(null);
  const [joining, setJoining] = useState<Role | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const panel = usePanelLayout();
  const barRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const pinnedRef = useRef(pinned);
  const joiningRef = useRef(joining);
  openRef.current = open;
  pinnedRef.current = pinned;
  joiningRef.current = joining;

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const deps = bookDeps();
    (async () => {
      const { library } = deps;
      const project = await library.getProject(projectId).catch(() => null);
      const me = await library.me(projectId).catch(() => null);
      const mine = await library.myParticipants(projectId).catch(() => ({}));
      const joined = Object.fromEntries(ROLES.map((r) => [r, r in mine])) as Record<Role, boolean>;
      // 링크 목록은 편집자만 읽는다(A-07). 다른 역할로 있으면 빈 목록.
      const links = await library.listRoleLinks(projectId).catch(() => []);
      if (alive) setState({ projectId, project, current: me?.role ?? null, joined, links });
    })();
    return () => {
      alive = false;
    };
  }, [projectId, version]);

  useLayoutEffect(() => {
    const h = open && barRef.current ? barRef.current.offsetHeight : 0;
    document.documentElement.style.setProperty("--bt-devbar-h", `${h}px`);
    return () => {
      document.documentElement.style.removeProperty("--bt-devbar-h");
    };
  }, [open]);

  useEffect(() => {
    let openTimer = 0;
    let closeTimer = 0;
    const clearTimers = () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
      openTimer = 0;
      closeTimer = 0;
    };
    const stay = () => Boolean(pinnedRef.current || joiningRef.current);
    const overEdge = (e: PointerEvent) => e.clientY >= 0 && e.clientY < EDGE_PX;
    const overBar = (e: PointerEvent) => {
      const el = barRef.current;
      if (!openRef.current || !el) return false;
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    const onMove = (e: PointerEvent) => {
      if (isTourActive()) {
        if (openRef.current || pinnedRef.current) {
          pinnedRef.current = false;
          openRef.current = false;
          setPinned(false);
          setOpen(false);
        }
        return;
      }
      if (e.pointerType === "touch" || stay()) return;
      if (overEdge(e) || overBar(e)) {
        window.clearTimeout(closeTimer);
        closeTimer = 0;
        if (openRef.current || openTimer) return;
        openTimer = window.setTimeout(() => setOpen(true), OPEN_MS);
      } else {
        window.clearTimeout(openTimer);
        openTimer = 0;
        if (!openRef.current || closeTimer) return;
        closeTimer = window.setTimeout(() => setOpen(false), CLOSE_MS);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTourActive()) return;
      if (e.key === "F1" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const next = !pinnedRef.current;
        pinnedRef.current = next;
        openRef.current = next;
        setPinned(next);
        setOpen(next);
      } else if (e.key === "Escape" && (pinnedRef.current || openRef.current) && !joiningRef.current) {
        pinnedRef.current = false;
        openRef.current = false;
        setPinned(false);
        setOpen(false);
      }
    };
    const onTour = () => {
      if (!isTourActive()) return;
      pinnedRef.current = false;
      openRef.current = false;
      setPinned(false);
      setOpen(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(TOUR_ACTIVITY_EVENT, onTour);
    return () => {
      clearTimers();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(TOUR_ACTIVITY_EVENT, onTour);
    };
  }, []);

  if (!DEV_BAR_ENABLED) return null;
  const bar = state && state.projectId === projectId && state.project ? state : null;

  async function switchTo(role: Role) {
    if (!bar) return;
    const { library } = bookDeps();
    const mine = (await library.myParticipants(bar.projectId))[role];
    if (mine) {
      library.switchParticipant(bar.projectId, mine.id);
      return;
    }
    if (role !== "editor") setJoining(role);
  }

  async function join(role: Role, name: string) {
    if (!bar) return;
    const link = bar.links.find((l) => l.role === role && !l.revoked_at);
    if (!link) return;
    const token = link.url.split("/").pop() ?? "";
    const { participant, created } = await bookDeps().library.joinInvite(token, name);
    setTrackContext({ participant_id: participant.id, project_id: bar.projectId, role });
    if (created) track("participant_joined", { role, via: "dev_bar" });
    setJoining(null);
  }

  return (
    <>
      <div
        ref={barRef}
        className={styles.bar}
        data-open={open}
        role="toolbar"
        tabIndex={-1}
        aria-label="개발용 막대"
        aria-hidden={!open}
        inert={!open}
        data-testid="dev-bar"
        title="화면 맨 위에 마우스를 두거나 F1으로 여닫아요"
      >
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
        <span className={styles.hint}>F1</span>
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
