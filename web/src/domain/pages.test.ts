import { describe, expect, it } from "vitest";
import type { Layout } from "@/types";
import { changeValue, pageSide } from "./layout";
import { PX_PER_MM, pageCount, pageGeometry, pageMarks, sheetHeight } from "./pages";
import { templateLayout } from "./templates";

const essay: Layout = templateLayout("essay"); // 148×210mm, 위 20 · 아래 22
const titles = { book: "파리에서 보낸 한 달", chapter: "1장 첫 주" };

describe("쪽 나누기(FR-17 ①)", () => {
  const g = pageGeometry(essay)!;

  it("본문 높이는 판형 높이에서 위·아래 여백을 뺀 값", () => {
    expect(g.pageHeight).toBeCloseTo(210 * PX_PER_MM);
    expect(g.body).toBeCloseTo((210 - 20 - 22) * PX_PER_MM);
  });

  it("빈 장도 한 쪽이고, 본문이 한 쪽 높이를 넘으면 다음 쪽", () => {
    expect(pageCount(0, g)).toBe(1);
    expect(pageCount(g.top + g.body, g)).toBe(1);
    expect(pageCount(g.top + g.body + 1, g)).toBe(2);
    expect(pageCount(g.top + g.body * 2.5, g)).toBe(3);
  });

  it("지면 높이는 위 여백 + 쪽 수 × 본문 높이 + 아래 여백", () => {
    expect(sheetHeight(1, g)).toBeCloseTo(g.pageHeight);
    expect(sheetHeight(3, g)).toBeCloseTo(g.top + 3 * g.body + g.bottom);
  });
});

describe("쪽 번호와 머리말(FR-44)", () => {
  const g = pageGeometry(essay)!;

  it("홀수 쪽은 오른쪽(장 제목), 짝수 쪽은 왼쪽(책 제목). 장의 첫 쪽에는 머리말이 없다", () => {
    const marks = pageMarks(3, g, essay, titles);
    expect(marks.map((m) => [m.number, m.side, m.header])).toEqual([
      [1, "right", null],
      [2, "left", "파리에서 보낸 한 달"],
      [3, "right", "1장 첫 주"],
    ]);
    expect(marks.every((m) => m.numberAt === "outer")).toBe(true);
    expect(marks[1].end).toBeCloseTo(g.top + 2 * g.body);
  });

  it("쪽 공통 설정을 바꾸면 그 쪽에만 반영된다(FR-44 ②)", () => {
    const current = { template_id: "essay" as const, layout: essay };
    const leftNone = changeValue(current, "running_left_page_number", "none");
    expect(leftNone.patch).toEqual({ running: { left: { page_number: "none" } } });
    const leftCenter = changeValue({ ...current, layout: leftNone.layout }, "running_left_header", "chapter_title").layout;
    const marks = pageMarks(2, g, leftCenter, titles);
    expect(marks[1]).toMatchObject({ side: "left", numberAt: null, header: "1장 첫 주" });
    expect(pageSide(leftCenter, "right")).toEqual({ page_number: "bottom_outer", header: "chapter_title" });
  });

  it("목록에 없는 값은 받지 않는다", () => {
    const change = changeValue({ template_id: "essay", layout: essay }, "running_right_page_number", "top_left");
    expect(change.after).toBe(change.before);
  });
});
