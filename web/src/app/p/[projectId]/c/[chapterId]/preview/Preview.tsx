"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { MessageView, NOT_FOUND } from "@/components/MessageView";
import { ThemeToggle } from "@/components/Theme";
import { CHANGES_INTERVAL_MS, bookDeps, type Ctx } from "@/data";
import { locate } from "@/domain/anchor";
import { can } from "@/domain/permissions";
import { chapterHtml, pageCss, type PreviewMark } from "@/domain/preview";
import { setTrackContext, track } from "@/events";
import type { Chapter, Participant, Project } from "@/types";
import styles from "./page.module.css";

type View = { kind: "loading" } | { kind: "not_found" } | { kind: "no_role" } | { kind: "ready"; project: Project; chapter: Chapter; me: Participant };

/** 보기 켜고 끄기(PV-04, FR-43 ④). 처음에는 모두 꺼져 있어요. */
type Layer = "comment" | "edit" | "ai" | "guides";
const LAYERS: { id: Layer; label: string }[] = [
  { id: "comment", label: "의견" },
  { id: "ai", label: "AI 밑줄" },
  { id: "edit", label: "수정 제안" },
  { id: "guides", label: "여백 안내선" },
];

/** 처음 연 곳(events preview_opened '연 곳'). 상단 바 링크는 ?from=top_bar를 붙여요. */
function openedFrom(): "top_bar" | "direct" {
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from") === "top_bar" ? "top_bar" : "direct";
  if (params.has("from")) window.history.replaceState(null, "", window.location.pathname);
  return from;
}

