// 데모 핵심 흐름 13단계를 서버로(PLAN F5 완료 기준, 데모 제공자). 편집자·작가·디자이너가 서로 다른 브라우저다.
// 1차 로컬 e2e(e2e/demo-flow.spec.ts)와 같은 순서. 실시간 반영(F4) 전이라 다른 사람의 변경은 새로고침해서 본다.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { aiCards, card, paragraph, typeAtEnd } from "../e2e/helpers";

const WORKSPACE = /\/p\/[0-9a-f-]{36}\/c\/[0-9a-f-]{36}$/;
const NAVIGATE_MS = 45_000;

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  return context.newPage();
}

async function join(page: Page, url: string, name: string) {
  await page.goto(url);
  await page.getByLabel("이름").fill(name);
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
}

test("데모 1~13단계를 서버로: 세 브라우저가 같은 책을 만든다", async ({ page: editor, browser }) => {
  const title = `파리에서 보낸 한 달 ${Date.now()}`;

  // 1·2. 편집자: 예시 원고로 책을 만든다(D-39). 편집자 링크 안내 뒤 작업 공간
  await editor.goto("/");
  await editor.getByLabel("책 제목").fill(title);
  await editor.getByText("에세이", { exact: true }).click();
  await editor.getByLabel("예시 원고로 시작").check();
  const create = editor.getByRole("button", { name: "만들기" });
  await expect(create).toBeEnabled();
  await create.click();
  await editor.getByRole("dialog", { name: "편집자 링크" }).getByRole("button", { name: "확인" }).click();
  await expect(editor).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  const workspaceUrl = editor.url();
  await expect(paragraph(editor, "para_02")).toContainText("오르세 미술관");

  // 3. 공유: 작가 링크와 디자이너 링크를 만든다
  await editor.getByRole("button", { name: "공유" }).click();
  const share = editor.getByRole("dialog", { name: "공유" });
  const links: Record<string, string> = {};
  for (const role of ["author", "designer"]) {
    const row = share.getByTestId(`share-${role}`);
    await row.getByRole("button", { name: "링크 만들기" }).click();
    await expect(row.getByRole("textbox")).toHaveValue(/\/j\/[0-9a-f-]{36}$/);
    links[role] = await row.getByRole("textbox").inputValue();
  }
  await share.getByRole("button", { name: "닫기" }).click();

  // 4·5. 작가: 다른 브라우저에서 링크로 들어온다
  const author = await freshPage(browser);
  await author.goto(links.author);
  await expect(author.getByTestId("join-book-title")).toHaveText(title);
  await expect(author.getByTestId("join-role")).toHaveText("작가");
  await author.getByLabel("이름").fill("작가 A");
  await author.getByRole("button", { name: "들어가기" }).click();
  await expect(author).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  await expect(author.getByTestId("role-badge")).toHaveText("작가");

  // 6. 작가: 둘째 문단을 고치면 서버의 실시간 교정이 그 문단에만 제안을 띄운다. 적용은 서버가 원고에 반영한다
  await typeAtEnd(author, "para_02", " 오래도록.");
  await expect(aiCards(author)).toHaveCount(2, { timeout: 20_000 });
  const para02 = paragraph(author, "para_02");
  await expect(para02.locator(".ai-underline")).toHaveText(["쏟아지는 것이 가능했고", "한참동안"]);
  await card(author, "쏟아지는 것이 가능했고").getByRole("button", { name: "적용" }).click();
  await expect(para02).toContainText("햇빛이 그림 위로 쏟아졌고, 나는");
  await expect(aiCards(author)).toHaveCount(1);
  await expect(author.getByTestId("save-state")).toHaveText("저장됨");
  await author.reload();
  await expect(paragraph(author, "para_02")).toContainText("쏟아졌고, 나는 모네의 그림 앞에서 한참동안 서 있었다. 오래도록.");

  // 7. 작가: 검토 요청
  await author.getByRole("button", { name: "검토 요청" }).click();
  await expect(author.getByTestId("chapter-head-status")).toHaveText("검토 요청");

  // 8. 편집자: 홈에서 확인할 일 1, 책을 열어 장 검토
  await editor.goto("/home");
  const bookCard = editor.getByTestId("book-card").filter({ hasText: title });
  await expect(bookCard.getByTestId("pending-count")).toHaveText("1");
  await expect(bookCard).toContainText("검토 요청");
  await bookCard.click();
  await expect(editor).toHaveURL(workspaceUrl, { timeout: NAVIGATE_MS });
  await expect(paragraph(editor, "para_02")).toContainText("쏟아졌고");
  await editor.getByRole("button", { name: "장 검토" }).click();
  await expect(aiCards(editor)).toHaveCount(5, { timeout: 20_000 });
  await expect(editor.getByTestId("review-summary")).toHaveText("맞춤법 1 · 띄어쓰기 1 · 표기 통일 2 · 윤문 1");

  // 9. 편집자: '몇일'을 수정 제안으로 보낸다. 이유가 담긴 카드 하나(FR-29 ⑤, QA-F19)
  const myeot = card(editor, "몇일");
  await myeot.getByRole("button", { name: "보내기" }).click();
  const sendDialog = editor.getByRole("dialog", { name: "보내기" });
  await sendDialog.getByLabel("수정 제안").check();
  await sendDialog.getByLabel("보내는 문구").fill("'며칠'로 고쳐 주세요.");
  await sendDialog.getByRole("button", { name: "보내기" }).click();
  await expect(myeot.getByTestId("ai-status-chip")).toHaveText("보냄");
  await editor.getByRole("tab", { name: /함께 봄/ }).click();
  await expect(editor.getByTestId("edit-card")).toHaveCount(1);
  await expect(editor.getByTestId("edit-card").getByTestId("edit-reason")).toContainText("'며칠'로 고쳐 주세요.");
  await expect(editor.getByTestId("comment-card")).toHaveCount(0);

  // 10. 작가: 새로고침하면 지운 글자·더한 글자가 보이고, 수락하면 서버가 원고에 반영한다
  await author.reload();
  const para01 = paragraph(author, "para_01");
  await expect(para01.locator(".edit-delete")).toHaveText("몇일");
  await expect(aiCards(author)).toHaveCount(1); // 편집자의 장 검토 결과는 작가에게 오지 않는다(D-29)
  await author.getByRole("tab", { name: /함께 봄/ }).click();
  await author.getByTestId("edit-card").getByRole("button", { name: "수락" }).click();
  await expect(author.getByTestId("edit-card").getByTestId("edit-status")).toHaveText("수락됨");
  await expect(para01).toContainText("파리에 도착한지 며칠이 지나서야");

  // 편집자: 새로고침하면 원래 AI 제안은 반영됨
  await editor.reload();
  await expect(paragraph(editor, "para_01")).toContainText("며칠이 지나서야");
  await expect(card(editor, "몇일").getByTestId("ai-status-chip")).toHaveText("반영됨");

  // 11. 편집자: 검토본을 남긴다
  await editor.getByRole("button", { name: "검토본" }).click();
  const snap = editor.getByRole("dialog", { name: "검토본" });
  await snap.getByLabel("검토본 이름").fill("1장 1차 검토본");
  await snap.getByRole("button", { name: "검토본 저장" }).click();
  await expect(snap.getByTestId("snapshot-item")).toContainText("1장 1차 검토본");
  await snap.getByTestId("snapshot-item").click();
  await expect(snap.getByTestId("snapshot-preview")).toContainText("며칠이 지나서야");

  // 12. 디자이너: 세 번째 브라우저에서 들어온다. 원고를 고칠 수 없고 AI 탭이 없다
  const designer = await freshPage(browser);
  await join(designer, links.designer, "디자이너 C");
  await expect(designer.getByTestId("role-badge")).toHaveText("디자이너");
  await expect(designer.getByTestId("manuscript")).toHaveAttribute("contenteditable", "false");
  await expect(designer.getByRole("tab", { name: /내 AI 제안/ })).toHaveCount(0);

  // 13. 디자이너: 행간을 바꾸면 작가 브라우저에서도 같은 값이다(원고는 그대로)
  await designer.getByRole("button", { name: "조판 설정", exact: true }).click();
  const layout = designer.getByTestId("layout-panel");
  await layout.getByLabel("행간 숫자").fill("2");
  await layout.getByLabel("행간 숫자").press("Enter");
  await expect(layout.getByTestId("layout-last-change")).toContainText("디자이너 C");
  const textBefore = await paragraph(author, "para_01").textContent();
  await author.reload();
  await author.getByRole("button", { name: "조판 설정", exact: true }).click();
  await expect(author.getByTestId("layout-values")).toContainText("2");
  expect(await paragraph(author, "para_01").textContent()).toBe(textBefore);
});
