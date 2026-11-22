// 화면 다듬기(11.22): 로고로 편집자 홈 가기, 검토 패널 접기(DESIGN.md 3장), 다크 테마.
import { expect, test } from "@playwright/test";
import { createBookAndCopyLinks, enterAsAuthor, NAVIGATE_MS } from "./helpers";

test("편집자는 로고를 눌러 편집자 홈으로 가고, 작가에게는 로고가 링크가 아니다", async ({ page }) => {
  await createBookAndCopyLinks(page);
  await page.getByTestId("logo-home").click();
  await expect(page).toHaveURL(/\/home$/, { timeout: NAVIGATE_MS });
  await expect(page.getByRole("heading", { name: "편집자 홈" })).toBeVisible();
});

test("작가 화면의 로고는 편집자 홈 링크가 아니다(D-15)", async ({ page }) => {
  await enterAsAuthor(page);
  await expect(page.getByTestId("logo-home")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "BOOKTELIER 홈으로" })).toHaveCount(0);
});

test("검토 패널을 접으면 지면만 남고, 다시 펴면 보던 패널이 돌아온다", async ({ page }) => {
  await createBookAndCopyLinks(page);
  const panel = page.getByTestId("review-slot");
  await expect(panel).toBeVisible();
  await page.getByTestId("panel-toggle").click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId("panel-toggle")).toHaveText("검토 패널 펴기");
  await page.getByTestId("panel-toggle").click();
  await expect(panel).toBeVisible();
});

test("하나씩 배치에서 조판 설정을 연 채로 검토 패널을 펴면 조판 설정이 닫히고 패널이 보인다(D-10)", async ({ page }) => {
  await createBookAndCopyLinks(page);
  const panel = page.getByTestId("review-slot");
  await page.getByTestId("panel-toggle").click();
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "조판 설정" }).click();
  await page.getByTestId("panel-toggle").click();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("panel-toggle")).toHaveText("검토 패널 접기");
});

test("다크 테마를 고르면 새로고침 뒤에도 유지되고, 미리보기 종이는 밝다", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await createBookAndCopyLinks(page);
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", "dark");

  await page.getByTestId("theme-toggle").click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("theme-toggle")).toHaveAccessibleName("밝은 테마로 바꾸기");
  // 작업 지면도 어두워진다(작가가 어두운 곳에서 쓰기 편하게)
  const paperIsDark = await page.getByTestId("manuscript").evaluate((el) => {
    let node: Element | null = el;
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        const [r, g, b] = bg.match(/\d+/g)!.map(Number);
        return (r + g + b) / 3 < 80;
      }
      node = node.parentElement;
    }
    return false;
  });
  expect(paperIsDark).toBe(true);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");

  // 미리보기는 책 모양을 보는 곳이라 늘 밝은 종이
  await page.getByTestId("preview-link").click();
  await expect(page.getByTestId("preview-range")).toBeVisible({ timeout: NAVIGATE_MS });
  const paper = await page.locator(".pagedjs_sheet").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = paper.match(/\d+/g)!.map(Number);
  expect((r + g + b) / 3).toBeGreaterThan(230);

  // 다시 밝게. 직전 작업 공간도 숨겨진 채 DOM에 남아 있어서(Next 16) 보이는 버튼을 눌러요.
  await page.getByTestId("theme-toggle").locator("visible=true").click();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("컴퓨터가 다크 모드면 처음부터 어둡게 보인다", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await createBookAndCopyLinks(page);
  await expect(page.getByTestId("theme-toggle")).toHaveAccessibleName("밝은 테마로 바꾸기");
  const bg = await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g)!.map(Number);
  expect((r + g + b) / 3).toBeLessThan(60);
});
