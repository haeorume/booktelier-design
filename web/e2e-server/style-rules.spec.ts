// 표기 원칙 탭(A-28, FR-31, WS-51)과 책 제목 고치기(A-36, FR-55)를 서버로. 새로고침 뒤에도 남아요.
import { expect, test } from "@playwright/test";

const WORKSPACE = /\/p\/[0-9a-f-]{36}\/c\/[0-9a-f-]{36}$/;
const NAVIGATE_MS = 45_000;

test("표기 원칙을 더하면 서버에 남아 새로고침 뒤에도 보인다", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("책 제목").fill(`표기 원칙 ${Date.now()}`);
  await page.getByText("에세이", { exact: true }).click();
  await page.getByRole("button", { name: "만들기" }).click();
  await page.getByRole("dialog", { name: "편집자 링크" }).getByRole("button", { name: "확인" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });

  await page.getByRole("tab", { name: /표기 원칙/ }).click();
  const tab = page.getByTestId("style-rules");
  await tab.getByRole("radio", { name: "유지 표현" }).check();
  await tab.getByLabel("내용").fill("루브르");
  await tab.getByRole("button", { name: "더하기" }).click();
  await expect(tab.getByTestId("style-rule-keep")).toContainText("루브르");

  await page.reload();
  await page.getByRole("tab", { name: /표기 원칙/ }).click();
  await expect(page.getByTestId("style-rule-keep")).toContainText("루브르");
});

test("편집자가 책 제목을 고치면 서버에 남아 새로고침 뒤에도 보인다(A-36)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("책 제목").fill(`제목 고치기 ${Date.now()}`);
  await page.getByText("에세이", { exact: true }).click();
  await page.getByRole("button", { name: "만들기" }).click();
  await page.getByRole("dialog", { name: "편집자 링크" }).getByRole("button", { name: "확인" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });

  await page.getByTestId("book-title").click();
  const input = page.getByRole("navigation", { name: "경로" }).getByLabel("책 제목", { exact: true });
  await input.fill("서버에 남은 새 제목");
  await input.press("Enter");
  await expect(page.getByTestId("book-title")).toHaveText("서버에 남은 새 제목");
  await page.reload();
  await expect(page.getByTestId("book-title")).toHaveText("서버에 남은 새 제목", { timeout: NAVIGATE_MS });
});
