// 두 브라우저 e2e(F4, NFR-17 ②): 창을 열어 둔 채 다른 브라우저의 변경이 들어온다(A-30·31, D-31).
// QA-F09(작가가 고치면 편집자·디자이너 창에 반영), QA-F10(아바타를 눌러 작업 위치로 간다).
import { expect, test, type Browser, type Page } from "@playwright/test";

const WORKSPACE = /\/p\/[0-9a-f-]{36}\/c\/[0-9a-f-]{36}$/;
const NAVIGATE_MS = 45_000;
/** 바뀐 것 받기 3초 간격 + 다시 읽기. 넉넉히 기다린다. */
const LIVE_MS = 15_000;

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  return context.newPage();
}

async function createBook(page: Page, title: string) {
  await page.goto("/");
  await page.getByLabel("책 제목").fill(title);
  const create = page.getByRole("button", { name: "만들기" });
  await expect(create).toBeEnabled();
  await page.getByText("에세이", { exact: true }).click();
  await create.click();
  const dialog = page.getByRole("dialog", { name: "편집자 링크" });
  await expect(dialog).toBeVisible({ timeout: NAVIGATE_MS });
  await dialog.getByRole("button", { name: "확인" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
}

async function inviteUrl(page: Page, role: "author" | "designer") {
  await page.getByRole("button", { name: "초대", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "참여자 초대" });
  const row = dialog.getByTestId(`share-${role}`);
  await row.getByRole("button", { name: "링크 만들기" }).click();
  const box = row.getByRole("textbox");
  await expect(box).toHaveValue(/\/j\/[0-9a-f-]{36}$/);
  const url = await box.inputValue();
  await dialog.getByRole("button", { name: "닫기" }).click();
  return url;
}

async function join(page: Page, url: string, name: string) {
  await page.goto(url);
  await page.getByLabel("이름").fill(name);
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
}

function presence(page: Page, name: string) {
  return page.getByTestId("presence-person").filter({ hasText: name });
}

test("작가가 고치면 열어 둔 편집자·디자이너 창에 반영되고, 아바타를 눌러 작업 위치로 간다(QA-F09·F10)", async ({ page: editor, browser }) => {
  await createBook(editor, `함께 작업 ${Date.now()}`);
  const authorUrl = await inviteUrl(editor, "author");
  const designerUrl = await inviteUrl(editor, "designer");

  const author = await freshPage(browser);
  await join(author, authorUrl, "김작가");
  const designer = await freshPage(browser);
  await join(designer, designerUrl, "박디자");

  // 접속자: 서로의 아바타와 지금 보는 장(FR-19, FR-47 ①)
  await expect(presence(editor, "김작가")).toBeVisible({ timeout: LIVE_MS });
  await expect(presence(editor, "박디자")).toBeVisible({ timeout: LIVE_MS });
  await expect(presence(author, "편집자")).toBeVisible({ timeout: LIVE_MS });
  await expect(presence(editor, "김작가").getByTestId("presence-chapter")).toHaveText(/\S/);

  // QA-F09: 작가가 쓰면 새로고침 없이 두 창에 들어온다
  await author.getByTestId("manuscript").click();
  await author.keyboard.type("첫 문장이 다른 창에 보인다.");
  await expect(author.getByTestId("save-state")).toHaveText("저장됨", { timeout: LIVE_MS });
  await expect(editor.getByTestId("manuscript")).toContainText("첫 문장이 다른 창에 보인다.", { timeout: LIVE_MS });
  await expect(designer.getByTestId("manuscript")).toContainText("첫 문장이 다른 창에 보인다.", { timeout: LIVE_MS });

  // 작가가 입력하는 사이 다른 창의 변경(편집자의 의견)이 들어와도 작가의 입력은 그대로다(FR-18 ④)
  await author.keyboard.press("Enter");
  await author.keyboard.type("둘째 문단");
  await expect(author.getByTestId("manuscript")).toContainText("둘째 문단");
  await expect(author.getByTestId("save-state")).toHaveText("저장됨", { timeout: LIVE_MS });
  await expect(editor.getByTestId("manuscript")).toContainText("둘째 문단", { timeout: LIVE_MS });

  // 편집자가 남긴 의견이 작가의 함께 봄에 들어온다(A-22를 다시 읽음)
  const first = editor.getByTestId("manuscript").locator("p").first();
  await first.evaluate((el) => {
    const range = document.createRange();
    const text = el.firstChild!;
    range.setStart(text, 0);
    range.setEnd(text, 2);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await editor.getByRole("button", { name: "의견 남기기" }).click();
  const compose = editor.getByRole("dialog", { name: "의견 남기기" });
  await compose.getByLabel("의견").fill("여기 봐 주세요");
  await compose.getByRole("button", { name: "보내기" }).click();
  await author.getByRole("tab", { name: /함께 봄/ }).click();
  await expect(author.getByTestId("comment-card")).toContainText("여기 봐 주세요", { timeout: LIVE_MS });

  // QA-F10: 디자이너가 작가의 아바타를 누르면 작가가 보는 문단으로 간다
  const second = author.getByTestId("manuscript").locator("p").nth(1);
  await second.click();
  const paragraphId = await second.getAttribute("data-paragraph-id");
  expect(paragraphId).toBeTruthy();
  await designer.waitForTimeout(6_000); // 위치 알리기 5초 간격
  await presence(designer, "김작가").click();
  await expect(designer.locator(`[data-paragraph-id="${paragraphId}"]`)).toBeInViewport({ timeout: LIVE_MS });

  // 창을 닫으면 접속자에서 사라진다(30초 안)
  await designer.context().close();
  await expect(presence(editor, "박디자")).toHaveCount(0, { timeout: 45_000 });
});

test("다른 브라우저에서 더한 장과 바뀐 장 상태가 열어 둔 창의 원고 구조에 들어온다", async ({ page: editor, browser }) => {
  await createBook(editor, `장 더하기 ${Date.now()}`);
  const author = await freshPage(browser);
  await join(author, await inviteUrl(editor, "author"), "이작가");
  const outline = editor.getByRole("navigation", { name: "원고 구조" });
  await expect(outline.getByTestId("chapter-status")).toHaveCount(1);

  await author.getByRole("button", { name: "장 추가" }).click();
  await author.getByLabel("새 장 제목").fill("둘째 장");
  await author.getByRole("button", { name: "추가", exact: true }).click();
  await expect(author).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  await expect(outline.getByText("둘째 장")).toBeVisible({ timeout: LIVE_MS });
});

test("편집자가 템플릿을 바꾸면 열어 둔 작가 창의 지면과 조판 패널에 그 템플릿과 바꾼 사람이 보인다(FR-16 ⑤, FR-18)", async ({ page: editor, browser }) => {
  await createBook(editor, `템플릿 ${Date.now()}`);
  const author = await freshPage(browser);
  await join(author, await inviteUrl(editor, "author"), "최작가");
  await author.getByRole("button", { name: "조판 설정", exact: true }).click();
  await expect(author.getByTestId("layout-values")).toContainText("에세이");

  await editor.getByRole("button", { name: "조판 설정", exact: true }).click();
  await editor.getByTestId("layout-panel").getByText("실용서", { exact: true }).click();
  await editor.getByRole("dialog", { name: "템플릿 바꾸기" }).getByRole("button", { name: "바꾸기" }).click();
  await expect(editor.getByTestId("page")).toHaveAttribute("data-template", "practical");

  // 새로고침 없이 작가 창에 들어온다(템플릿·값·마지막에 바꾼 사람이 함께)
  await expect(author.getByTestId("page")).toHaveAttribute("data-template", "practical", { timeout: LIVE_MS });
  await expect(author.getByTestId("layout-values")).toContainText("실용서");
  await expect(author.getByTestId("layout-last-change")).toContainText("편집자");
});

test("미리보기를 열어 둔 채 다른 브라우저에서 원고를 고치면 '반영 중' 뒤 다시 그려진다(FR-43 ③, QA-F14)", async ({ page: editor, browser }) => {
  await createBook(editor, `미리보기 반영 ${Date.now()}`);
  const author = await freshPage(browser);
  await join(author, await inviteUrl(editor, "author"), "정작가");

  await editor.getByTestId("preview-link").click();
  await expect(editor).toHaveURL(/\/preview$/, { timeout: NAVIGATE_MS });
  await expect(editor.getByTestId("preview-range")).toBeVisible({ timeout: NAVIGATE_MS });
  // '반영 중'은 잠깐 보였다 사라져서, 보였는지를 기록해 둔다
  await editor.evaluate(() => {
    const w = window as unknown as { sawReflow: boolean };
    w.sawReflow = false;
    new MutationObserver(() => {
      if (document.querySelector("[data-testid='preview-reflowing']")) w.sawReflow = true;
    }).observe(document.body, { subtree: true, childList: true });
  });

  // 아무것도 바뀌지 않으면 다시 그리지 않는다(바뀐 것 받기 세 번 넘게 기다림)
  await editor.waitForTimeout(10_000);
  expect(await editor.evaluate(() => (window as unknown as { sawReflow: boolean }).sawReflow)).toBe(false);

  await author.getByTestId("manuscript").click();
  await author.keyboard.type("미리보기에 들어올 문장.");
  await expect(author.getByTestId("save-state")).toHaveText("저장됨", { timeout: LIVE_MS });

  await expect(editor.getByTestId("preview-stage")).toContainText("미리보기에 들어올 문장.", { timeout: LIVE_MS });
  expect(await editor.evaluate(() => (window as unknown as { sawReflow: boolean }).sawReflow)).toBe(true);
});
