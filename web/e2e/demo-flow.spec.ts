// 데모 플로우(demo-flow 탭). 1~13단계를 한 브라우저에서 이어서 누른다(QA-04, NFR-17). 콘솔 오류가 없어야 하고(QA-51), 끝에서 퍼널을 본다(QA-45).
import { expect, test } from "@playwright/test";
import { aiCards, card, events, expectEvent, LINK, NAVIGATE_MS, paragraph, switchRole, typeAtEnd, WORKSPACE } from "./helpers";

test("데모 1~13단계: 책 만들기 → 초대 → 링크로 들어오기 → AI 제안 적용 → 검토 요청 → 장 검토 → 보내기 → 수락 → 검토본 → 디자이너 → 조판 설정", async ({ page }) => {
  const title = "파리에서 보낸 한 달";
  // 콘솔의 빨간 오류와 페이지 오류를 모은다(QA-51)
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. 편집자: 제목이 비어 있으면 만들기를 누를 수 없다(QA-06)
  await page.goto("/");
  const create = page.getByRole("button", { name: "만들기" });
  await expect(create).toBeDisabled();
  await page.getByLabel("책 제목").fill(title);
  await expect(create).toBeEnabled();

  // 2. 템플릿 3종 중 에세이를 고르고 만든다(QA-07)
  for (const name of ["소설", "에세이", "실용서"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByText("에세이", { exact: true }).click();
  await create.click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  const sheet = page.getByTestId("page");
  await expect(sheet).toHaveAttribute("data-template", "essay");
  const style = await sheet.evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: el.getBoundingClientRect().width, lineHeight: parseFloat(s.lineHeight) / parseFloat(s.fontSize), font: s.fontFamily, padding: s.paddingLeft };
  });
  expect(style.width).toBeCloseTo((148 / 25.4) * 96, 0); // 에세이 148mm(DESIGN.md 4장)
  expect(style.lineHeight).toBeCloseTo(1.8, 1);
  expect(style.font).toContain("serif");
  expect(parseFloat(style.padding)).toBeCloseTo((23 / 25.4) * 96, 0); // 왼쪽 = 안쪽 20mm + 제본 3mm
  await expect(sheet.locator("[data-paragraph-id=para_02]")).toContainText("오르세 미술관");
  await expect(page.getByTestId("role-badge")).toHaveText("편집자");
  await expectEvent(page, "project_created", { role: "editor" });
  await expectEvent(page, "template_selected", { props: { template_id: "essay", panel_layout: "single" } });

  // 3. 초대 창에서 작가 링크와 디자이너 링크를 각각 복사한다(QA-08)
  await page.getByRole("button", { name: "초대", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "참여자 초대" });
  const authorRow = dialog.getByTestId("share-author");
  await expect(authorRow).toContainText("작가 링크");
  await authorRow.getByRole("button", { name: "링크 복사" }).click();
  await expect(authorRow.getByRole("button", { name: "복사됨" })).toBeVisible();
  const authorLink = await page.evaluate(() => navigator.clipboard.readText());
  const designerRow = dialog.getByTestId("share-designer");
  await expect(designerRow).toContainText("디자이너 링크");
  await designerRow.getByRole("button", { name: "링크 복사" }).click();
  const designerLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(authorLink).toMatch(LINK);
  expect(designerLink).toMatch(LINK);
  expect(authorLink).not.toBe(designerLink);
  await expectEvent(page, "role_link_copied", { props: { role: "author" } });
  await expectEvent(page, "role_link_copied", { props: { role: "designer" } });
  await dialog.getByRole("button", { name: "닫기" }).click();

  // 4. 작가: 작가 링크를 같은 브라우저에서 연다. 책 제목과 받은 역할이 보인다(QA-09)
  await page.goto(authorLink);
  await expect(page.getByTestId("join-book-title")).toHaveText(title);
  await expect(page.getByTestId("join-role")).toHaveText("작가");
  await expectEvent(page, "role_link_opened", { role: "author", props: { role: "author" } });

  // 5. 이름을 넣고 들어간다. 작가로 열리고 초대가 없다(QA-10)
  const enter = page.getByRole("button", { name: "들어가기" });
  await expect(enter).toBeDisabled();
  await page.getByLabel("이름").fill("작가 A");
  await enter.click();
  await expect(page).toHaveURL(WORKSPACE);
  await expect(page.getByTestId("role-badge")).toHaveText("작가");
  await expect(page.getByRole("button", { name: "초대", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "편집자 홈" })).toHaveCount(0);
  await expectEvent(page, "participant_joined", { role: "author", props: { role: "author" } });

  // 6. 작가: 둘째 문단을 고친다. 입력을 멈추고 1.5초쯤 뒤 그 문단에만 밑줄과 카드가 뜬다(QA-11, QA-27)
  await expect(aiCards(page)).toHaveCount(0);
  await typeAtEnd(page, "para_02", " 오래도록.");
  await expect(paragraph(page, "para_02")).toContainText("서 있었다. 오래도록.");
  await expectEvent(page, "first_edit", { role: "author", props: { via: "direct" } });
  await expect(page.getByTestId("ai-status")).toContainText("분석 중");
  await expect(aiCards(page)).toHaveCount(2);
  const para02 = paragraph(page, "para_02");
  await expect(para02.locator(".ai-underline")).toHaveText(["쏟아지는 것이 가능했고", "한참동안"]);
  await expect(page.getByTestId("manuscript").locator(".ai-underline")).toHaveCount(2); // 고친 문단에만
  await expectEvent(page, "ai_suggestion_shown", { role: "author", props: { kind: "polish" } });

  // 카드에는 원문, 수정안, 대안, 종류, 이유가 있고, 작가 카드에는 보내기가 없다(QA-20, QA-29, QA-30)
  const polish = card(page, "쏟아지는 것이 가능했고");
  await expect(polish).toContainText("윤문");
  await expect(polish).toContainText("쏟아졌고");
  await expect(polish).toContainText("쏟아져 내렸고");
  await expect(polish).toContainText("번역 투 표현이에요");
  await expect(polish.getByRole("button", { name: "보내기" })).toHaveCount(0);
  await expect(card(page, "한참동안")).toContainText("띄어쓰기");

  // 적용하면 문장이 수정안으로 바뀌고 그 밑줄과 카드가 사라진다
  await polish.getByRole("button", { name: "적용" }).click();
  await expect(para02).toContainText("햇빛이 그림 위로 쏟아졌고, 나는");
  await expect(aiCards(page)).toHaveCount(1);
  await expect(para02.locator(".ai-underline")).toHaveText(["한참동안"]);
  await expectEvent(page, "ai_suggestion_applied", { role: "author", props: { kind: "polish", choice: "replacement" } });

  // 새로고침해도 고친 원고가 남는다(FR-09 ②)
  await page.reload();
  await expect(paragraph(page, "para_02")).toContainText("쏟아졌고, 나는 모네의 그림 앞에서 한참동안 서 있었다. 오래도록.");

  // 7. 작가: 검토 요청. 배지가 바뀌고 다시 누를 수 없다. 장 검토는 저절로 돌지 않는다(QA-12)
  await page.getByRole("button", { name: "검토 요청" }).click();
  await expect(page.getByTestId("chapter-head-status")).toHaveText("검토 요청");
  await expect(page.getByTestId("chapter-status")).toHaveText("검토 요청");
  await expect(page.getByRole("button", { name: "검토 요청" })).toBeDisabled();
  await expectEvent(page, "review_requested", { role: "author" });
  expect((await events(page)).filter((e) => e.name === "chapter_review_run")).toHaveLength(0);

  // 8. 편집자: 편집자 홈의 책 카드에서 확인할 일이 늘어 있다. 카드를 눌러 장 검토(QA-13)
  await switchRole(page, "편집자");
  await page.getByRole("link", { name: "편집자 홈" }).click();
  const bookCard = page.getByTestId("book-card").filter({ hasText: title });
  await expect(bookCard.getByTestId("pending-count")).toHaveText("1");
  await expect(bookCard).toContainText("검토 요청");
  await bookCard.click();
  await expect(page.getByTestId("role-badge")).toHaveText("편집자");
  const run = page.getByRole("button", { name: "장 검토" });
  await run.click();
  await expect(run).toBeDisabled();
  await expect(page.getByTestId("ai-status")).toContainText("분석 중");
  await expect(aiCards(page)).toHaveCount(5);
  await expect(run).toBeEnabled();
  await expect(page.getByTestId("review-summary")).toHaveText("맞춤법 1 · 띄어쓰기 1 · 표기 통일 2 · 윤문 1");
  await expectEvent(page, "chapter_review_run", { role: "editor" });

  // 9. 편집자: '몇일' 카드를 수정 제안으로, 문구를 다듬어 보낸다(QA-14)
  const myeot = card(page, "몇일");
  await expect(myeot.getByRole("button", { name: "적용" })).toHaveCount(0); // 편집자에게는 적용이 없다
  await myeot.getByRole("button", { name: "보내기" }).click();
  const sendDialog = page.getByRole("dialog", { name: "보내기" });
  await sendDialog.getByLabel("수정 제안").check();
  await sendDialog.getByLabel("보내는 문구").fill("'며칠'로 고쳐 주세요.");
  await sendDialog.getByRole("button", { name: "보내기" }).click();
  await expect(sendDialog).toHaveCount(0);
  await expect(myeot.getByTestId("ai-status-chip")).toHaveText("보냄");
  await expect(myeot.getByRole("button", { name: "보내기" })).toHaveCount(0);
  await expectEvent(page, "ai_suggestion_sent", { role: "editor", props: { method: "suggested_edit", kind: "spelling" } });
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  const editCard = page.getByTestId("edit-card");
  await expect(editCard).toHaveCount(1);
  await expect(editCard).toContainText("AI 제안에서 보냄");
  await expect(editCard).toContainText("며칠");
  // 수정 제안으로 보내면 이유가 담긴 카드 하나만 생기고 설명용 의견은 따로 없다(FR-29 ⑤, QA-F19)
  await expect(editCard.getByTestId("edit-reason")).toContainText("'며칠'로 고쳐 주세요.");
  await expect(page.getByTestId("comment-card")).toHaveCount(0);

  // 10. 작가: 지면에 지운 글자와 더한 글자가 보이고, 수락하면 원고가 바뀐다(QA-15)
  await switchRole(page, "작가");
  const para01 = paragraph(page, "para_01");
  await expect(para01.locator(".edit-delete")).toHaveText("몇일");
  await expect(para01.locator(".edit-insert")).toHaveText("며칠");
  await expect(aiCards(page)).toHaveCount(1); // 편집자의 장 검토 결과는 작가에게 보이지 않는다(QA-38)
  await page.getByRole("tab", { name: /함께 봄/ }).click();
  await page.getByTestId("edit-card").getByRole("button", { name: "수락" }).click();
  await expect(page.getByTestId("edit-card").getByTestId("edit-status")).toHaveText("수락됨");
  await expect(page.getByTestId("edit-card")).toContainText("원고에 반영됨");
  await expect(para01).toContainText("파리에 도착한지 며칠이 지나서야");
  await expect(para01.locator(".edit-delete")).toHaveCount(0);
  await expectEvent(page, "suggested_edit_accepted", { role: "author", props: { from_ai: true } });
  await expectEvent(page, "ai_suggestion_merged", { props: { kind: "spelling" } });

  // 편집자 화면에서 원래 AI 제안은 반영됨
  await switchRole(page, "편집자");
  await expect(card(page, "몇일").getByTestId("ai-status-chip")).toHaveText("반영됨");

  // 11. 편집자: 반영된 문장을 보고 검토본에 이름을 넣어 저장한다(QA-16)
  await expect(paragraph(page, "para_01")).toContainText("며칠이 지나서야");
  await page.getByRole("button", { name: "검토본" }).click();
  const snapDialog = page.getByRole("dialog", { name: "검토본" });
  await expect(snapDialog.getByRole("button", { name: "검토본 저장" })).toBeDisabled();
  await snapDialog.getByLabel("검토본 이름").fill("1장 1차 검토본");
  await snapDialog.getByRole("button", { name: "검토본 저장" }).click();
  await expect(snapDialog.getByTestId("snapshot-item")).toContainText("1장 1차 검토본");
  await expectEvent(page, "snapshot_saved", { role: "editor" });
  await snapDialog.getByRole("button", { name: "닫기" }).click();

  // 12. 디자이너: 디자이너 링크를 같은 브라우저에서 열고 이름을 넣어 들어간다(QA-17)
  await page.goto(designerLink);
  await expect(page.getByTestId("join-role")).toHaveText("디자이너");
  await page.getByLabel("이름").fill("디자이너 C");
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });
  await expect(page.getByTestId("role-badge")).toHaveText("디자이너");
  await expect(page.getByTestId("manuscript")).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("tab", { name: /내 AI 제안/ })).toHaveCount(0);
  await expectEvent(page, "participant_joined", { role: "designer", props: { role: "designer" } });

  // 13. 디자이너: 조판 설정에서 행간을 바꾼다. 지면이 다시 그려지고 원고는 그대로다(QA-18)
  const lineHeight = () => page.getByTestId("page").evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize));
  const textBefore = await page.getByTestId("manuscript").textContent();
  expect(await lineHeight()).toBeCloseTo(1.8, 1);
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  const layout = page.getByTestId("layout-panel");
  await layout.getByRole("slider", { name: "행간" }).focus();
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowRight");
  await expect.poll(lineHeight).toBeCloseTo(2.1, 1);
  await expect(layout.getByTestId("layout-last-change")).toContainText("디자이너 C");
  await expectEvent(page, "layout_changed", { role: "designer", props: { field: "line_height" } });
  expect(await page.getByTestId("manuscript").textContent()).toBe(textBefore);

  // 새로고침해도, 다른 역할로 봐도 바꾼 값이 남는다
  await page.reload();
  await expect.poll(lineHeight).toBeCloseTo(2.1, 1);
  await switchRole(page, "작가");
  await expect.poll(lineHeight).toBeCloseTo(2.1, 1);

  // 끝까지 돈 뒤 /dev/events: 13단계 도달 수가 모두 1, 이탈 0(QA-45). 1·2단계는 같고 5·12단계는 역할로 나뉜다
  await page.goto("/dev/events");
  const rows = page.getByTestId("funnel-row");
  await expect(rows).toHaveCount(13);
  await expect(page.getByTestId("reached")).toHaveText(Array(13).fill("1"));
  await expect(page.getByTestId("dropped")).toHaveText(Array(13).fill("0"));
  await expect(rows.nth(4)).toContainText("participant_joined (author)");
  await expect(rows.nth(11)).toContainText("participant_joined (designer)");

  // S-09: 데모 흐름 내내 남긴 이벤트 어디에도 원고 문장이 없다(원고 글자는 이벤트에 넣지 않아요)
  const all = JSON.stringify(await events(page));
  for (const sentence of ["파리에 도착한지", "오르세 미술관은 기차역을", "루브르 박물관에서는", "다음 날은 비가 왔다"]) {
    expect(all, `이벤트에 원고 문장 '${sentence}'`).not.toContain(sentence);
  }

  expect(errors, "콘솔 오류").toEqual([]);
});