/** 칸 순서와 상관없이 같은 값이면 같은 글자. 조판 값 비교에 써요(순서만 달라 계속 다시 그리지 않게). */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null);
    return `{${entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Paged.js가 문서 head에 넣은 스타일을 치워요. 다시 그릴 때와 화면을 떠날 때 불러요(작업 공간에 남지 않게). */
function removePagedStyles(extra: (HTMLStyleElement | undefined)[]) {
  document.querySelectorAll("style[data-pagedjs-inserted-styles]").forEach((el) => el.remove());
  for (const el of extra) el?.remove();
}

/**
 * 미리보기(PV-01~05, FR-43). 마지막 저장본을 펼침면(왼쪽·오른쪽 두 쪽)으로 그리는 읽기 전용 화면이에요.
 * 새 API 없이 A-10·A-11만 읽고(D-34, A-35) Paged.js로 실제 쪽을 나눠요. 원고나 조판 값이 바뀌면 '반영 중' 뒤 다시 그려요(③).
 */
/** 작업 공간 안에서 열 때(D-40). 주소를 옮기지 않고 지면 위에 덮어 보여 주고, 보던 쪽이 든 펼침면부터 열어요. */
export interface EmbeddedPreview {
  /** 작업 지면에서 보던 쪽(1부터) */
  startPage: number;
  onClose: () => void;
}

/** 쪽 번호가 든 펼침면 번호. 1쪽은 0번(오른쪽 혼자), 2·3쪽은 1번 … */
export function spreadOf(page: number): number {
  return Math.floor(Math.max(1, page) / 2);
}

export function Preview({ projectId, chapterId, embedded }: { projectId: string; chapterId: string; embedded?: EmbeddedPreview }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [marks, setMarks] = useState<PreviewMark[]>([]);
  const [layers, setLayers] = useState<Set<Layer>>(new Set());
  const [pages, setPages] = useState(0);
  const [spread, setSpread] = useState(() => (embedded ? spreadOf(embedded.startPage) : 0));
  const back = useRef<HTMLButtonElement>(null);
  // 작업 공간은 함께 작업 때문에 몇 초마다 다시 그려져 embedded 객체가 매번 새로 와요. 효과는 참·거짓에만 기대요.
  const isEmbedded = Boolean(embedded);
  const close = useRef(embedded?.onClose);
  useEffect(() => {
    close.current = embedded?.onClose;
  });
  const [rendering, setRendering] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  /** 책과 장, 보기 켜고 끄기에 쓸 표시를 읽어요. 상태는 바꾸지 않고 값만 돌려줘요. */
  const fetchView = useCallback(async (): Promise<{ view: View; marks: PreviewMark[] }> => {
    const { library, review } = bookDeps();
    const project = await library.getProject(projectId);
    const chapter = project ? await library.getChapter(project.id, chapterId) : null;
    if (!project || !chapter) return { view: { kind: "not_found" }, marks: [] };
    const me = await library.me(project.id);
    if (!me) return { view: { kind: "no_role" }, marks: [] };
    // 보내기 전 AI 제안은 주인 것만 와요(D-29).
    const ctx: Ctx = { projectId: project.id, chapterId: chapter.id, viewer: { participant_id: me.id, role: me.role } };
    const [shared, mine] = await Promise.all([
      review.listShared(ctx).catch(() => null),
      can(me.role, "view_ai_suggestions") ? review.listMine(ctx).catch(() => []) : Promise.resolve([]),
    ]);
    const marks: PreviewMark[] = [];
    const place = (anchor: { paragraph_id: string; start: number; end: number }, original: string) => locate(chapter.doc, { anchor, original })?.anchor ?? null;
    for (const c of shared?.comments ?? []) {
      if (c.parent_id || c.status !== "open") continue;
      const a = place(c.anchor, c.original);
      if (a) marks.push({ ...a, kind: "comment" });
    }
    for (const e of shared?.edits ?? []) {
      if (e.status !== "pending") continue;
      const a = place(e.anchor, e.original);
      if (a) marks.push({ ...a, kind: "edit", insert: e.replacement });
    }
    for (const sug of mine) {
      if (sug.status !== "pending") continue;
      const a = place(sug.anchor, sug.original);
      if (a) marks.push({ ...a, kind: `ai-${sug.kind}` });
    }
    return { view: { kind: "ready", project, chapter, me }, marks };
  }, [projectId, chapterId]);

  /** 읽은 값을 화면에 놓아요. 처음 열 때만 preview_opened를 남겨요(다시 그린 것은 남기지 않음). */
  const show = useCallback((got: { view: View; marks: PreviewMark[] }) => {
    if (got.view.kind === "ready") {
      const { me, project, chapter } = got.view;
      setTrackContext({ participant_id: me.id, project_id: project.id, chapter_id: chapter.id, role: me.role, chapter_version: chapter.version });
      if (!opened.current) {
        opened.current = true;
        // 원고 버전은 공통 칸 chapter_version으로 남아요(지면 영향 확인 시간 KPI, F8).
        track("preview_opened", { from: isEmbedded ? "top_bar" : openedFrom() });
      }
      setRendering(true);
    }
    setView(got.view);
    setMarks(got.marks);
  }, [isEmbedded]);

  // 작업 공간 안에서 열었으면 Esc로 닫고, 포커스를 '돌아가기'로 옮겨요(창과 같은 약속, CS-13).
  useEffect(() => {
    if (!isEmbedded) return;
    back.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEmbedded, view.kind]);

  useEffect(() => {
    let alive = true;
    fetchView()
      .then((got) => alive && show(got))
      .catch(() => alive && setView({ kind: "not_found" }));
    return () => {
      alive = false;
    };
  }, [fetchView, show]);

  // Paged.js로 쪽을 나눠 그려요. 원고·조판 값·표시가 바뀌면 처음부터 다시 그려요.
  const ready = view.kind === "ready" ? view : null;
  const showInserts = layers.has("edit");
  useEffect(() => {
    const el = stage.current;
    if (!ready || !el) return;
    let cancelled = false;
    let previewer: import("pagedjs").Previewer | null = null;
    (async () => {
      const { Previewer } = await import("pagedjs");
      if (cancelled) return;
      const { project, chapter } = ready;
      const template = document.createElement("template");
      template.innerHTML = chapterHtml(chapter.doc, chapter, marks, showInserts);
      const css = pageCss(project.template_id, project.layout, { book: project.title, chapter: chapter.title });
      removePagedStyles([]);
      el.replaceChildren();
      previewer = new Previewer();
      const flow = await previewer.preview(template.content, [{ "booktelier-preview.css": css }], el);
      if (cancelled) return;
      // 펼침면 번호: 1쪽은 오른쪽 쪽 혼자(0번), 2·3쪽이 1번, 4·5쪽이 2번 …
      el.querySelectorAll<HTMLElement>(".pagedjs_page").forEach((page, i) => {
        page.dataset.spread = String(Math.floor((i + 1) / 2));
      });
      setPages(flow.total);
      setSpread((s) => Math.min(s, Math.floor(flow.total / 2)));
      setRendering(false);
    })().catch(() => !cancelled && setRendering(false));
    return () => {
      cancelled = true;
      removePagedStyles([previewer?.polisher.styleEl]);
    };
  }, [ready, marks, showInserts]);

  // 지금 펼침면만 보여요(PV-03).
  useEffect(() => {
    stage.current?.querySelectorAll<HTMLElement>(".pagedjs_page").forEach((page) => {
      page.hidden = page.dataset.spread !== String(spread);
    });
  }, [spread, pages, rendering]);

  const lastSpread = Math.floor(pages / 2);
  const go = useCallback((n: number) => setSpread(Math.max(0, Math.min(lastSpread, n))), [lastSpread]);

  // 키보드 ←·→로도 넘겨요(G-17). 입력 칸에 있을 때는 넘기지 않아요.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") go(spread + 1);
      if (e.key === "ArrowLeft") go(spread - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, spread]);

  // 다른 곳에서 원고나 조판 값이 바뀌면 '반영 중' 뒤 다시 그려요(FR-43 ③, A-31). 서버가 없으면 하지 않아요.
  const version = ready ? `${ready.chapter.version}` : "";
  useEffect(() => {
    const live = bookDeps().live;
    if (!live || !ready) return;
    let since: string | null = null;
    let alive = true;
    /**
     * 다시 읽을 일. 커서는 받자마자 넘기지만 이 일은 다시 읽기가 성공할 때까지 남겨 둬요.
     * 다시 읽기가 실패해도 다음 간격에 다시 해서 변경을 놓치지 않아요(useLive와 같음, Codex 검수 11.21).
     */
    let dirty = false;
    const current = stableJson(ready.project.layout);
    const tick = async () => {
      try {
        const got = await live.changes(projectId, ready.project.template_id, since);
        if (!alive) return;
        since = got.cursor;
        const mine = got.chapters.find((c) => c.id === chapterId);
        if (mine && mine.version > ready.chapter.version) dirty = true;
        // 처음 받은 조판 값도 지금 그린 값과 비교해요. 처음 읽는 사이에 바뀌었을 수 있어요(Codex 검수 11.21).
        if (got.layout && stableJson(got.layout) !== current) dirty = true;
        if (got.sharedChapterIds.includes(chapterId)) dirty = true;
      } catch {
        // 받기가 실패해도 남은 다시 읽기는 아래에서 해요.
      }
      if (!dirty || !alive) return;
      try {
        setRendering(true);
        const fresh = await fetchView();
        if (!alive) return;
        dirty = false;
        show(fresh);
      } catch {
        // 다음 간격에 다시 읽어요.
      }
    };
    const timer = window.setInterval(() => void tick(), CHANGES_INTERVAL_MS);
    void tick();
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    // 장 버전이 바뀌면(다시 읽은 뒤) 새 기준으로 다시 시작해요.
  }, [projectId, chapterId, ready, version, fetchView, show]);

  // 작업 공간 안에서 열었으면 읽는 중·실패에도 덮개와 '돌아가기'를 보여요. 아래 작업 공간은 inert라
  // 여기서 닫을 수단이 없으면 갇혀요(Codex 검수 11.22).
  if (embedded && view.kind !== "ready") {
    const failed = view.kind !== "loading";
    return (
      <div className={`${styles.preview} ${styles.overlay}`} role="dialog" aria-modal="true" aria-label="미리보기" data-testid="preview">
        <header className={styles.bar}>
          <button ref={back} type="button" className={styles.back} onClick={embedded.onClose}>
            <span aria-hidden="true">← </span>돌아가기
          </button>
        </header>
        <main className={styles.desk}>
          <p className={styles.reflowing} role="status" data-testid="preview-status">
            {failed ? "미리보기를 열지 못했어요. 돌아가서 다시 열어 주세요." : "미리보기를 불러오는 중이에요"}
          </p>
        </main>
      </div>
    );
  }
  if (view.kind === "loading") return null;
  if (view.kind === "not_found") return <MessageView {...NOT_FOUND} />;
  if (view.kind === "no_role") return <MessageView eyebrow="INVITATION NEEDED" title="받은 링크로 다시 들어와 주세요" body="이 브라우저에는 이 책의 역할이 없어요." />;

  const { project, chapter } = view;
  const first = spread === 0 ? 1 : spread * 2;
  const last = Math.min(pages, spread === 0 ? 1 : spread * 2 + 1);
  const toggle = (id: Layer) =>
    setLayers((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      className={embedded ? `${styles.preview} ${styles.overlay}` : styles.preview}
      {...(embedded ? { role: "dialog", "aria-modal": true, "aria-label": "미리보기" } : {})}
      data-testid="preview"
    >
      <header className={styles.bar}>
        {embedded ? (
          <button ref={back} type="button" className={styles.back} onClick={embedded.onClose}>
            <span aria-hidden="true">← </span>돌아가기
          </button>
        ) : (
          <Link className={styles.back} href={`/p/${project.id}/c/${chapter.id}`}>
            <span aria-hidden="true">← </span>돌아가기
          </Link>
        )}
        {can(view.me.role, "open_editor_home") ? (
          <Link href="/home" aria-label="BOOKTELIER 홈으로" data-testid="preview-logo-home">
            <Logo />
          </Link>
        ) : (
          <Logo />
        )}
        <h1 className={styles.title}>
          미리보기 <span className={styles.chapter}>{chapter.title}</span>
          {pages > 0 && (
            <span className={styles.range} data-testid="preview-range">
              {first === last ? `${first}쪽` : `${first}–${last}쪽`} / 전체 {pages}쪽
            </span>
          )}
        </h1>
        <ThemeToggle />
        <div className={styles.layers} role="group" aria-label="보기">
          <span className={styles.layersLabel}>보기</span>
          {LAYERS.map((l) => (
            <button key={l.id} type="button" className={styles.chip} aria-pressed={layers.has(l.id)} onClick={() => toggle(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <main className={styles.desk}>
        {rendering && (
          <p className={styles.reflowing} role="status" data-testid="preview-reflowing">
            반영 중
          </p>
        )}
        <div
          ref={stage}
          className={styles.stage}
          data-testid="preview-stage"
          data-show-comment={layers.has("comment")}
          data-show-edit={layers.has("edit")}
          data-show-ai={layers.has("ai")}
          data-show-guides={layers.has("guides")}
          data-first-spread={spread === 0}
        />
      </main>

      <nav className={styles.pager} aria-label="쪽 넘기기">
        <button type="button" className={styles.pageButton} onClick={() => go(spread - 1)} disabled={spread === 0}>
          이전 펼침면
        </button>
        <label className={styles.jump}>
          쪽 번호로 가기
          <input
            type="number"
            min={1}
            max={Math.max(1, pages)}
            className={styles.jumpInput}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const n = Number((e.target as HTMLInputElement).value);
              if (Number.isFinite(n) && n >= 1) go(Math.floor(Math.min(n, pages) / 2));
            }}
          />
        </label>
        <button type="button" className={styles.pageButton} onClick={() => go(spread + 1)} disabled={spread >= lastSpread}>
          다음 펼침면
        </button>
      </nav>
    </div>
  );
}
