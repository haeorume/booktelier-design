// AI 제안 카드 동작과 역할별로 보이는 것(W3).
import { expect, test, type Page } from "@playwright/test";
import { aiCards, card, enterAsAuthor, events, expectEvent, paragraph, revealDevBar, switchRole, typeAtEnd } from "./helpers";

async function liveCheckOnPara02(page: Page) {
  await enterAsAuthor(page);
  await typeAtEnd(page, "para_02", " 오래도록.");
  await expect(aiCards(page)).toHaveCount(2);
}

test("적용 직후 실행 취소하면 원문으로 돌아가고 제안이 다시 대기로 뜬다(QA-31)", async ({ page }) => {
  await liveCheckOnPara02(page);
  await card(page, "쏟아지는 것이 가능했고").getByRole("button", { name: "적용" }).click();
  await expect(paragraph(page, "para_02")).toContainText("쏟아졌고");
  await page.getByRole("button", { name: "실행 취소" }).click();
  await expect(paragraph(page, "para_02")).toContainText("햇빛이 그림 위로 쏟아지는 것이 가능했고, 나는");
  await expect(aiCards(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "실행 취소" })).toHaveCount(0); // 마지막 1회만
});

test("적용 직후 Ctrl+Z를 누르면 원고와 제안이 함께 되돌아간다(G-11)", async ({ page }) => {
  await liveCheckOnPara02(page);
  await card(page, "쏟아지는 것이 가능했고").getByRole("button", { name: "적용" }).click();
  await expect(paragraph(page, "para_02")).toContainText("쏟아졌고");
  await paragraph(page, "para_04").click();
  await page.keyboard.press("Control+z");
  await expect(paragraph(page, "para_02")).toContainText("햇빛이 그림 위로 쏟아지는 것이 가능했고, 나는");
  await expect(aiCards(page)).toHaveCount(2);
  await expect(paragraph(page, "para_02").locator(".ai-underline")).toHaveText(["쏟아지는 것이 가능했고", "한참동안"]);
  await expect(page.getByRole("button", { name: "실행 취소" })).toHaveCount(0);
});

test("밑줄을 누르면 다른 탭이나 거르기에 가려 있어도 AI 제안 탭이 열리고 그 카드가 보인다(N-07)", async ({ page }) => {
  await liveCheckOnPara02(page);
  await page.getByRole("group", { name: "종류 거르기" }).getByRole("button", { name: "윤문 1" }).click();
  await page.getByRole("tab", { name: "함께 봄" }).click();
  await paragraph(page, "para_02").locator(".ai-underline", { hasText: "한참동안" }).click();
  await expect(page.getByRole("tab", { name: /내 AI 제안/ })).toHaveAttribute("aria-selected", "true");
  await expect(card(page, "한참동안")).toBeVisible();
  await expect(card(page, "한참동안")).toHaveAttribute("aria-current", "true");
});

test("카드를 고르면 지면의 그 밑줄이 강조되고 화면 안에 보인다(N-08, G-03)", async ({ page }) => {
  await liveCheckOnPara02(page);
  const target = paragraph(page, "para_02").locator(".ai-underline", { hasText: "한참동안" });
  const c = card(page, "한참동안");
  await c.focus();
  await page.keyboard.press("Enter");
  await expect(c).toHaveAttribute("aria-current", "true");
  await expect(target).toHaveClass(/is-selected/);
  await expect(target).toBeInViewport();
});

test("대안을 골라 적용할 수 있다(FR-27 ①)", async ({ page }) => {
  await liveCheckOnPara02(page);
  const polish = card(page, "쏟아지는 것이 가능했고");
  await polish.getByText("쏟아져 내렸고").click();
  await polish.getByRole("button", { name: "적용" }).click();
  await expect(paragraph(page, "para_02")).toContainText("그림 위로 쏟아져 내렸고, 나는");
  await expectEvent(page, "ai_suggestion_applied", { props: { choice: "alternative" } });
});

