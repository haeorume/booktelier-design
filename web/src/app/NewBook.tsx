"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { bookDeps } from "@/data";
import { EditorLinkDialog } from "@/components/EditorLinkDialog";
import { Icon } from "@/components/Icon";
import { TEMPLATE_ORDER, TEMPLATES } from "@/domain/templates";
import { setTrackContext, track } from "@/events";
import type { TemplateId } from "@/types";
import { ServiceHeader } from "./home/ServiceHeader";
import styles from "./page.module.css";

/** 템플릿 카드의 한 줄 설명과 작은 지면 그림 제목(시안 .bf-template-copy · .bf-template-preview). */
const TEMPLATE_COPY: Record<TemplateId, { copy: string; sample: string }> = {
  novel: { copy: "긴 호흡의 본문을 편안하게 읽는 소설형 지면", sample: "문장을 따라, 깊게" },
  essay: { copy: "글과 여백의 균형을 맞춘 에세이형 지면", sample: "일상 사이에, 여백" },
  practical: { copy: "제목과 내용을 빠르게 구분하는 실용서형 지면", sample: "내용을 또렷하게" },
};

/**
 * 새 책 만들기(ST-01, 시안 11.22 '#create'). 제목과 템플릿을 받아 만든다(FR-01, FR-10).
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
    <div className={styles.page}>
      <ServiceHeader role="editor" homeLink={hasBooks} />
      <main className={styles.main}>
        {hasBooks && (
          <Link className={styles.back} href="/home">
            <Icon name="left" size="sm" />
            편집자 홈
          </Link>
        )}
        <div className={styles.head}>
          <span className={styles.eyebrow}>START A NEW STORY</span>
          <h1 className={styles.title}>
            <span className={styles.srOnly}>새 책 만들기 · </span>첫 장부터, 함께 시작해요.
          </h1>
          <p className={styles.lead}>제목과 기본 지면을 정하고, 빈 원고에서 작가와 디자이너를 초대하세요.</p>
          <ol className={styles.journey} aria-label="진행 단계">
            <li data-current="true">
              <i>1</i>책 준비
            </li>
            <li aria-hidden="true" className={styles.journeyArrow}>
              →
            </li>
            <li>
              <i>2</i>빈 원고
            </li>
            <li aria-hidden="true" className={styles.journeyArrow}>
              →
            </li>
            <li>
              <i>3</i>참여자 초대
            </li>
          </ol>
        </div>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className={styles.fieldLabel} htmlFor="new-book-title">
            책 제목 <span className={styles.required}>필수</span>
          </label>
          <input
            id="new-book-title"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="함께 만들 책의 제목"
            autoComplete="off"
            autoFocus
          />
          <p className={styles.caption}>작업을 시작한 뒤에도 제목과 지면을 바꿀 수 있어요.</p>
          <fieldset className={styles.templates}>
            <legend className={styles.legend}>조판 템플릿</legend>
            <div className={styles.templateGrid}>
              {TEMPLATE_ORDER.map((id) => {
                const t = TEMPLATES[id];
                return (
                  <label key={id} className={styles.template} data-selected={template === id}>
                    <input type="radio" name="template" value={id} checked={template === id} onChange={() => setTemplate(id)} />
                    <span className={styles.preview} data-template={id} aria-hidden="true">
                      <small>CHAPTER 01</small>
                      <strong>{TEMPLATE_COPY[id].sample}</strong>
                      <i />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <b>01</b>
                    </span>
                    <span className={styles.templateName}>
                      {t.label}
                      <i className={styles.radio} aria-hidden="true">
                        <Icon name="check" />
                      </i>
                    </span>
                    <span className={styles.templateCopy}>{TEMPLATE_COPY[id].copy}</span>
                    <span className={styles.templateSpec}>
                      {t.layout.trim.replace("x", "×")}mm · {t.font === "serif" ? "명조" : "고딕"} {t.layout.font_size}pt · 행간 {t.layout.line_height}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {serverBacked && (
            <label className={styles.sample}>
              <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> 예시 원고로 시작
            </label>
          )}
          <div className={styles.footer}>
            <p className={styles.note}>
              <Icon name="check" size="xs" className={styles.noteIcon} />
              선택한 템플릿은 조판 설정에서 조정할 수 있어요.
            </p>
            <button type="submit" className={styles.primary} disabled={empty || busy}>
              만들기
            </button>
          </div>
        </form>
      </main>
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
    </div>
  );
}
