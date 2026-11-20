// 1280px·1440px에서 지면과 패널이 겹치거나 잘리지 않는다(QA-49, NFR-14).
import { expect, test, type Page } from "@playwright/test";
import { createBookAndCopyLinks } from "./helpers";

type Box = { left: number; right: number; top: number; bottom: number };

async function box(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || (el as HTMLElement).offsetParent === null) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }, selector);
}

const overlaps = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

async function expectFits(page: Page, label: string) {
  // 페이지 전체에 가로 스크롤이 생기지 않는다
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(scroll.sw, `${label}: 가로 스크롤`).toBeLessThanOrEqual(scroll.cw);
  // 상단 바 안의 것이 넘치지 않는다
  const bar = await page.locator("header").first().evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(bar.sw, `${label}: 상단 바`).toBeLessThanOrEqual(bar.cw + 1);

  const sheet = (await box(page, "[data-testid=page]"))!;
  const desk = await page.getByTestId("page").evaluate((el) => {
    const r = el.parentElement!.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  // 지면이 지면 영역 안에 가로로 다 들어간다(잘리지 않는다)
  expect(sheet.left, `${label}: 지면 왼쪽`).toBeGreaterThanOrEqual(desk.left - 0.5);
  expect(sheet.right, `${label}: 지면 오른쪽`).toBeLessThanOrEqual(desk.right + 0.5);
  // 지면과 패널이 겹치지 않는다
  for (const sel of ["nav[aria-label='원고 구조']", "aside[aria-label='검토 패널']", "[data-testid=layout-panel]"]) {
    const b = await box(page, sel);
    if (b) expect(overlaps(sheet, b), `${label}: 지면과 ${sel}`).toBe(false);
  }
}

for (const width of [1280, 1440]) {
  test(`${width}px: 하나씩·나란히, 세 템플릿 모두 겹치거나 잘리지 않는다(QA-49)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await createBookAndCopyLinks(page, `폭 ${width}`);
    // 데모 화면처럼 참여자 셋이 상단 바에 있게 한다
    const bar = page.getByTestId("dev-bar");
    for (const [role, name] of [["작가", "작가 A"], ["디자이너", "디자이너 C"]] as const) {
      await bar.getByRole("button", { name: role }).click();
      const ask = page.getByRole("dialog", { name: "이름 넣기" });
      await ask.getByLabel("이름").fill(name);
      await ask.getByRole("button", { name: "들어가기" }).click();
      await expect(page.getByTestId("role-badge")).toHaveText(role);
    }
    await bar.getByRole("button", { name: "편집자" }).click();
    await expect(page.getByTestId("role-badge")).toHaveText("편집자");

    await page.getByRole("button", { name: "조판 설정", exact: true }).click();
    for (const panel of ["하나씩", "나란히"] as const) {
      await bar.getByRole("button", { name: panel }).click();
      for (const template of ["소설", "에세이", "실용서"]) {
        const layout = page.getByTestId("layout-panel");
        const radio = layout.getByText(template, { exact: true });
        if ((await page.getByTestId("page").getAttribute("data-template")) !== { 소설: "novel", 에세이: "essay", 실용서: "practical" }[template]) {
          await radio.click();
          await page.getByRole("dialog", { name: "템플릿 바꾸기" }).getByRole("button", { name: "바꾸기" }).click();
        }
        await expect(page.getByTestId("page")).toHaveAttribute("data-template", { 소설: "novel", 에세이: "essay", 실용서: "practical" }[template]!);
        await expectFits(page, `${width}px ${panel} ${template}`);
      }
    }
  });
}

test("1280px에서도 원고 구조의 장 제목이 말줄임만 남지 않는다(DESIGN.md 3장)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createBookAndCopyLinks(page, "좁은 화면 제목 확인");
  const title = page.getByRole("navigation", { name: "원고 구조" }).getByRole("link").first().locator("span").first();
  const width = await title.evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(100);
});
