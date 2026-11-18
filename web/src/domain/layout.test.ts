import { describe, expect, it } from "vitest";
import { changeTemplate, changeValue, clampStep, isValidLayout, LINE_HEIGHT, MARGIN, TRIM_OPTIONS } from "./layout";
import { TEMPLATE_ORDER, TEMPLATES } from "./templates";

const essay = { template_id: "essay" as const, layout: { ...TEMPLATES.essay.layout } };

describe("조판 값 범위(CS-15, 잠정)", () => {
  it("세 템플릿의 기본값이 모두 범위 안에 있다", () => {
    for (const id of TEMPLATE_ORDER) expect(isValidLayout(TEMPLATES[id].layout), id).toBe(true);
  });

  it("범위 밖 값은 범위 끝으로, step에 맞춰 반올림한다", () => {
    expect(clampStep(5, MARGIN)).toBe(12);
    expect(clampStep(99, MARGIN)).toBe(30);
    expect(clampStep(20.4, MARGIN)).toBe(20);
    expect(clampStep(1.72, LINE_HEIGHT)).toBe(1.7);
    expect(clampStep(1.73, LINE_HEIGHT)).toBe(1.75);
    expect(clampStep(9, LINE_HEIGHT)).toBe(2.2);
    expect(clampStep(Number.NaN, LINE_HEIGHT)).toBe(1.3);
  });
});

describe("조판 값 바꾸기(FR-16)", () => {
  it("템플릿을 바꾸면 판형·여백·행간이 그 템플릿 기본값으로 돌아간다(④)", () => {
    const tweaked = { ...essay, layout: { trim: "148x210", margin: 14, line_height: 2 } };
    const c = changeTemplate(tweaked, "practical");
    expect(c).toMatchObject({ template_id: "practical", layout: TEMPLATES.practical.layout, field: "template", before: "essay", after: "practical", reset_to_default: true });
  });

  it("행간 하나를 바꾸면 템플릿과 다른 값은 그대로다", () => {
    const c = changeValue(essay, "line_height", 2);
    expect(c.layout).toEqual({ ...essay.layout, line_height: 2 });
    expect(c).toMatchObject({ template_id: "essay", field: "line_height", before: 1.7, after: 2, reset_to_default: false });
  });

  it("범위 밖 여백은 범위 안으로 맞춘다", () => {
    expect(changeValue(essay, "margin", 50).layout.margin).toBe(30);
  });

  it("목록에 없는 판형은 받지 않는다", () => {
    expect(changeValue(essay, "trim", "999x999").layout.trim).toBe(essay.layout.trim);
    expect(changeValue(essay, "trim", TRIM_OPTIONS[3]).layout.trim).toBe("148x210");
  });
});
