// 마우스 없이 Tab과 Enter로 데모 1~5단계를 한다(QA-50, NFR-12 Should).
import { expect, test, type Page } from "@playwright/test";
import { LINK, NAVIGATE_MS, WORKSPACE } from "./helpers";

/** Tab을 눌러 조건에 맞는 곳까지 포커스를 옮긴다. */
async function tabTo(page: Page, what: string, match: (el: { tag: string; text: string; label: string | null }) => boolean) {
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press("Tab");
    const el = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return { tag: a?.tagName ?? "", text: (a?.textContent ?? "").trim(), label: a?.getAttribute("aria-label") ?? null };
    });
    if (match(el)) return;
  }
  throw new Error(`Tab으로 ${what}에 가지 못했어요`);
}

test("키보드만으로 책 만들기 → 초대 → 작가 링크로 들어오기(QA-50)", async ({ page }) => {
  await page.goto("/");
  // 1. 제목 칸에 처음부터 포커스가 있다
  await expect(page.getByLabel("책 제목")).toBeFocused();
  await page.keyboard.type("키보드로 만든 책");
  await expect(page.getByRole("button", { name: "만들기" })).toBeEnabled();
  // 2. 템플릿은 방향키로 고른다
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /에세이/ })).toBeChecked();
  await tabTo(page, "만들기", (el) => el.tag === "BUTTON" && el.text === "만들기");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  await expect(page.getByTestId("page")).toHaveAttribute("data-template", "essay");

  // 3. 초대 창에서 작가 링크 복사
  await tabTo(page, "초대", (el) => el.tag === "BUTTON" && el.text === "초대");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "참여자 초대" })).toBeVisible();
  await tabTo(page, "작가 링크 복사", (el) => el.tag === "BUTTON" && el.text === "링크 복사");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("share-author").getByRole("button", { name: "복사됨" })).toBeVisible();
  const authorLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(authorLink).toMatch(LINK);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "참여자 초대" })).toHaveCount(0);

  // 4·5. 링크를 열고 이름을 넣어 Enter
  await page.goto(authorLink);
  await expect(page.getByLabel("이름")).toBeFocused();
  await page.keyboard.type("작가 A");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  await expect(page.getByTestId("role-badge")).toHaveText("작가");
});

test("Tab으로 옮긴 곳에는 주황 포커스 띠가 보인다(QA-F29, DESIGN.md 5장 --bt-focus)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("책 제목").fill("포커스 확인");
  await tabTo(page, "만들기", (el) => el.tag === "BUTTON" && el.text === "만들기");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  // 시안 11.22 배치: 초대(상단 바) → 검토본(작업 머리) → 조판 설정(오른쪽 패널 전환)
  for (const name of ["초대", "검토본", "조판 설정"]) {
    await tabTo(page, name, (el) => el.tag === "BUTTON" && el.text === name);
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
    expect(ring, `${name} 버튼의 포커스 띠`).toContain("rgb(236, 102, 31)"); // --bt-brand
  }
});

test("편집자 홈의 책 카드도 Tab으로 가면 포커스 띠가 보인다(QA-F29)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("책 제목").fill("홈 카드 포커스");
  await tabTo(page, "만들기", (el) => el.tag === "BUTTON" && el.text === "만들기");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  await page.goto("/home");
  await expect(page.getByTestId("book-card")).toHaveCount(1);
  await tabTo(page, "책 카드", (el) => el.tag === "A" && el.text.includes("홈 카드 포커스"));
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
  expect(ring).toContain("rgb(236, 102, 31)"); // --bt-brand
});