test("무시하면 사라지고 같은 문단을 다시 고쳐도 다시 뜨지 않는다(QA-32, FR-28 ②)", async ({ page }) => {
  await liveCheckOnPara02(page);
  await card(page, "한참동안").getByRole("button", { name: "무시" }).click();
  await expect(aiCards(page)).toHaveCount(1);
  await expect(paragraph(page, "para_02").locator(".ai-underline")).toHaveText(["쏟아지는 것이 가능했고"]);
  await expectEvent(page, "ai_suggestion_dismissed", { props: { kind: "spacing" } });

  await typeAtEnd(page, "para_02", " 다시.");
  await expect(page.getByTestId("ai-status")).toContainText("분석 중");
  await expect(page.getByTestId("ai-status")).not.toContainText("분석 중");
  await expect(aiCards(page)).toHaveCount(1);
  await expect(card(page, "한참동안")).toHaveCount(0);
});

test("이 표현 유지를 누르면 카드가 사라지고 유지 표현으로 남는다(QA-33)", async ({ page }) => {
  await liveCheckOnPara02(page);
  await card(page, "한참동안").getByRole("button", { name: "이 표현 유지" }).click();
  await expect(card(page, "한참동안")).toHaveCount(0);
  const rules = await page.evaluate(() => JSON.parse(window.localStorage.getItem("booktelier:style_rules") ?? "[]"));
  expect(rules).toEqual([expect.objectContaining({ type: "keep", text: "한참동안" })]);
  await expectEvent(page, "ai_suggestion_kept", { props: { kind: "spacing" } });

  // 유지한 표현은 표기 원칙 탭의 '유지 표현'에서 누가 남겼는지와 함께 보인다(FR-31, WS-51, 11.22 사용자 의견)
  await page.getByRole("tab", { name: /표기 원칙/ }).click();
  const tab = page.getByTestId("style-rules");
  await expect(tab.getByTestId("style-rule-keep")).toHaveCount(1);
  await expect(tab.getByTestId("style-rule-keep")).toContainText("한참동안");
  await expect(tab.getByTestId("style-rule-keep")).toContainText("작가 A · 작가");
});

test("표기 원칙 탭에서 누구나 통일 규칙을 더하고, 다른 역할도 같은 목록을 본다(FR-31, A-28)", async ({ page }) => {
  await enterAsAuthor(page);
  await page.getByRole("tab", { name: /표기 원칙/ }).click();
  const tab = page.getByTestId("style-rules");
  await expect(tab.getByText("아직 통일 규칙이 없어요.")).toBeVisible();
  const add = tab.getByRole("button", { name: "더하기" });
  await expect(add).toBeDisabled();
  await tab.getByLabel("내용").fill("숫자는 아라비아 숫자로 쓴다");
  await add.click();
  await expect(tab.getByTestId("style-rule-rule")).toHaveText(/숫자는 아라비아 숫자로 쓴다/);
  await expect(tab.getByLabel("내용")).toHaveValue("");
  await expect(page.getByRole("tab", { name: /표기 원칙/ })).toContainText("1");

  await switchRole(page, "디자이너", "디자이너 C");
  await page.getByRole("tab", { name: /표기 원칙/ }).click();
  await expect(page.getByTestId("style-rule-rule")).toHaveText(/숫자는 아라비아 숫자로 쓴다/);
});

test("카드는 원고 순서로 늘어서고 종류로 거를 수 있다(QA-34)", async ({ page }) => {
  await liveCheckOnPara02(page);
  await expect(aiCards(page).locator("del")).toHaveText(["쏟아지는 것이 가능했고", "한참동안"]);
  await page.getByRole("group", { name: "종류 거르기" }).getByRole("button", { name: "띄어쓰기 1" }).click();
  await expect(aiCards(page)).toHaveCount(1);
  await expect(aiCards(page)).toContainText("한참동안");
  await page.getByRole("group", { name: "종류 거르기" }).getByRole("button", { name: "전체 2" }).click();
  await expect(aiCards(page)).toHaveCount(2);
});

test("제안이 걸린 글자를 먼저 고치면 그 카드는 바로 사라지고 고친 글이 남는다(QA-35)", async ({ page }) => {
  await liveCheckOnPara02(page);
  const underline = paragraph(page, "para_02").locator(".ai-underline", { hasText: "한참동안" });
  await underline.dblclick();
  await page.keyboard.type("오랫동안");
  await expect(card(page, "한참동안")).toHaveCount(0);
  await expect(paragraph(page, "para_02")).toContainText("오랫동안");
});

