import { expect, test } from "@playwright/test";

test("첫 화면이 열리고 Booktelier가 보이며 로그인·회원가입 화면이 아니다(QA-01, QA-05)", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);

  await expect(page.getByTestId("logo")).toContainText("BOOKTELIER");
  await expect(page.getByTestId("logo")).toContainText("북틀리에");
  await expect(page.getByRole("heading", { name: "새 책 만들기" })).toBeVisible();

  await expect(page.getByText(/로그인|회원가입|log ?in|sign ?(in|up)/i)).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByText("북엔드")).toHaveCount(0);
});
