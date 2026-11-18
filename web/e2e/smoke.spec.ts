import { expect, test } from "@playwright/test";

test("첫 화면이 열리고 Booktelier가 보이며 로그인·회원가입 화면이 아니다", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);

  await expect(page.getByRole("heading", { name: /Booktelier/ })).toBeVisible();

  await expect(page.getByText(/로그인|회원가입|log ?in|sign ?(in|up)/i)).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
