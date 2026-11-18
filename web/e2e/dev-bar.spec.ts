// 개발용 막대(DV-02, FR-41, QA-24)와 W2 화면의 주변 상태.
import { expect, test } from "@playwright/test";
import { createBookAndCopyLinks, events, expectEvent } from "./helpers";

test("막대로 역할을 바꾸면 주소는 그대로이고 지금 참여자만 바뀐다(QA-24, FR-41 ②)", async ({ page }) => {
  const { workspaceUrl } = await createBookAndCopyLinks(page);
  const bar = page.getByTestId("dev-bar");
  await expect(bar).toContainText("개발용");
  await expect(bar.getByRole("button", { name: "편집자" })).toHaveAttribute("aria-pressed", "true");

  // 처음 작가로 바꾸면 이름을 묻는다
  await bar.getByRole("button", { name: "작가" }).click();
  const ask = page.getByRole("dialog", { name: "이름 넣기" });
  await expect(ask.getByTestId("join-role")).toHaveText("작가");
  await ask.getByLabel("이름").fill("작가 A");
  await ask.getByRole("button", { name: "들어가기" }).click();
  await expect(page.getByTestId("role-badge")).toHaveText("작가");
  expect(page.url()).toBe(workspaceUrl);
  await expectEvent(page, "participant_joined", { role: "author", props: { via: "dev_bar" } });

  // 편집자로 돌아갔다가 다시 작가로 바꾸면 이름을 묻지 않는다
  await bar.getByRole("button", { name: "편집자" }).click();
  await expect(page.getByTestId("role-badge")).toHaveText("편집자");
  await bar.getByRole("button", { name: "작가" }).click();
  await expect(page.getByTestId("role-badge")).toHaveText("작가");
  await expect(page.getByRole("dialog", { name: "이름 넣기" })).toHaveCount(0);
  expect(page.url()).toBe(workspaceUrl);
  expect((await events(page)).filter((e) => e.name === "participant_joined")).toHaveLength(1);
});

test("패널 배치를 바꾸면 이후 이벤트의 panel_layout이 바뀐다(D-10)", async ({ page }) => {
  await createBookAndCopyLinks(page);
  await page.getByTestId("dev-bar").getByRole("button", { name: "나란히" }).click();
  await page.getByRole("button", { name: "공유" }).click();
  await page.getByTestId("share-author").getByRole("button", { name: "링크 복사" }).click();
  const copied = (await events(page)).filter((e) => e.name === "role_link_copied").map((e) => e.props.panel_layout);
  expect(copied.slice(0, 2)).toEqual(["single", "single"]);
  expect(copied.at(-1)).toBe("split");
});

test("만든 책이 있으면 /는 편집자 홈으로 가고, 책 카드로 작업 공간에 들어간다", async ({ page }) => {
  const { workspaceUrl } = await createBookAndCopyLinks(page, "편집자 홈 확인용");
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  const card = page.getByTestId("book-card");
  await expect(card).toContainText("편집자 홈 확인용");
  await expect(card).toContainText("수정 중");
  await expect(card.getByTestId("pending-count")).toHaveText("0");
  await card.click();
  await expect(page).toHaveURL(workspaceUrl);

  // 새 책 만들기 버튼(/?new=1)은 편집자 홈으로 보내지 않는다
  await page.goto("/?new=1");
  await expect(page.getByRole("heading", { name: "새 책 만들기" })).toBeVisible();
});

test("편집자 홈을 거쳐 새 책 만들기로 돌아와도 다음 책을 만들 수 있다", async ({ page }) => {
  await createBookAndCopyLinks(page, "첫 책");
  await page.getByRole("link", { name: "편집자 홈" }).click();
  await page.getByRole("link", { name: "새 책 만들기" }).first().click();
  const create = page.getByRole("button", { name: "만들기" });
  await expect(page.getByLabel("책 제목")).toHaveValue("");
  await page.getByLabel("책 제목").fill("둘째 책");
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole("navigation", { name: "경로" })).toContainText("둘째 책");
});

test("링크 화면은 열 때마다 role_link_opened를 한 번씩 남긴다", async ({ page }) => {
  const { authorLink } = await createBookAndCopyLinks(page);
  const opened = async () => (await events(page)).filter((e) => e.name === "role_link_opened").length;
  await page.goto(authorLink);
  await expect(page.getByTestId("join-role")).toHaveText("작가");
  await expect.poll(opened).toBe(1);

  await page.getByLabel("이름").fill("작가 A");
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page.getByTestId("role-badge")).toHaveText("작가");
  await page.goBack();
  await expect(page.getByTestId("join-role")).toHaveText("작가");
  await expect.poll(opened).toBe(2);
});

test("클립보드에 넣지 못하면 '복사됨' 대신 직접 복사하라고 안내한다", async ({ page }) => {
  await createBookAndCopyLinks(page);
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("거부됨"));
  });
  await page.getByRole("button", { name: "공유" }).click();
  const row = page.getByTestId("share-author");
  await row.getByRole("button", { name: "링크 복사" }).click();
  await expect(row.getByRole("alert")).toContainText("직접 복사해 주세요");
  await expect(row.getByRole("button", { name: "복사됨" })).toHaveCount(0);
  await expectEvent(page, "role_link_copied", { props: { role: "author", clipboard: "failed" } });
});

test("책이 없는 편집자 홈은 새 책 만들기를 안내한다", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByTestId("home-empty")).toContainText("아직 만든 책이 없어요");
});

test("없는 토큰은 '링크를 쓸 수 없어요', 없는 책은 '없는 주소예요'", async ({ page }) => {
  await page.goto(`/j/${crypto.randomUUID()}`);
  await expect(page.getByRole("heading", { name: "링크를 쓸 수 없어요" })).toBeVisible();
  await page.goto(`/p/${crypto.randomUUID()}/c/${crypto.randomUUID()}`);
  await expect(page.getByRole("heading", { name: "없는 주소예요" })).toBeVisible();
  await page.goto("/nothing-here");
  await expect(page.getByRole("heading", { name: "없는 주소예요" })).toBeVisible();
});

test("이 브라우저에 역할이 없는 책의 작업 공간은 링크로 다시 들어오라고 안내한다", async ({ page, context }) => {
  const { workspaceUrl } = await createBookAndCopyLinks(page);
  // 지금 참여자 기록만 지워, 역할이 없는 브라우저를 흉내 낸다.
  await page.evaluate(() => {
    for (const k of Object.keys(window.localStorage)) if (k.startsWith("booktelier:current:")) window.localStorage.removeItem(k);
  });
  const other = await context.newPage();
  await other.goto(workspaceUrl);
  await expect(other.getByRole("heading", { name: "받은 링크로 다시 들어와 주세요" })).toBeVisible();
});
