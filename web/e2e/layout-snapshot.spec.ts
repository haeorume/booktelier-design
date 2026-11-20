// 조판 설정(FR-16), 검토본(FR-38), 오른쪽 패널 두 배치(D-10) — W5.
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { enterAsAuthor, events, expectEvent, paragraph, switchRole, typeAtEnd } from "./helpers";

const lineHeight = (page: Page) =>
  page.getByTestId("page").evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize));
const pageWidthMm = (page: Page) => page.getByTestId("page").evaluate((el) => Math.round((el.getBoundingClientRect().width / 96) * 25.4));

test("하나씩이면 검토 패널과 조판 설정 중 하나만, 나란히면 둘이 함께 열린다(QA-25)", async ({ page }) => {
  await enterAsAuthor(page);
  const review = page.getByRole("complementary", { name: "검토 패널" });
  const layout = page.getByTestId("layout-panel");
  // 처음 값은 하나씩
  await expect(page.getByTestId("dev-bar").getByRole("button", { name: "하나씩" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  await expect(layout).toBeVisible();
  await expect(review).toBeHidden();
  await layout.getByRole("button", { name: "조판 설정 닫기" }).click();
  await expect(review).toBeVisible();

  await page.getByTestId("dev-bar").getByRole("button", { name: "나란히" }).click();
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  await expect(layout).toBeVisible();
  await expect(review).toBeVisible();
});

test("작가는 조판 설정에서 값만 글자로 보고 조절 칸이 없다(QA-21)", async ({ page }) => {
  await enterAsAuthor(page);
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  const layout = page.getByTestId("layout-panel");
  await expect(layout.getByTestId("layout-values")).toContainText("에세이");
  await expect(layout.getByTestId("layout-values")).toContainText("148×210mm");
  await expect(layout.getByTestId("layout-values")).toContainText("아래 22");
  await expect(layout.getByTestId("layout-values")).toContainText("명조 10.5pt");
  await expect(layout.getByRole("slider")).toHaveCount(0);
  await expect(layout.getByRole("combobox")).toHaveCount(0);
  await expect(layout.getByRole("radio")).toHaveCount(0);
});

test("템플릿을 바꾸면 확인 창 뒤 그 템플릿 기본값으로 돌아간다(QA-43)", async ({ page }) => {
  await enterAsAuthor(page);
  await switchRole(page, "편집자");
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  const layout = page.getByTestId("layout-panel");
  // 먼저 여백을 바꿔 둔다
  await layout.getByLabel("위 여백 숫자").fill("15");
  await layout.getByLabel("위 여백 숫자").press("Enter");
  await expect(layout.getByLabel("위 여백 숫자")).toHaveValue("15");

  await layout.getByText("실용서", { exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "템플릿 바꾸기" });
  await expect(confirm).toContainText("조절한 값이 처음 값으로 돌아가요");
  await confirm.getByRole("button", { name: "닫기" }).click(); // 닫으면 그대로
  await expect(page.getByTestId("page")).toHaveAttribute("data-template", "essay");

  await layout.getByText("실용서", { exact: true }).click();
  await page.getByRole("dialog", { name: "템플릿 바꾸기" }).getByRole("button", { name: "바꾸기" }).click();
  await expect(page.getByTestId("page")).toHaveAttribute("data-template", "practical");
  await expect(layout.getByLabel("위 여백 숫자")).toHaveValue("20");
  await expect(layout.getByLabel("안쪽 여백 숫자")).toHaveValue("18");
  await expect(layout.getByRole("combobox", { name: "판형" })).toHaveValue("152x225");
  await expect.poll(() => pageWidthMm(page)).toBe(152);
  await expect.poll(() => lineHeight(page)).toBeCloseTo(1.65, 1);
  await expectEvent(page, "layout_changed", { role: "editor", props: { field: "template", before: "essay", after: "practical", reset_to_default: true } });
});

test("디자이너가 바꾼 뒤 편집자로 열면 마지막에 바꾼 사람과 시각이 보인다(QA-44)", async ({ page }) => {
  await enterAsAuthor(page);
  await switchRole(page, "디자이너", "디자이너 C");
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  await page.getByTestId("layout-panel").getByRole("combobox", { name: "판형" }).selectOption("152x225");
  await expect.poll(() => pageWidthMm(page)).toBe(152);
  // 역할을 바꿔도 열어 둔 조판 설정은 그대로 열려 있다.
  await switchRole(page, "편집자");
  await expect(page.getByTestId("layout-panel")).toBeVisible();
  await expect(page.getByTestId("layout-last-change")).toHaveText("디자이너 C · 방금 바꿈");
});

test("슬라이더를 끄는 동안은 미리 보기만, 손을 뗄 때 한 번 저장한다(정할 것 15)", async ({ page }) => {
  await enterAsAuthor(page);
  await switchRole(page, "디자이너", "디자이너 C");
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  const slider = page.getByTestId("layout-panel").getByRole("slider", { name: "위 여백" });
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 5; i += 1) await page.mouse.move(box.x + (box.width * i) / 6, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(async () => (await events(page)).filter((e) => e.name === "layout_changed").length).toBe(1);
  const changed = (await events(page)).find((e) => e.name === "layout_changed")!;
  expect(changed.props).toMatchObject({ field: "margin_top", before: 20 });
});

test("Home·End·PageUp·PageDown으로 바꾼 값도 저장된다(FR-16 ②)", async ({ page }) => {
  await enterAsAuthor(page);
  await switchRole(page, "디자이너", "디자이너 C");
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  const layout = page.getByTestId("layout-panel");
  await layout.getByRole("slider", { name: "행간" }).focus();
  await page.keyboard.press("End");
  await expect.poll(() => lineHeight(page)).toBeCloseTo(2.2, 1);
  await layout.getByRole("slider", { name: "위 여백" }).focus();
  await page.keyboard.press("Home");
  await expect(layout.getByLabel("위 여백 숫자")).toHaveValue("10");
  await expectEvent(page, "layout_changed", { props: { field: "line_height", after: 2.2 } });
  await expectEvent(page, "layout_changed", { props: { field: "margin_top", after: 10 } });

  await page.reload();
  await expect.poll(() => lineHeight(page)).toBeCloseTo(2.2, 1);
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  await expect(page.getByTestId("layout-panel").getByLabel("위 여백 숫자")).toHaveValue("10");
});

test("검토본은 편집자만 저장하고, 모두 목록을 열어 읽기 전용으로 본다(FR-38)", async ({ page }) => {
  await enterAsAuthor(page);
  await typeAtEnd(page, "para_04", " 첫 판.");
  await switchRole(page, "편집자");
  await page.getByRole("button", { name: "검토본" }).click();
  const dialog = page.getByRole("dialog", { name: "검토본" });
  await expect(dialog).toContainText("아직 저장한 검토본이 없어요");
  await dialog.getByLabel("검토본 이름").fill("첫 판");
  await dialog.getByRole("button", { name: "검토본 저장" }).click();
  await expect(dialog.getByTestId("snapshot-item")).toHaveCount(1);
  await dialog.getByRole("button", { name: "닫기" }).click();

  // 작가가 그 뒤에 더 고쳐도 검토본은 저장한 때의 원고다
  await switchRole(page, "작가");
  await typeAtEnd(page, "para_04", " 둘째 판.");
  await expect(paragraph(page, "para_04")).toContainText("둘째 판.");
  await page.getByRole("button", { name: "검토본" }).click();
  const authorView = page.getByRole("dialog", { name: "검토본" });
  await expect(authorView.getByRole("button", { name: "검토본 저장" })).toHaveCount(0);
  await authorView.getByTestId("snapshot-item").click();
  const preview = page.getByTestId("snapshot-preview");
  await expect(preview).toContainText("첫 판.");
  await expect(preview).not.toContainText("둘째 판.");
  await expect(preview.locator("[contenteditable]")).toHaveCount(0);
});

test("1440px에서 '나란히'로 연 화면을 캡처한다(QA-26, 사람이 판단)", async ({ page }) => {
  await enterAsAuthor(page);
  await typeAtEnd(page, "para_02", " 오래도록.");
  await expect(page.getByTestId("ai-card")).toHaveCount(2);
  await switchRole(page, "디자이너", "디자이너 C");
  await switchRole(page, "작가");
  await page.getByTestId("dev-bar").getByRole("button", { name: "나란히" }).click();
  await page.getByRole("button", { name: "조판 설정", exact: true }).click();
  await expect(page.getByTestId("layout-panel")).toBeVisible();
  const deskWidth = await page.locator("[data-testid=page]").evaluate((el) => el.parentElement!.getBoundingClientRect().width);
  const file = path.join(os.tmpdir(), "booktelier-qa26-split-1440.png");
  await page.screenshot({ path: file, fullPage: false });
  test.info().annotations.push({ type: "QA-26", description: `${file} (지면 영역 폭 ${Math.round(deskWidth)}px)` });
  console.log(`QA-26 screenshot: ${file} desk=${Math.round(deskWidth)}px`);
});
