"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { bookDeps } from "@/data";
import { EditorLinkDialog } from "@/components/EditorLinkDialog";
import { TEMPLATE_ORDER, TEMPLATES } from "@/domain/templates";
import { setTrackContext, track } from "@/events";
import type { TemplateId } from "@/types";
import styles from "./page.module.css";
import { Logo } from "@/components/Logo";

/**
 * 새 책 만들기(ST-01). 제목과 템플릿을 받아 만든다(FR-01, FR-10).
 * 만든 책이 있는 브라우저가 /로 오면 편집자 홈으로 보낸다. /?new=1은 보내지 않는다(정할 것 1).
 */
export function NewBook() {
  const router = useRouter();
  const forceNew = useSearchParams().get("new") === "1";
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<TemplateId>("novel");
  // 발표용 예시 원고로 시작(D-39). 서버에 저장할 때만 고른다(1차 브라우저 저장은 늘 예시 원고).
  const [sample, setSample] = useState(false);
  const serverBacked = bookDeps().library.source === "server";
  const [busy, setBusy] = useState(false);
  const [hasBooks, setHasBooks] = useState(false);
  // 만든 뒤 편집자 링크 안내(ST-02, FR-46 ①). 확인하면 작업 공간으로 간다.
  const [created, setCreated] = useState<{ url: string; href: string } | null>(null);
  const empty = title.trim().length === 0;

  useEffect(() => {
    let alive = true;
    bookDeps().library.myBooks().then((books) => {
      if (!alive || books.length === 0) return;
      if (forceNew) setHasBooks(true);
      else router.replace("/home");
    });
    return () => {
      alive = false;
    };
  }, [forceNew, router]);

  async function submit() {
    if (empty || busy) return;
    setBusy(true);
    try {
      const { project, chapter, editor, editorUrl } = await bookDeps().library.createBook({ title, template_id: template, startWithSample: sample });
      setTrackContext({ participant_id: editor.id, project_id: project.id, chapter_id: null, role: "editor", chapter_version: null });
      // 1·2단계는 만들기 한 번으로 함께 끝난다. 이 순서로 둘을 남긴다(정할 것 6).
      track("project_created");
      track("template_selected", { template_id: template });
      const href = `/p/${project.id}/c/${chapter.id}`;
      if (editorUrl) setCreated({ url: editorUrl, href });
      else router.push(href);
      // 화면 상태는 다른 화면에 다녀와도 남는다(cacheComponents). 다음 책을 만들 수 있게 비운다.
      setTitle("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.main}>
      <p className={styles.brand}>
        <Logo size="lg" withName />
      </p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className={styles.title}>새 책 만들기</h1>
        <label className={styles.label}>
          책 제목
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} autoFocus />
        </label>
        <fieldset className={styles.templates}>
          <legend className={styles.label}>템플릿</legend>
          {TEMPLATE_ORDER.map((id) => (
            <label key={id} className={styles.template} data-selected={template === id}>
              <input type="radio" name="template" value={id} checked={template === id} onChange={() => setTemplate(id)} />
              <span className={styles.templateName}>{TEMPLATES[id].label}</span>
              <span className={styles.templateSpec}>
                {TEMPLATES[id].layout.trim.replace("x", "×")}mm · {TEMPLATES[id].font === "serif" ? "명조" : "고딕"} {TEMPLATES[id].layout.font_size}pt · 행간 {TEMPLATES[id].layout.line_height}
              </span>
            </label>
          ))}
        </fieldset>
        {serverBacked && (
          <label className={styles.label}>
            <span>
              <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> 예시 원고로 시작
            </span>
          </label>
        )}
        <div className={styles.actions}>
          {hasBooks && (
            <Link className={styles.secondary} href="/home">
              편집자 홈
            </Link>
          )}
          <button type="submit" className={styles.primary} disabled={empty || busy}>
            만들기
          </button>
        </div>
      </form>
      {created && (
        <EditorLinkDialog
          url={created.url}
          onDone={() => {
            // 화면 상태는 다른 화면에 다녀와도 남는다(cacheComponents). 다음 책에서 이 안내가 다시 뜨지 않게 비운다.
            const { href } = created;
            setCreated(null);
            router.push(href);
          }}
        />
      )}
    </main>
  );
}
