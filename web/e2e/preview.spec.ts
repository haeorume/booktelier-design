// 미리보기(F7 조각 3, PV-01~05, FR-43, D-34). QA-F13.
import { expect, test, type Page } from "@playwright/test";
import { enterAsAuthor, expectEvent, NAVIGATE_MS, selectText, switchRole } from "./helpers";

const LINE = "센강을 따라 걸으며 오래된 서점과 다리를 지났다. 강바람이 차가웠지만 햇빛은 따뜻했고, 나는 그 길을 몇 번이고 다시 걸었다.";

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
  await expect(page.getByTestId("save-state")).toHaveText("저장됨");
}

/** 상단 바의 미리보기는 주소를 옮기지 않고 작업 공간 안에서 열려요(D-40). */
async function openPreview(page: Page) {
  const url = page.url();
  await page.getByTestId("preview-link").click();
  await expect(page.getByRole("dialog", { name: "미리보기" })).toBeVisible({ timeout: NAVIGATE_MS });
  await expect(page.getByTestId("preview-range")).toBeVisible({ timeout: NAVIGATE_MS });
  expect(page.url()).toBe(url);
}

const visiblePages = (page: Page) => page.locator(".pagedjs_page:not([hidden])");

/** Paged.js는 머리말·쪽 번호를 여백 칸의 ::after content로 그려요. 그 글자를 읽어요. */
async function marginText(page: Page, pageIndex: number, box: string): Promise<string> {
  return visiblePages(page)
    .nth(pageIndex)
    .locator(`.pagedjs_margin-${box}`)
    .evaluate((el) => {
      const target = el.querySelector(".pagedjs_margin-content") ?? el;
      return getComputedStyle(target, "::after").content;
    });
}

test("상단 바에서 미리보기를 열면 저장본이 펼침면으로 보이고 고칠 수 없다(FR-43 ①②, QA-F13)", async ({ page }) => {
  await enterAsAuthor(page);
  await writeLong(page, 24);
  // 지면 맨 위(1쪽)를 보는 채로 연다. 미리보기는 보던 쪽이 든 펼침면부터 열려요(D-40).
  await page.getByTestId("page").evaluate((el) => el.parentElement?.scrollTo({ top: 0 }));
  await openPreview(page);
  await expectEvent(page, "preview_opened", { role: "author", props: { from: "top_bar" } });

  // 첫 펼침면은 1쪽(오른쪽 쪽) 하나, 머리말 없음
  await expect(page.getByTestId("preview-range")).toContainText("1쪽 /");
  await expect(visiblePages(page)).toHaveCount(1);
  await expect(visiblePages(page).first()).toHaveClass(/pagedjs_right_page/);
  await expect(page.getByTestId("preview-stage")).toContainText("CHAPTER 01");
  // 읽기 전용: 고칠 수 있는 곳이 없다
  await expect(page.getByRole("dialog", { name: "미리보기" }).locator("[contenteditable='true']")).toHaveCount(0);
  // 아래 작업 공간은 덮인 동안 누를 수 없어요(inert)
  await expect(page.getByTestId("manuscript").locator("xpath=ancestor::*[@inert]")).toHaveCount(1);

  // → 키로 다음 펼침면: 2쪽(왼쪽, 책 제목)·3쪽(오른쪽, 장 제목)
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("preview-range")).toContainText("2–3쪽");
  await expect(visiblePages(page)).toHaveCount(2);
  const left = visiblePages(page).first();
  await expect(left).toHaveClass(/pagedjs_left_page/);
  await expect.poll(() => marginText(page, 0, "top-left")).toContain("파리에서 보낸 한 달");
  await expect.poll(() => marginText(page, 1, "top-right")).toContain("1장");
  // 버튼으로 앞 펼침면
  await page.getByRole("button", { name: "이전 펼침면" }).click();
  await expect(page.getByTestId("preview-range")).toContainText("1쪽 /");
});

