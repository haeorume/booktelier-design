// AI 카드의 근거 표시(F6 조각 3, D-26). e2e는 늘 데모 제공자라 실제 근거가 나오지 않아요(D-21).
// 그래서 서버의 AI 제안 목록 응답(A-19)을 가로채 한 제안에만 근거를 넣어, 화면이 그리는 모양을 확인해요.
import { expect, test } from "@playwright/test";

const WORKSPACE = /\/p\/[0-9a-f-]{36}\/c\/[0-9a-f-]{36}$/;
const NAVIGATE_MS = 45_000;

test("장 검토 카드에 근거와 '원문 보기' 발췌가 보이고, 근거가 없으면 '근거 없음'이다", async ({ page: editor }) => {
  await editor.route("**/chapters/*/ai-suggestions", async (route) => {
    const res = await route.fetch();
    const list = (await res.json()) as { original: string; evidence: unknown }[];
    for (const s of list) {
      if (s.original === "도착한지") {
        s.evidence = { type: "norm", label: "한글 맞춤법 제42항", excerpt: "의존 명사는 띄어 쓴다.\n그가 떠난 지가 오래다.", chunk_id: "k1" };
      }
      if (s.original === "루부르") {
        s.evidence = { type: "chapter", label: "2장 1문단", excerpt: "루브르 박물관에 다시 갔다.", chunk_id: "k2" };
      }
    }
    await route.fulfill({ response: res, json: list });
  });

  await editor.goto("/");
  await editor.getByLabel("책 제목").fill(`근거 표시 ${Date.now()}`);
  await editor.getByText("에세이", { exact: true }).click();
  await editor.getByLabel("예시 원고로 시작").check();
  await editor.getByRole("button", { name: "만들기" }).click();
  await editor.getByRole("dialog", { name: "편집자 링크" }).getByRole("button", { name: "확인" }).click();
  await expect(editor).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });

  await editor.getByRole("button", { name: "장 검토" }).click();
  const cards = editor.getByTestId("ai-card");
  await expect(cards.first()).toBeVisible({ timeout: NAVIGATE_MS });

  const norm = cards.filter({ has: editor.locator("del", { hasText: "도착한지" }) }).getByTestId("ai-evidence");
  await expect(norm).toContainText("근거 · 한글 맞춤법 제42항");
  await expect(norm.getByText("의존 명사는 띄어 쓴다.")).toBeHidden(); // 처음에는 접혀 있어요
  await norm.getByText("원문 보기").click();
  await expect(norm.getByText(/의존 명사는 띄어 쓴다\./)).toBeVisible();

  const chapter = cards.filter({ has: editor.locator("del", { hasText: "루부르" }) }).getByTestId("ai-evidence");
  await expect(chapter).toContainText("근거 · 같은 책 2장 1문단");

  const none = cards.filter({ has: editor.locator("del", { hasText: "몇일" }) }).getByTestId("ai-evidence");
  await expect(none).toHaveText("근거 없음");
  // 원문 보기를 눌러도 카드가 골라지지 않아요(카드 고르기와 겹치지 않음)
  await expect(cards.filter({ has: editor.locator("del", { hasText: "도착한지" }) })).not.toHaveAttribute("aria-current", "true");
});
