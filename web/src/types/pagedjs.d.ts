// Paged.js 0.4.3에는 타입 파일이 없어 미리보기(D-34)에서 쓰는 만큼만 적어요.
declare module "pagedjs" {
  export class Previewer {
    constructor(options?: Record<string, unknown>);
    polisher: { styleEl?: HTMLStyleElement };
    preview(content: Node, stylesheets: (string | Record<string, string>)[], renderTo: HTMLElement): Promise<{ total: number }>;
  }
}
