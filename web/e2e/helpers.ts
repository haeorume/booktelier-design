import { expect, type Page } from "@playwright/test";

export interface StoredEvent {
  name: string;
  role: string | null;
  project_id: string | null;
  participant_id: string | null;
  path: string;
  props: Record<string, unknown>;
}

/** 브라우저에 남은 이벤트(1차는 localStorage, D-08). */
export async function events(page: Page): Promise<StoredEvent[]> {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("booktelier:events") ?? "[]"));
}

export async function expectEvent(page: Page, name: string, match: Partial<StoredEvent> & { props?: Record<string, unknown> } = {}) {
  await expect
    .poll(async () => (await events(page)).filter((e) => e.name === name && matches(e, match)).length, { message: `이벤트 ${name}` })
    .toBeGreaterThan(0);
}

function matches(e: StoredEvent, m: Partial<StoredEvent> & { props?: Record<string, unknown> }): boolean {
  const { props, ...rest } = m;
  for (const [k, v] of Object.entries(rest)) if ((e as unknown as Record<string, unknown>)[k] !== v) return false;
  if (props) for (const [k, v] of Object.entries(props)) if (e.props[k] !== v) return false;
  return true;
}

/** 개발 서버가 작업 공간을 처음 컴파일할 때 화면 이동이 느릴 수 있다. 이 기다림만 길게 둔다. */
export const NAVIGATE_MS = 30_000;

const WORKSPACE = /\/p\/[0-9a-f-]{36}\/c\/[0-9a-f-]{36}$/;
export const LINK = /\/j\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 데모 1~3단계: 책을 만들고 공유 창에서 두 링크를 복사한다. */
export async function createBookAndCopyLinks(page: Page, title = "파리에서 보낸 한 달") {
  await page.goto("/");
  const create = page.getByRole("button", { name: "만들기" });
  await expect(create).toBeDisabled();
  await page.getByLabel("책 제목").fill(title);
  // 화면이 준비(hydration)돼야 버튼이 켜진다. 켜진 것을 본 뒤에 누른다.
  await expect(create).toBeEnabled();
  await page.getByText("에세이", { exact: true }).click();
  await create.click();
  await expect(page).toHaveURL(WORKSPACE, { timeout: NAVIGATE_MS });

  await page.getByRole("button", { name: "공유" }).click();
  const dialog = page.getByRole("dialog", { name: "공유" });
  await dialog.getByTestId("share-author").getByRole("button", { name: "링크 복사" }).click();
  const authorLink = await page.evaluate(() => navigator.clipboard.readText());
  await dialog.getByTestId("share-designer").getByRole("button", { name: "링크 복사" }).click();
  const designerLink = await page.evaluate(() => navigator.clipboard.readText());
  await dialog.getByRole("button", { name: "닫기" }).click();
  return { workspaceUrl: page.url(), authorLink, designerLink };
}

/** 데모 1~5단계를 지나 작가로 작업 공간에 들어온 상태를 만든다. */
export async function enterAsAuthor(page: Page) {
  const links = await createBookAndCopyLinks(page);
  await page.goto(links.authorLink);
  await page.getByLabel("이름").fill("작가 A");
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page.getByTestId("role-badge")).toHaveText("작가");
  return links;
}

export function paragraph(page: Page, id: string) {
  return page.getByTestId("manuscript").locator(`p[data-paragraph-id="${id}"]`);
}

/** 문단 끝에 글을 더한다(작가가 지면에서 고치기). */
export async function typeAtEnd(page: Page, id: string, text: string) {
  const p = paragraph(page, id);
  await p.click();
  // End 키는 화면에 보이는 줄의 끝으로 간다. 문단 끝에 커서를 직접 둔다.
  await p.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.type(text);
}

export function aiCards(page: Page) {
  return page.getByTestId("ai-card");
}

export function card(page: Page, original: string) {
  return aiCards(page).filter({ has: page.locator("del", { hasText: original }) });
}

/** 지면의 한 문단에서 글자를 고른다(읽기 전용 지면에서도). start·end는 문단 글자 위치. */
export async function selectText(page: Page, id: string, start: number, end: number) {
  await paragraph(page, id).evaluate(
    (el, [s, e]) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) {
        const n = walker.currentNode as Text;
        if (!n.parentElement?.closest(".edit-insert")) nodes.push(n);
      }
      const at = (offset: number): [Text, number] => {
        let left = offset;
        for (const n of nodes) {
          if (left <= n.length) return [n, left];
          left -= n.length;
        }
        const last = nodes[nodes.length - 1];
        return [last, last.length];
      };
      const range = document.createRange();
      range.setStart(...at(s));
      range.setEnd(...at(e));
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    },
    [start, end] as const,
  );
}

export async function switchRole(page: Page, role: "편집자" | "작가" | "디자이너", name?: string) {
  await page.getByTestId("dev-bar").getByRole("button", { name: role }).click();
  if (name) {
    const ask = page.getByRole("dialog", { name: "이름 넣기" });
    await ask.getByLabel("이름").fill(name);
    await ask.getByRole("button", { name: "들어가기" }).click();
  }
  await expect(page.getByTestId("role-badge")).toHaveText(role);
}

export { WORKSPACE };
