// 데모 플로우(demo-flow 탭). 만든 단계까지 한 브라우저에서 이어서 누른다. 아직 만들지 않은 단계는 넣지 않는다.
import { expect, test } from "@playwright/test";
import { aiCards, card, expectEvent, LINK, paragraph, typeAtEnd, WORKSPACE } from "./helpers";

test("데모 1~6단계: 책 만들기 → 공유 → 작가 링크로 들어오기 → 지면에서 고치고 AI 제안 적용", async ({ page }) => {
  const title = "파리에서 보낸 한 달";

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
  await expect(page).toHaveURL(WORKSPACE);
  const sheet = page.getByTestId("page");
  await expect(sheet).toHaveAttribute("data-template", "essay");
  const style = await sheet.evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: el.getBoundingClientRect().width, lineHeight: parseFloat(s.lineHeight) / parseFloat(s.fontSize), font: s.fontFamily, padding: s.paddingLeft };
  });
  expect(style.width).toBeCloseTo((130 / 25.4) * 96, 0); // 130mm
  expect(style.lineHeight).toBeCloseTo(1.7, 1);
  expect(style.font).toContain("serif");
  expect(parseFloat(style.padding)).toBeCloseTo((22 / 25.4) * 96, 0); // 22mm
  await expect(sheet.locator("[data-paragraph-id=para_02]")).toContainText("오르세 미술관");
  await expect(page.getByTestId("role-badge")).toHaveText("편집자");
  await expectEvent(page, "project_created", { role: "editor" });
  await expectEvent(page, "template_selected", { props: { template_id: "essay", panel_layout: "single" } });

  // 3. 공유 창에서 작가 링크와 디자이너 링크를 각각 복사한다(QA-08)
  await page.getByRole("button", { name: "공유" }).click();
  const dialog = page.getByRole("dialog", { name: "공유" });
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

  // 5. 이름을 넣고 들어간다. 작가로 열리고 공유가 없다(QA-10)
  const enter = page.getByRole("button", { name: "들어가기" });
  await expect(enter).toBeDisabled();
  await page.getByLabel("이름").fill("작가 A");
  await enter.click();
  await expect(page).toHaveURL(WORKSPACE);
  await expect(page.getByTestId("role-badge")).toHaveText("작가");
  await expect(page.getByRole("button", { name: "공유" })).toHaveCount(0);
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
});
