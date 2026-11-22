import { describe, expect, it } from "vitest";
import type { ChapterDoc } from "@/types";
import { changeValue } from "./layout";
import { chapterHtml, cssString, escapeHtml, pageCss, paragraphHtml } from "./preview";
import { templateLayout } from "./templates";

describe("원고 → 미리보기 HTML", () => {
  it("글자를 이스케이프한다", () => {
    expect(escapeHtml(`<b>"a"&</b>`)).toBe("&lt;b&gt;&quot;a&quot;&amp;&lt;/b&gt;");
    expect(paragraphHtml("<script>", [])).toBe("&lt;script&gt;");
  });

  it("표시를 감싸고, 겹친 자리에는 class를 모두 붙인다", () => {
    const html = paragraphHtml("한참동안 서 있었다", [
      { paragraph_id: "p", start: 0, end: 4, kind: "ai-spacing" },
      { paragraph_id: "p", start: 2, end: 6, kind: "comment" },
    ]);
    expect(html).toBe('<span class="bt-mark bt-ai-spacing">한참</span><span class="bt-mark bt-ai-spacing bt-comment">동안</span><span class="bt-mark bt-comment"> 서</span> 있었다');
  });

  it("수정 제안은 표시를 켰을 때만 지운 글자 뒤에 더할 글자를 붙인다(쪽 나누기가 달라져서)", () => {
    const edit = [{ paragraph_id: "p", start: 0, end: 2, kind: "edit", insert: "이튿" }];
    expect(paragraphHtml("다음 날", edit, true)).toBe('<span class="bt-mark bt-edit-del">다음</span><ins class="bt-mark bt-edit-ins">이튿</ins> 날');
    expect(paragraphHtml("다음 날", edit)).toBe('<span class="bt-mark bt-edit-del">다음</span> 날');
  });

  it("빈 문단은 줄바꿈으로 한 줄 높이를 지키고, 공백은 그대로 둔다", () => {
    expect(paragraphHtml("", [])).toBe("<br>");
    expect(paragraphHtml("  두 칸", [])).toBe("  두 칸");
    expect(pageCss("essay", templateLayout("essay"), { book: "b", chapter: "c" })).toContain("white-space: break-spaces");
  });

  it("범위를 벗어난 표시는 무시한다", () => {
    expect(paragraphHtml("짧다", [{ paragraph_id: "p", start: 1, end: 9, kind: "comment" }])).toBe("짧다");
  });

  it("장 머리와 문단을 그린다", () => {
    const doc: ChapterDoc = { type: "doc", content: [{ type: "paragraph", attrs: { id: "a" }, content: [{ type: "text", text: "첫 문장" }] }] };
    const html = chapterHtml(doc, { order: 3, title: "3장 <런던>" }, []);
    expect(html).toContain("CHAPTER 03");
    expect(html).toContain("3장 &lt;런던&gt;");
    expect(html).toContain('<p class="bt-p" data-paragraph-id="a">첫 문장</p>');
  });

  it("굵게·기울임·밑줄은 미리보기 HTML에도 남는다", () => {
    const doc: ChapterDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "a" },
          content: [
            { type: "text", text: "가" },
            { type: "text", text: "나", marks: [{ type: "bold" }] },
            { type: "text", text: "다", marks: [{ type: "italic" }, { type: "underline" }] },
          ],
        },
      ],
    };
    expect(chapterHtml(doc, { order: 1, title: "1장" }, [])).toContain('<p class="bt-p" data-paragraph-id="a">가<strong>나</strong><u><em>다</em></u></p>');
  });
});

describe("조판 값 → @page CSS(FR-43 ②, FR-44)", () => {
  const essay = templateLayout("essay"); // 148×210, 위20 아래22 안쪽20 바깥쪽16 제본3
  const titles = { book: '책 "제목"', chapter: "1장" };

  it("판형과 왼쪽·오른쪽 쪽의 안쪽(+제본)·바깥쪽 여백", () => {
    const css = pageCss("essay", essay, titles);
    expect(css).toContain("size: 148mm 210mm");
    expect(css).toContain("@page :left { margin-left: 16mm; margin-right: 23mm; }");
    expect(css).toContain("@page :right { margin-left: 23mm; margin-right: 16mm; }");
  });

  it("쪽 번호는 바깥쪽 아래, 머리말은 왼쪽 책 제목·오른쪽 장 제목, 첫 쪽은 머리말 없음", () => {
    const css = pageCss("essay", essay, titles);
    expect(css).toMatch(/@page :left \{ @bottom-left \{ content: counter\(page\)/);
    expect(css).toMatch(/@page :right \{ @bottom-right \{ content: counter\(page\)/);
    expect(css).toContain(`@top-left { content: ${cssString('책 "제목"')};`);
    expect(css).toContain("@page :first { @top-left { content: none; } @top-right { content: none; } }");
  });

  it("쪽 공통 설정을 바꾸면 그대로 따른다", () => {
    const layout = changeValue({ template_id: "essay", layout: essay }, "running_right_page_number", "bottom_center").layout;
    const none = changeValue({ template_id: "essay", layout }, "running_left_page_number", "none").layout;
    const css = pageCss("essay", none, titles);
    expect(css).toMatch(/@page :right \{ @bottom-center/);
    expect(css).not.toMatch(/@page :left \{ @bottom-left/);
  });
});
