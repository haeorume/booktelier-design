// 작업 지면(F7 조각 2): 쪽 경계·쪽 번호·머리말(FR-17 ①②, FR-44), 장 머리, 상단 바의 장 상태·저장 상태(DESIGN.md 3·4장). QA-F12.
import { expect, test, type Page } from "@playwright/test";
import { enterAsAuthor, events, paragraph, switchRole } from "./helpers";

const LINE = "센강을 따라 걸으며 오래된 서점과 다리를 지났다. 강바람이 차가웠지만 햇빛은 따뜻했고, 나는 그 길을 몇 번이고 다시 걸었다.";

/** 마지막 문단 끝에 문단을 여럿 더해 원고를 두 쪽 넘게 만든다. */
async function writeLong(page: Page, paragraphs: number) {
  const last = page.getByTestId("manuscript").locator("p").last();
  await last.click();
  await last.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  for (let i = 0; i < paragraphs; i += 1) {
    await page.keyboard.press("Enter");
    await page.keyboard.insertText(LINE);
  }
}

test("원고가 한 쪽을 넘으면 쪽 경계와 쪽 번호가 생기고, 다시 계산하는 동안 '반영 중'이 보인다(FR-17 ①②, QA-F12)", async ({ page }) => {
  await enterAsAuthor(page);
  const guides = page.getByTestId("page-guides");
  await expect(guides).toHaveAttribute("data-pages", "1");
  await expect(page.getByTestId("page-boundary")).toHaveCount(0);

  // '반영 중'은 마지막 입력 잠깐 뒤 사라져서, 입력하는 동안 한 번이라도 보였는지를 기록해 둔다.
  await page.evaluate(() => {
    const w = window as unknown as { sawReflow: boolean };
    w.sawReflow = false;
    new MutationObserver(() => {
      if (document.querySelector("[data-testid='reflowing']")) w.sawReflow = true;
    }).observe(document.body, { subtree: true, childList: true });
  });
  await writeLong(page, 20);
  await expect.poll(() => page.evaluate(() => (window as unknown as { sawReflow: boolean }).sawReflow)).toBe(true);
  await expect(page.getByTestId("reflowing")).toHaveCount(0);
  const pages = Number(await guides.getAttribute("data-pages"));
  expect(pages).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("page-boundary")).toHaveCount(pages - 1);
  await expect(page.getByTestId("page-number")).toHaveText(Array.from({ length: pages }, (_, i) => String(i + 1)));
  // 2쪽(왼쪽 쪽)은 책 제목, 3쪽(오른쪽 쪽)은 장 제목. 장의 첫 쪽에는 머리말이 없다
  await expect(page.getByTestId("running-head").first()).toHaveText("파리에서 보낸 한 달");
});

test("장 머리에 CHAPTER 01과 장 제목이 있고, 상단 바에 장 상태·검토 요청·저장 상태가 있다(DESIGN.md 3·4장)", async ({ page }) => {
  await enterAsAuthor(page);
  await expect(page.getByTestId("page")).toContainText("CHAPTER 01");
  const bar = page.getByRole("banner");
  await expect(bar.getByTestId("chapter-head-status")).toHaveText("수정 중");
  await expect(bar.getByRole("button", { name: "검토 요청" })).toBeVisible();
  await paragraph(page, "para_01").click();
  await page.keyboard.type("가");
  await expect(bar.getByTestId("save-state")).toHaveText("저장됨");
  // 작업 공간을 연 기록에 지금 원고 버전(공통 칸)이 붙어요(지면 영향 확인 시간 KPI, F8)
  const entered = (await events(page)).filter((e) => e.name === "screen_entered" && e.role === "author");
  expect(entered.length).toBeGreaterThan(0);
  expect((entered.at(-1) as unknown as { chapter_version: number }).chapter_version).toBeGreaterThanOrEqual(1);
});

test("디자이너가 쪽 공통 설정을 바꾸면 지면에 반영되고, 작가는 값만 본다(FR-44 ①②③)", async ({ page }) => {
  await enterAsAuthor(page);
  await writeLong(page, 20);
  await expect(page.getByTestId("page-boundary").first()).toBeAttached();

  // 작가는 고르는 칸 없이 값만(③)
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  await expect(page.getByTestId("running-settings")).toHaveCount(0);
  await expect(page.getByTestId("layout-values")).toContainText("왼쪽 쪽");
  await expect(page.getByTestId("layout-values")).toContainText("쪽 번호 바깥쪽 아래 · 머리말 책 제목");
  await page.getByRole("button", { name: "조판 설정", exact: true }).click(); // 닫는다(패널은 역할을 바꿔도 열린 채 남는다)

  await switchRole(page, "디자이너", "디자이너 C");
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  const panel = page.getByTestId("layout-panel");
  // 왼쪽 쪽만 바꾼다(②): 쪽 번호 없음, 머리말 장 제목
  await panel.getByLabel("왼쪽 쪽 번호").selectOption("none");
  await panel.getByLabel("왼쪽 머리말").selectOption("chapter_title");
  await expect(page.getByTestId("running-head").first()).toHaveText(/1장/);
  const numbers = page.getByTestId("page-number");
  // 왼쪽 쪽(짝수 쪽) 번호가 빠지고 오른쪽 쪽(홀수 쪽)은 남는다
  await expect(numbers.first()).toHaveText("1");
  expect(await numbers.allTextContents()).not.toContain("2");
});

test("쪽 번호를 가운데 아래로 골라도 번호가 본문 단과 겹치지 않는다(FR-44 ①, Codex 검수)", async ({ page }) => {
  await enterAsAuthor(page);
  await writeLong(page, 30);
  await switchRole(page, "디자이너", "디자이너 C");
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  const panel = page.getByTestId("layout-panel");
  await panel.getByLabel("왼쪽 쪽 번호").selectOption("bottom_center");
  await panel.getByLabel("오른쪽 쪽 번호").selectOption("bottom_center");
  const numbers = page.getByTestId("page-number");
  await expect(numbers.first()).toHaveText("– 1 –");
  const column = await page.getByTestId("manuscript").boundingBox();
  const count = await numbers.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < count - 1; i += 1) {
    const box = (await numbers.nth(i).boundingBox())!;
    const outside = box.x + box.width <= column!.x + 1 || box.x >= column!.x + column!.width - 1;
    expect(outside, `${i + 1}쪽 번호가 본문 단 밖에 있어요`).toBe(true);
  }
  // 마지막 쪽은 아래 여백 가운데
  await expect(numbers.last()).toHaveText(String(count));
});
