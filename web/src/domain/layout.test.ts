import { describe, expect, it } from "vitest";
import { changeTemplate, changeValue, clampStep, fillLayout, isValidLayout, LINE_HEIGHT, MARGIN, TRIM_OPTIONS } from "./layout";
import { SANS_FAMILY, TEMPLATE_ORDER, TEMPLATES } from "./templates";

const essay = { template_id: "essay" as const, layout: structuredClone(TEMPLATES.essay.layout) };

describe("조판 값 범위(CS-15, 잠정)", () => {
  it("세 템플릿의 기본값이 모두 범위 안에 있다", () => {
    for (const id of TEMPLATE_ORDER) expect(isValidLayout(TEMPLATES[id].layout), id).toBe(true);
  });

  it("범위 밖 값은 범위 끝으로, step에 맞춰 반올림한다", () => {
    expect(clampStep(5, MARGIN)).toBe(10);
    expect(clampStep(99, MARGIN)).toBe(30);
    expect(clampStep(20.4, MARGIN)).toBe(20);
    expect(clampStep(1.72, LINE_HEIGHT)).toBe(1.7);
    expect(clampStep(1.73, LINE_HEIGHT)).toBe(1.75);
    expect(clampStep(9, LINE_HEIGHT)).toBe(2.2);
    expect(clampStep(Number.NaN, LINE_HEIGHT)).toBe(1.3);
  });
});

describe("조판 값 바꾸기(FR-16, FR-45)", () => {
  it("템플릿을 바꾸면 조판 값이 그 템플릿 기본값으로 돌아가고 서버에는 template_id만 보낸다(④)", () => {
    const tweaked = { ...essay, layout: { ...essay.layout, line_height: 2, margin: { ...essay.layout.margin, top: 14 } } };
    const c = changeTemplate(tweaked, "practical");
    expect(c).toMatchObject({ template_id: "practical", layout: TEMPLATES.practical.layout, field: "template", before: "essay", after: "practical", reset_to_default: true, patch: {} });
  });

  it("행간 하나를 바꾸면 다른 값은 그대로고, 바꾼 칸만 보낸다", () => {
    const c = changeValue(essay, "line_height", 2);
    expect(c.layout).toEqual({ ...essay.layout, line_height: 2 });
    expect(c).toMatchObject({ template_id: "essay", field: "line_height", before: 1.8, after: 2, reset_to_default: false, patch: { line_height: 2 } });
  });

  it("여백은 네 쪽을 따로 바꾸고 범위 안으로 맞춘다", () => {
    const c = changeValue(essay, "margin_inner", 50);
    expect(c.layout.margin).toEqual({ ...essay.layout.margin, inner: 30 });
    expect(c.patch).toEqual({ margin: { inner: 30 } });
  });

  it("목록에 없는 판형·글꼴은 받지 않는다", () => {
    expect(changeValue(essay, "trim", "999x999").layout.trim).toBe(essay.layout.trim);
    expect(changeValue(essay, "trim", "152x225").layout.trim).toBe("152x225");
    expect(TRIM_OPTIONS).toContain("130x200");
    expect(changeValue(essay, "font_family", "Comic Sans").layout.font_family).toBe(essay.layout.font_family);
    expect(changeValue(essay, "font_family", SANS_FAMILY).patch).toEqual({ font_family: SANS_FAMILY });
  });
});

describe("fillLayout", () => {
  it("빈 칸은 템플릿 기본값으로 채운다", () => {
    expect(fillLayout("novel", {})).toEqual(TEMPLATES.novel.layout);
    expect(fillLayout("novel", { line_height: 2 }).line_height).toBe(2);
  });

  it("1차의 여백 숫자 하나는 네 쪽 같은 값으로 옮긴다", () => {
    expect(fillLayout("essay", { trim: "130x200", margin: 22, line_height: 1.7 }).margin).toEqual({ top: 22, bottom: 22, inner: 22, outer: 22 });
  });
});

describe("1차 책의 조판 값(PLAN F3)", () => {
  it("1차 에세이 판형 130x200과 여백 숫자 하나를 옮긴 값은 그대로 저장할 수 있다", () => {
    const old = fillLayout("essay", { trim: "130x200", margin: 22, line_height: 1.7 });
    expect(isValidLayout(old)).toBe(true);
    const c = changeValue({ template_id: "essay", layout: old }, "line_height", 1.8);
    expect(isValidLayout(c.layout)).toBe(true);
  });
});
