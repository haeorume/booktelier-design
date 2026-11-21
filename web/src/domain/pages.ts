// 작업 지면의 쪽 나누기(FR-17 ①, FR-44, F7 조각 2). 화면과 무관한 순수 함수.
//
// 작업 지면은 이어진 편집기 하나라(한 쪽 보기, 지면 경계 P2 잠정) 글을 실제로 쪽마다 끊지 않아요.
// 대신 본문이 들어가는 높이(판형 높이 - 위·아래 여백)마다 '쪽이 넘어가는 자리'를 계산해 경계 선을 그어요.
// 지면 맨 위 여백과 맨 아래 여백은 첫 쪽·마지막 쪽에만 있고, 그 사이 경계에는 다음 쪽 머리말을 붙여 보여요.
import type { Layout, PageNumberPosition, RunningHeader } from "@/types";
import { pageSide } from "./layout";
import { parseTrim } from "./templates";

/** CSS의 1mm는 96/25.4px로 정해져 있어요. */
export const PX_PER_MM = 96 / 25.4;

export interface PageGeometry {
  /** 판형 높이(px) */
  pageHeight: number;
  /** 위·아래 여백(px) */
  top: number;
  bottom: number;
  /** 한 쪽에 본문이 들어가는 높이(px) */
  body: number;
}

export function pageGeometry(layout: Layout): PageGeometry | null {
  const trim = parseTrim(layout.trim);
  if (!trim) return null;
  const pageHeight = trim.height * PX_PER_MM;
  const top = layout.margin.top * PX_PER_MM;
  const bottom = layout.margin.bottom * PX_PER_MM;
  return { pageHeight, top, bottom, body: Math.max(1, pageHeight - top - bottom) };
}

/** 본문이 지면 맨 위에서 contentBottom(px)까지 왔을 때 쪽 수. 빈 장도 한 쪽이에요. */
export function pageCount(contentBottom: number, g: PageGeometry): number {
  const used = Math.max(0, contentBottom - g.top);
  return Math.max(1, Math.ceil(used / g.body - 1e-6));
}

/** 지면 전체 높이(px): 위 여백 + 쪽 수 × 본문 높이 + 아래 여백. 마지막 쪽도 온전한 한 쪽이에요. */
export function sheetHeight(count: number, g: PageGeometry): number {
  return g.top + count * g.body + g.bottom;
}

export interface PageMark {
  /** 쪽 번호(장마다 1부터, F7 잠정) */
  number: number;
  /** 홀수 쪽은 오른쪽 쪽(바깥쪽이 오른쪽), 짝수 쪽은 왼쪽 쪽 */
  side: "left" | "right";
  /** 이 쪽 본문이 끝나는 자리(px, 지면 맨 위부터). 쪽 번호는 여기 아래, 마지막 쪽이 아니면 경계 선도 여기 */
  end: number;
  /** 쪽 번호를 그릴 자리. 'none'이면 그리지 않아요 */
  numberAt: "outer" | "center" | null;
  /** 이 쪽 맨 위에 찍을 머리말 글자. 장의 첫 쪽에는 찍지 않아요(F7 잠정, 장 제목이 있는 쪽) */
  header: string | null;
}

function numberAt(pos: PageNumberPosition): PageMark["numberAt"] {
  return pos === "bottom_outer" ? "outer" : pos === "bottom_center" ? "center" : null;
}

function headerText(header: RunningHeader, titles: { book: string; chapter: string }): string | null {
  return header === "book_title" ? titles.book : header === "chapter_title" ? titles.chapter : null;
}

/** 쪽마다 쪽 번호·머리말·끝나는 자리(FR-17 ①, FR-44 ①②). */
export function pageMarks(count: number, g: PageGeometry, layout: Layout, titles: { book: string; chapter: string }): PageMark[] {
  const marks: PageMark[] = [];
  for (let n = 1; n <= count; n++) {
    const side = n % 2 === 1 ? "right" : "left";
    const setting = pageSide(layout, side);
    marks.push({
      number: n,
      side,
      end: g.top + n * g.body,
      numberAt: numberAt(setting.page_number),
      header: n === 1 ? null : headerText(setting.header, titles),
    });
  }
  return marks;
}
