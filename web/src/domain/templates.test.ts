import { describe, expect, it } from "vitest";
import { pageStyleVars, parseTrim, TEMPLATE_ORDER, TEMPLATES } from "./templates";

describe("템플릿(D-11, FR-10)", () => {
  it("소설·에세이·실용서 3종", () => {
    expect(TEMPLATE_ORDER.map((id) => TEMPLATES[id].label)).toEqual(["소설", "에세이", "실용서"]);
  });

  it("세 템플릿의 지면이 서로 다르다(FR-10 ②)", () => {
    const vars = TEMPLATE_ORDER.map((id) => JSON.stringify(pageStyleVars(id, TEMPLATES[id].layout)));
    expect(new Set(vars).size).toBe(3);
  });

  it("판형·글꼴·여백·행간을 CSS 변수로 만든다", () => {
    const v = pageStyleVars("essay", TEMPLATES.essay.layout);
    expect(v["--page-width"]).toBe("148mm");
    // 위 · 바깥쪽 · 아래 · 안쪽+제본(한 쪽 보기는 홀수 쪽 기준, DESIGN.md 4장)
    expect(v["--page-margin"]).toBe("20mm 16mm 22mm 23mm");
    expect(v["--page-line-height"]).toBe("1.8");
    expect(v["--page-font-size"]).toBe("10.5pt");
    expect(v["--page-font"]).toContain("serif");
  });

  it("바꾼 조판 값이 템플릿 기본값보다 앞선다", () => {
    const v = pageStyleVars("novel", { ...TEMPLATES.novel.layout, trim: "140x200", line_height: 2 });
    expect(v["--page-width"]).toBe("140mm");
    expect(v["--page-line-height"]).toBe("2");
  });

  it("판형 글자를 읽는다", () => {
    expect(parseTrim("128x188")).toEqual({ width: 128, height: 188 });
    expect(parseTrim("가x나")).toBeNull();
  });
});
