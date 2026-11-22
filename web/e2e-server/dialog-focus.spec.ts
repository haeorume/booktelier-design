// 창 포커스(11.22 사용자 의견): 서버와 함께 돌면 작업 공간이 몇 초마다 다시 그려져요(A-30·31).
// 그래도 '수정 이유'를 쓰는 중에 포커스가 '바꿀 내용'으로 끌려가지 않아야 해요.
import { expect, test } from "@playwright/test";
import { selectText } from "../e2e/helpers";

const WORKSPACE = /\/p\/[0-9a-f-]{36}\/c\/[0-9a-f-]{36}$/;
const NAVIGATE_MS = 45_000;

test("수정 제안 창에서 이유를 쓰는 동안 함께 작업으로 다시 그려져도 포커스가 그대로다", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("책 제목").fill(`포커스 확인 ${Date.now()}`);
  await page.getByText("에세이", { exact: true }).click();
  await page.getByLabel("예시 원고로 시작").check();
  await page.getByRole("button", { name: "만들기" }).click();
  await page.getByRole("dialog", { name: "편집자 링크" }).getByRole("button", { name: "확인" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });

  await selectText(page, "para_04", 0, 2);
  await page.getByRole("button", { name: "수정 제안하기" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 제안하기" });
  await expect(dialog.getByLabel("바꿀 내용")).toBeFocused();

  const reason = dialog.getByLabel("수정 이유");
  await reason.click();
  await page.keyboard.type("앞 문장과");
  // 함께 작업의 받기 간격(몇 초)을 두 번 넘게 기다려요. 그사이 화면이 다시 그려져요.
  await page.waitForTimeout(7_000);
  await page.keyboard.type(" 맞춰요");
  await expect(reason).toBeFocused();
  await expect(reason).toHaveValue("앞 문장과 맞춰요");
});

test("미리보기를 서버에서 읽지 못해도 덮개 안의 돌아가기로 작업 공간에 돌아온다(D-40, Codex 검수 11.22)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("책 제목").fill(`미리보기 실패 ${Date.now()}`);
  await page.getByText("에세이", { exact: true }).click();
  await page.getByRole("button", { name: "만들기" }).click();
  await page.getByRole("dialog", { name: "편집자 링크" }).getByRole("button", { name: "확인" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });

  // 미리보기를 누른 뒤부터 장 읽기(A-11)를 막아 미리보기가 실패하게 해요. 그 전 요청은 그대로 보내요.
  await expect(page.getByTestId("preview-link")).toBeVisible({ timeout: NAVIGATE_MS }); // 작업 공간이 다 읽힌 뒤
  let armed = false;
  await page.route(/\/chapters\/[0-9a-f-]{36}$/, (route) => (armed && route.request().method() === "GET" ? route.abort() : route.continue()));
  armed = true;
  await page.getByTestId("preview-link").click();
  const overlay = page.getByRole("dialog", { name: "미리보기" });
  await expect(overlay.getByTestId("preview-status")).toContainText("열지 못했어요", { timeout: NAVIGATE_MS });
  armed = false; // 막기를 풀고 돌아가요
  await overlay.getByRole("button", { name: "돌아가기" }).click();
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId("page")).toBeVisible(); // 빈 첫 장이라 원고 칸 대신 지면을 봐요
  await expect(page.getByTestId("preview-link")).toBeVisible();
});
