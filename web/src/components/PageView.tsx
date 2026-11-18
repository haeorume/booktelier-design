import type { CSSProperties } from "react";
import { pageStyleVars } from "@/domain/templates";
import type { ChapterDoc, Layout, TemplateId } from "@/types";
import styles from "./PageView.module.css";

interface Props {
  templateId: TemplateId;
  layout: Layout;
  chapterTitle: string;
  doc: ChapterDoc;
}

/**
 * 지면(WS-30). 템플릿의 판형·글꼴·여백·행간을 CSS 변수로 입힌다(FR-10, P3).
 * W2는 읽기 전용이다. 작가가 고치는 편집기는 W3에서 이 자리에 들어온다.
 */
export function PageView({ templateId, layout, chapterTitle, doc }: Props) {
  return (
    <article className={styles.page} data-testid="page" data-template={templateId} style={pageStyleVars(templateId, layout) as CSSProperties}>
      <h2 className={styles.chapterTitle}>{chapterTitle}</h2>
      {doc.content.map((p) => (
        <p key={p.attrs.id} className={styles.paragraph} data-paragraph-id={p.attrs.id}>
          {(p.content ?? []).map((t) => t.text).join("")}
        </p>
      ))}
    </article>
  );
}