test("보기 켜고 끄기는 처음에 모두 꺼져 있고, 의견을 켜면 의견 자리가 칠해진다(FR-43 ④, PV-04)", async ({ page }) => {
  await enterAsAuthor(page);
  await selectText(page, "para_01", 0, 3);
  await page.getByRole("button", { name: "의견 남기기" }).click();
  const dialog = page.getByRole("dialog", { name: "의견 남기기" });
  await dialog.getByLabel("의견").fill("미리보기에서 보자");
  await dialog.getByRole("button", { name: "보내기" }).click();
  await openPreview(page);

  const chips = page.getByRole("group", { name: "보기" }).getByRole("button");
  await expect(chips).toHaveCount(4);
  for (const chip of await chips.all()) await expect(chip).toHaveAttribute("aria-pressed", "false");
  const mark = page.getByTestId("preview-stage").locator(".bt-comment").first();
  await expect(mark).toBeAttached();
  const plain = await mark.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.getByRole("button", { name: "의견" }).click();
  await expect(page.getByRole("button", { name: "의견" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => mark.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(plain);
});

test("돌아가기를 누르면 보던 자리로 돌아오고, 미리보기 스타일이 작업 공간에 남지 않는다(PV-05, D-40)", async ({ page }) => {
  await enterAsAuthor(page);
  const workspace = page.url();
  await openPreview(page);
  await page.getByRole("button", { name: "돌아가기" }).click();
  await expect(page.getByRole("dialog", { name: "미리보기" })).toHaveCount(0);
  expect(page.url()).toBe(workspace);
  await expect(page.locator("style[data-pagedjs-inserted-styles]")).toHaveCount(0);
  await expect(page.getByTestId("manuscript")).toBeVisible();
  // Esc로도 닫혀요
  await openPreview(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "미리보기" })).toHaveCount(0);
});

test("작업 지면에서 보던 쪽이 든 펼침면부터 미리보기가 열린다(D-40, 11.22 사용자 의견)", async ({ page }) => {
  await enterAsAuthor(page);
  await writeLong(page, 24);
  await expect.poll(() => page.getByTestId("page-boundary").count()).toBeGreaterThanOrEqual(2);
  // 2번째 쪽 경계(2쪽과 3쪽 사이) 아래, 즉 3쪽을 화면 가운데로
  const line = page.getByTestId("page-boundary").nth(1);
  await line.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await openPreview(page);
  await expect(page.getByTestId("preview-range")).toContainText("2–3쪽");
});

test("디자이너도 미리보기를 열고, 주소로 바로 열면 연 곳이 direct로 남는다(FR-42 ①)", async ({ page }) => {
  await enterAsAuthor(page);
  await switchRole(page, "디자이너", "디자이너 C");
  await page.goto(`${page.url()}/preview`);
  await expect(page.getByTestId("preview-range")).toBeVisible({ timeout: NAVIGATE_MS });
  await expectEvent(page, "preview_opened", { role: "designer", props: { from: "direct" } });
});

test("수정 제안 표시를 켜면 더한 글자가 들어오고 쪽을 다시 나눈다(FR-43 ④, Codex 검수)", async ({ page }) => {
  await enterAsAuthor(page);
  await switchRole(page, "편집자");
  await selectText(page, "para_04", 0, 2); // '다음'
  await page.getByRole("button", { name: "수정 제안하기" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 제안하기" });
  await dialog.getByLabel("바꿀 내용").fill("이튿");
  await dialog.getByRole("button", { name: "보내기" }).click();
  await openPreview(page);

  const stageEl = page.getByTestId("preview-stage");
  await expect(stageEl.locator(".bt-edit-del")).toHaveCount(1);
  await expect(stageEl.locator(".bt-edit-ins")).toHaveCount(0);
  await page.getByRole("button", { name: "수정 제안" }).click();
  await expect(stageEl.locator(".bt-edit-ins")).toHaveText("이튿");
  await expect(page.getByTestId("preview-reflowing")).toHaveCount(0);
});
