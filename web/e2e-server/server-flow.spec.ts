// 서버로 도는 핵심 흐름(F2·F3): 다른 브라우저(컨텍스트)끼리 같은 책을 본다.
// QA-F01·03~08(책·참여·링크), QA-F11·15~17(원고·장·조판·검토본)의 서버 쪽 동작.
import { expect, test, type Browser, type Page } from "@playwright/test";

const WORKSPACE = /\/p\/[0-9a-f-]{36}\/c\/[0-9a-f-]{36}$/;
const NAVIGATE_MS = 45_000;

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
  // 편집자 링크 안내(ST-02)
  const dialog = page.getByRole("dialog", { name: "편집자 링크" });
  await expect(dialog).toBeVisible({ timeout: NAVIGATE_MS });
  const editorUrl = await dialog.getByTestId("editor-link").inputValue();
  expect(editorUrl).toMatch(/\/e\/[A-Za-z0-9_-]+$/);
  await dialog.getByRole("button", { name: "확인" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  return { editorUrl, workspaceUrl: page.url() };
}

async function makeLink(page: Page, role: "author" | "designer") {
  await page.getByRole("button", { name: "초대", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "참여자 초대" });
  const row = dialog.getByTestId(`share-${role}`);
  await row.getByRole("button", { name: "링크 만들기" }).click();
  const box = row.getByRole("textbox");
  await expect(box).toHaveValue(/\/j\/[0-9a-f-]{36}$/);
  return { dialog, row, url: await box.inputValue() };
}

async function join(page: Page, url: string, name: string) {
  await page.goto(url);
  await page.getByLabel("이름").fill(name);
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
}

test("다른 브라우저에서 같은 책: 만들기 → 초대 → 참여 → 원고 저장 → 새로고침해도 같음", async ({ page, browser }) => {
  const { editorUrl, workspaceUrl } = await createBook(page, `서버 책 ${Date.now()}`);
  await expect(page.getByTestId("role-badge")).toHaveText("편집자");

  const { dialog, url: authorUrl } = await makeLink(page, "author");
  await dialog.getByRole("button", { name: "닫기" }).click();

  // 작가: 다른 브라우저. 주소의 token은 들어온 뒤 지워진다(D-27)
  const author = await freshPage(browser);
  await author.goto(authorUrl);
  await expect(author).toHaveURL(/\/j$/);
  await author.getByLabel("이름").fill("김작가");
  await author.getByRole("button", { name: "들어가기" }).click();
  await expect(author).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  await expect(author.getByTestId("role-badge")).toHaveText("작가");

  // 빈 첫 장(FR-01 ①)에 글을 쓰면 서버에 저장된다
  await author.getByTestId("manuscript").click();
  await author.keyboard.type("서버에 저장되는 첫 문장.");
  await expect(author.getByTestId("save-state")).toHaveText("저장됨", { timeout: 15_000 });

  // 편집자 브라우저에서 새로고침하면 같은 원고가 보인다
  await page.goto(workspaceUrl);
  await expect(page.getByTestId("manuscript")).toContainText("서버에 저장되는 첫 문장.");

  // 편집자 링크로 세 번째 브라우저에서 들어오면 편집자 홈에 그 책이 있다(FR-46)
  const elsewhere = await freshPage(browser);
  await elsewhere.goto(editorUrl);
  await expect(elsewhere).toHaveURL(/\/home$/, { timeout: NAVIGATE_MS });
  await expect(elsewhere.getByTestId("book-card")).toHaveCount(1);
  await elsewhere.getByTestId("book-card").click();
  await expect(elsewhere).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  await expect(elsewhere.getByTestId("manuscript")).toContainText("서버에 저장되는 첫 문장.");
});

test("초대 링크를 새로 바꾸면 옛 링크로는 들어올 수 없다(FR-08, S-03)", async ({ page, browser }) => {
  await createBook(page, `링크 책 ${Date.now()}`);
  const { dialog, row, url: oldUrl } = await makeLink(page, "author");
  await row.getByRole("button", { name: "새로 바꾸기" }).click();
  await expect(row.getByRole("textbox")).not.toHaveValue(oldUrl);
  const newUrl = await row.getByRole("textbox").inputValue();
  await dialog.getByRole("button", { name: "닫기" }).click();

  const stranger = await freshPage(browser);
  await stranger.goto(oldUrl);
  await expect(stranger.getByText("링크를 쓸 수 없어요")).toBeVisible({ timeout: NAVIGATE_MS });

  const author = await freshPage(browser);
  await join(author, newUrl, "새 작가");
  await expect(author.getByTestId("role-badge")).toHaveText("작가");
});

test("장 추가·조판 값이 다른 브라우저에도 남는다(FR-15, FR-16 ②)", async ({ page, browser }) => {
  const { workspaceUrl } = await createBook(page, `장 책 ${Date.now()}`);
  const { dialog, url } = await makeLink(page, "author");
  await dialog.getByRole("button", { name: "닫기" }).click();
  const author = await freshPage(browser);
  await join(author, url, "김작가");

  // 작가가 장을 더한다
  await author.getByRole("button", { name: "장 추가" }).click();
  await author.getByLabel("새 장 제목").fill("2장 런던");
  await author.getByRole("button", { name: "추가" }).click();
  await expect(author.getByRole("navigation", { name: "원고 구조" })).toContainText("2장 런던", { timeout: NAVIGATE_MS });

  // 편집자 브라우저: 새로고침하면 장이 보이고, 조판 값을 바꾼다
  await page.goto(workspaceUrl);
  await expect(page.getByRole("navigation", { name: "원고 구조" })).toContainText("2장 런던");
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  const layout = page.getByTestId("layout-panel");
  await layout.getByLabel("위 여백 숫자").fill("25");
  await layout.getByLabel("위 여백 숫자").press("Enter");
  await expect(layout.getByTestId("layout-last-change")).toBeVisible();

  // 작가 브라우저에서 다시 읽으면 바뀐 값이 보인다(작가는 값만 글자로, D-15)
  await author.reload();
  await author.getByRole("button", { name: "조판 설정", exact: true }).click();
  await expect(author.getByTestId("layout-values")).toContainText("위 25");
});

test("다른 탭이 먼저 저장해 409가 나면 최신 원고로 다시 그리고 이어서 저장한다(C-4, D-30)", async ({ page, browser }) => {
  await createBook(page, `충돌 책 ${Date.now()}`);
  const { dialog, url } = await makeLink(page, "author");
  await dialog.getByRole("button", { name: "닫기" }).click();

  // 같은 작가가 두 탭(같은 브라우저 컨텍스트)에서 같은 장을 연다
  const author = await freshPage(browser);
  await join(author, url, "김작가");
  const second = await author.context().newPage();
  // 함께 작업(F4)이 둘째 탭에 최신 원고를 먼저 가져오면 409가 나지 않거나, 다시 그리기 전에 아래 기다림이 끝난다.
  // 이 테스트는 409 복구를 보려는 것이라 둘째 탭의 바뀐 것 받기(A-31)를 막는다. 받아서 반영하는 쪽은 two-browsers.spec.ts.
  await second.route("**/changes*", (route) => route.abort());
  await second.goto(author.url());
  await expect(second.getByTestId("manuscript")).toBeVisible({ timeout: NAVIGATE_MS });

  // 첫 탭이 먼저 저장한다(버전 1 → 2)
  await author.getByTestId("manuscript").click();
  await author.keyboard.type("첫 탭의 문장.");
  await expect(author.getByTestId("save-state")).toHaveText("저장됨", { timeout: 15_000 });

  // 둘째 탭은 옛 버전(1)으로 저장하려다 409 → 최신 원고로 다시 그린다
  await second.getByTestId("manuscript").click();
  await second.keyboard.type("둘째");
  await expect(second.getByTestId("manuscript")).toContainText("첫 탭의 문장.", { timeout: 15_000 });

  // 다시 그린 뒤 이어 쓰면 충돌 없이 저장된다
  await second.getByTestId("manuscript").click();
  await second.keyboard.press("End");
  await second.keyboard.type(" 이어서.");
  await expect(second.getByTestId("save-state")).toHaveText("저장됨", { timeout: 15_000 });
  await author.reload();
  await expect(author.getByTestId("manuscript")).toContainText("이어서.");
});