test("밑줄을 누르면 그 카드가 선택된다", async ({ page }) => {
  await liveCheckOnPara02(page);
  await paragraph(page, "para_02").locator(".ai-underline", { hasText: "한참동안" }).click();
  await expect(card(page, "한참동안")).toHaveAttribute("aria-current", "true");
});

test("역할을 바꾸면 작가의 AI 제안이 보이지 않고, 편집자·디자이너는 원고를 고칠 수 없다(QA-20, QA-38, FR-42)", async ({ page }) => {
  await liveCheckOnPara02(page);
  const bar = await revealDevBar(page);

  await bar.getByRole("button", { name: "편집자" }).click();
  await expect(page.getByTestId("role-badge")).toHaveText("편집자");
  await expect(aiCards(page)).toHaveCount(0);
  await expect(page.getByTestId("manuscript").locator(".ai-underline")).toHaveCount(0);
  await expect(page.getByTestId("manuscript")).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("tab", { name: /내 AI 제안/ })).toBeVisible();

  await bar.getByRole("button", { name: "디자이너" }).click();
  await page.getByRole("dialog", { name: "이름 넣기" }).getByLabel("이름").fill("디자이너 C");
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page.getByTestId("role-badge")).toHaveText("디자이너");
  await expect(page.getByRole("tab", { name: /내 AI 제안/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "함께 봄" })).toBeVisible();
  await expect(page.getByTestId("manuscript")).toHaveAttribute("contenteditable", "false");

  // 작가로 돌아오면 제안과 앞서 고친 원고가 그대로다(QA-22)
  await bar.getByRole("button", { name: "작가" }).click();
  await expect(aiCards(page)).toHaveCount(2);
  await expect(paragraph(page, "para_02")).toContainText("오래도록.");
});

test("AI 대화 탭에서 준비된 예시 응답이 뜬다", async ({ page }) => {
  await enterAsAuthor(page);
  await page.getByRole("tab", { name: "AI 대화" }).click();
  const chat = page.getByTestId("ai-chat");
  await expect(chat).toBeVisible();
  await expect(chat).toContainText("원고를 함께 살펴볼까요?");
  await page.getByRole("button", { name: "교정·교열" }).click();
  await expect(chat).toContainText("맞춤법");
  await expect(page.getByText("준비된 예시 응답 · 실제 AI API 연결 전")).toBeVisible();
});

test("편집자는 원고 편집이 기본이고 조판을 눌러야 조판 설정이 열린다", async ({ page }) => {
  await enterAsAuthor(page);
  await switchRole(page, "편집자");
  const mode = page.getByTestId("work-mode");
  await expect(mode.getByRole("button", { name: "원고 편집", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(mode.getByRole("button", { name: "조판", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("layout-panel")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "서식 막대" })).toBeVisible();
  await mode.getByRole("button", { name: "조판", exact: true }).click();
  await expect(page.getByTestId("layout-panel")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "조판 막대" })).toBeVisible();
  await mode.getByRole("button", { name: "원고 편집", exact: true }).click();
  await expect(page.getByTestId("layout-panel")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "서식 막대" })).toBeVisible();
});

test("작가는 고른 글을 굵게 할 수 있다", async ({ page }) => {
  await enterAsAuthor(page);
  const p = paragraph(page, "para_01");
  await p.click();
  await p.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.getByRole("button", { name: "굵게" }).click();
  await expect(p.locator("strong")).toBeVisible();
});

test("first_edit는 이 책에서 한 번만 남는다", async ({ page }) => {
  await liveCheckOnPara02(page);
  await typeAtEnd(page, "para_04", " 끝.");
  await page.reload();
  await typeAtEnd(page, "para_04", " 정말.");
  await expect(paragraph(page, "para_04")).toContainText("끝. 정말.");
  expect((await events(page)).filter((e) => e.name === "first_edit")).toHaveLength(1);
});
