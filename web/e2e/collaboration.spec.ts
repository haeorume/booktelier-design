// 사람끼리 주고받는 일(W4): 의견, 수정 제안, 검토 완료, 확인할 일, 참여자 표시.
import { expect, test, type Page } from "@playwright/test";
import { enterAsAuthor, expectEvent, paragraph, selectText, switchRole } from "./helpers";

async function leaveComment(page: Page, start: number, end: number, body: string) {
  await leaveCommentOn(page, "para_03", start, end, body);
}

async function leaveCommentOn(page: Page, id: string, start: number, end: number, body: string) {
  await selectText(page, id, start, end);
  await page.getByRole("button", { name: "의견 남기기" }).click();
  const dialog = page.getByRole("dialog", { name: "의견 남기기" });
  await expect(dialog.getByRole("button", { name: "보내기" })).toBeDisabled(); // 내용이 비면 보낼 수 없다
  await dialog.getByLabel("의견").fill(body);
  await dialog.getByRole("button", { name: "보내기" }).click();
  await expect(dialog).toHaveCount(0);
}

test("세 역할 모두 글자를 골라 의견을 남길 수 있고 원고는 바뀌지 않는다(QA-39)", async ({ page }) => {
  await enterAsAuthor(page);
  const before = await paragraph(page, "para_03").textContent();
  await leaveComment(page, 0, 3, "작가 의견");
  await switchRole(page, "편집자");
  await leaveComment(page, 4, 7, "편집자 의견");
  await switchRole(page, "디자이너", "디자이너 C");
  await leaveComment(page, 8, 11, "디자이너 의견");

  await page.getByRole("tab", { name: /함께 봄/ }).click();
  const cards = page.getByTestId("comment-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("작가 의견");
  await expect(cards.nth(1)).toContainText("편집자 의견");
  await expect(cards.nth(2)).toContainText("디자이너");
  await expect(paragraph(page, "para_03").locator(".comment-mark")).toHaveCount(3);
  expect(await paragraph(page, "para_03").textContent()).toBe(before);
});

test("편집자가 직접 남긴 수정 제안을 작가가 거절하면 원문이 그대로다. 작가·디자이너에게는 수정 제안 버튼이 없다(QA-40)", async ({ page }) => {
  await enterAsAuthor(page);
  await selectText(page, "para_04", 0, 2);
  await expect(page.getByRole("button", { name: "의견 남기기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "수정 제안하기" })).toHaveCount(0);

  await switchRole(page, "편집자");
  await selectText(page, "para_04", 0, 2); // '다음'
  await page.getByRole("button", { name: "수정 제안하기" }).click();
  const dialog = page.getByRole("dialog", { name: "수정 제안하기" });
  await dialog.getByLabel("바꿀 내용").fill("이튿");
  await dialog.getByRole("button", { name: "보내기" }).click();
  await expect(paragraph(page, "para_04").locator(".edit-insert")).toHaveText("이튿");

  await switchRole(page, "디자이너", "디자이너 C");
  await selectText(page, "para_04", 3, 5);
  await expect(page.getByRole("button", { name: "수정 제안하기" })).toHaveCount(0);
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  await expect(page.getByTestId("edit-card").getByRole("button", { name: "수락" })).toHaveCount(0);

  await switchRole(page, "작가");
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  await page.getByTestId("edit-card").getByRole("button", { name: "거절" }).click();
  await expect(page.getByTestId("edit-card").getByTestId("edit-status")).toHaveText("거절됨");
  await expect(paragraph(page, "para_04")).toContainText("다음 날은 비가 왔다.");
  await expect(paragraph(page, "para_04").locator(".edit-insert")).toHaveCount(0);
  await expectEvent(page, "suggested_edit_rejected", { role: "author", props: { from_ai: false } });
});

test("의견을 단 자리 앞에 글을 더해도 의견은 원래 글자를 가리킨다(NFR-05 ①)", async ({ page }) => {
  await enterAsAuthor(page);
  await selectText(page, "para_04", 0, 2); // '다음'
  await page.getByRole("button", { name: "의견 남기기" }).click();
  await page.getByRole("dialog", { name: "의견 남기기" }).getByLabel("의견").fill("날짜를 밝혀 주세요");
  await page.getByRole("dialog", { name: "의견 남기기" }).getByRole("button", { name: "보내기" }).click();
  await expect(paragraph(page, "para_04").locator(".comment-mark")).toHaveText("다음");

  // 문단 맨 앞에 글을 더한다
  await paragraph(page, "para_04").click();
  await paragraph(page, "para_04").evaluate((el) => {
    const range = document.createRange();
    range.setStart(el.firstChild!.firstChild ?? el.firstChild!, 0);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.keyboard.type("그리고 ");
  await expect(paragraph(page, "para_04")).toContainText("그리고 다음 날은");
  await expect(paragraph(page, "para_04").locator(".comment-mark")).toHaveText("다음");
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  await expect(page.getByTestId("comment-card")).toContainText("“다음”");

  // 새로고침해도 옮겨진 자리가 남는다
  await page.reload();
  await expect(paragraph(page, "para_04").locator(".comment-mark")).toHaveText("다음");
});

test("답글만 달린 의견과 원고에 반영된 수정 제안은 카드에서 다르게 보인다(QA-41)", async ({ page }) => {
  await enterAsAuthor(page);
  await leaveComment(page, 0, 3, "여기 확인해 주세요");
  await switchRole(page, "편집자");
  await selectText(page, "para_04", 0, 2);
  await page.getByRole("button", { name: "수정 제안하기" }).click();
  await page.getByRole("dialog", { name: "수정 제안하기" }).getByLabel("바꿀 내용").fill("이튿");
  await page.getByRole("dialog", { name: "수정 제안하기" }).getByRole("button", { name: "보내기" }).click();
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  const comment = page.getByTestId("comment-card");
  await comment.getByLabel("답글").fill("확인했어요");
  await comment.getByRole("button", { name: "답글" }).click();
  await expect(comment.getByTestId("reply")).toContainText("확인했어요");

  await switchRole(page, "작가");
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  await page.getByTestId("edit-card").getByRole("button", { name: "수락" }).click();
  await expect(page.getByTestId("edit-card")).toContainText("원고에 반영됨");
  await expect(page.getByTestId("comment-card")).toContainText("답글 1");
  await expect(page.getByTestId("comment-card")).not.toContainText("원고에 반영됨");
  await expect(paragraph(page, "para_04")).toContainText("이튿 날은 비가 왔다.");
});

test("검토 완료를 누르면 장이 검토 완료가 되고 확인할 일이 준다. 작가에게는 버튼이 없다(QA-42)", async ({ page }) => {
  await enterAsAuthor(page);
  await expect(page.getByRole("button", { name: "검토 완료" })).toHaveCount(0);
  await page.getByRole("button", { name: "검토 요청" }).click();
  await switchRole(page, "편집자");
  await expect(page.getByRole("button", { name: "검토 요청" })).toHaveCount(0);
  await page.getByRole("button", { name: "검토 완료" }).click();
  await expect(page.getByTestId("chapter-head-status")).toHaveText("검토 완료");
  await expect(page.getByRole("button", { name: "검토 완료" })).toBeDisabled();
  await page.getByRole("link", { name: "편집자 홈" }).click();
  await expect(page.getByTestId("pending-count")).toHaveText("0");
  await expect(page.getByTestId("book-card")).toContainText("검토 완료");

  // 검토 완료인 장에서도 작가는 다시 검토를 요청할 수 있다(FR-13 ①)
  await page.getByTestId("book-card").click();
  await switchRole(page, "작가");
  await expect(page.getByRole("button", { name: "검토 요청" })).toBeEnabled();
});

test("작가가 남긴 의견은 편집자가 열어 볼 때까지 확인할 일로 센다(FR-02 ②)", async ({ page }) => {
  await enterAsAuthor(page);
  await leaveComment(page, 0, 3, "봐 주세요");
  await switchRole(page, "편집자");
  await page.getByRole("link", { name: "편집자 홈" }).click();
  await expect(page.getByTestId("pending-count")).toHaveText("1");
  await page.getByTestId("book-card").click();
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  const comment = page.getByTestId("comment-card");
  await expect(comment).toContainText("새 의견");
  await comment.click();
  await expect(comment).not.toContainText("새 의견");
  await page.getByRole("link", { name: "편집자 홈" }).click();
  await expect(page.getByTestId("pending-count")).toHaveText("0");
});

test("답글도 확인할 일로 세고, 의견 카드를 열면 답글까지 읽은 것이 된다(FR-02 ②)", async ({ page }) => {
  await enterAsAuthor(page);
  await leaveComment(page, 0, 3, "봐 주세요");
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  const comment = page.getByTestId("comment-card");
  await comment.getByLabel("답글").fill("하나 더 있어요");
  await comment.getByRole("button", { name: "답글" }).click();
  await expect(comment.getByTestId("reply")).toHaveCount(1);

  await switchRole(page, "편집자");
  await page.getByRole("link", { name: "편집자 홈" }).click();
  await expect(page.getByTestId("pending-count")).toHaveText("2");
  await page.getByTestId("book-card").click();
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  await page.getByTestId("comment-card").click();
  await page.getByRole("link", { name: "편집자 홈" }).click();
  await expect(page.getByTestId("pending-count")).toHaveText("0");
});

test("원문이 이미 바뀐 제안은 장 검토 결과와 요약에 세지 않는다(FR-21 ②, FR-22)", async ({ page }) => {
  await enterAsAuthor(page);
  // 작가가 '몇일'을 먼저 고친다
  await selectText(page, "para_01", 9, 11);
  await page.keyboard.type("며칠");
  await expect(paragraph(page, "para_01")).toContainText("며칠이 지나서야");
  await switchRole(page, "편집자");
  await page.getByRole("button", { name: "장 검토" }).click();
  await expect(page.getByTestId("ai-card")).toHaveCount(4);
  await expect(page.getByTestId("review-summary")).toHaveText("띄어쓰기 1 · 표기 통일 2 · 윤문 1");
});

test("수락한 수정 제안은 뒤쪽 의견 자리가 옮겨져도 수락됨으로 남는다(FR-34 ②)", async ({ page }) => {
  await enterAsAuthor(page);
  await leaveCommentOn(page, "para_04", 3, 4, "날짜"); // '날'
  await switchRole(page, "편집자");
  await selectText(page, "para_04", 0, 2); // '다음'
  await page.getByRole("button", { name: "수정 제안하기" }).click();
  await page.getByRole("dialog", { name: "수정 제안하기" }).getByLabel("바꿀 내용").fill("그 다음");
  await page.getByRole("dialog", { name: "수정 제안하기" }).getByRole("button", { name: "보내기" }).click();

  await switchRole(page, "작가");
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  await page.getByTestId("edit-card").getByRole("button", { name: "수락" }).click();
  await expect(page.getByTestId("edit-status")).toHaveText("수락됨");
  await expect(paragraph(page, "para_04")).toContainText("그 다음 날은");
  await expect(paragraph(page, "para_04").locator(".comment-mark")).toHaveText("날");
  await expectEvent(page, "first_edit", { role: "author", props: { via: "accept" } }); // 작가가 처음 바꾼 일이 수락

  await page.reload();
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  await expect(page.getByTestId("edit-status")).toHaveText("수락됨");
  await expect(page.getByTestId("edit-card").getByRole("button", { name: "수락" })).toHaveCount(0);
});

test("고른 글자를 타자로 바꾸면 옛 선택 메뉴가 사라진다(FR-32)", async ({ page }) => {
  await enterAsAuthor(page);
  await selectText(page, "para_04", 0, 2);
  await expect(page.getByRole("button", { name: "의견 남기기" })).toBeVisible();
  await page.keyboard.type("이튿");
  await expect(paragraph(page, "para_04")).toContainText("이튿 날은");
  await expect(page.getByRole("button", { name: "의견 남기기" })).toHaveCount(0);
});

test("상단 바에 이 책의 참여자가 보이고 지금 역할의 사람이 강조된다(QA-23)", async ({ page }) => {
  await enterAsAuthor(page);
  const people = page.getByTestId("participants").getByRole("listitem");
  await expect(people).toHaveCount(2);
  await expect(people.filter({ hasText: "작가 A" })).toHaveAttribute("aria-current", "true");
  await expect(people.filter({ hasText: "편집자" })).not.toHaveAttribute("aria-current", "true");
  await switchRole(page, "디자이너", "디자이너 C");
  await expect(people).toHaveCount(3);
  await expect(people.filter({ hasText: "디자이너 C" })).toHaveAttribute("aria-current", "true");
});

test("장 검토 결과는 실행한 편집자에게만 보인다(QA-38, FR-21 ③)", async ({ page }) => {
  await enterAsAuthor(page);
  await switchRole(page, "편집자");
  await page.getByRole("button", { name: "장 검토" }).click();
  await expect(page.getByTestId("ai-card")).toHaveCount(5);
  await switchRole(page, "작가");
  await expect(page.getByTestId("ai-card")).toHaveCount(0);
  await expect(page.getByTestId("manuscript").locator(".ai-underline")).toHaveCount(0);
  await switchRole(page, "디자이너", "디자이너 C");
  await expect(page.getByRole("tab", { name: /내 AI 제안/ })).toHaveCount(0);
});
