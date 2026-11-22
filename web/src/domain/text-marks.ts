/** 작가가 원고에 넣는 글자 강조(FR-51). 서버 TextMark.type과 편집기 마크 이름이 같아요. */
export const EMPHASIS_MARKS = ["bold", "italic", "underline"] as const;
export type EmphasisMark = (typeof EMPHASIS_MARKS)[number];

export function isEmphasisMark(kind: string): kind is EmphasisMark {
  return (EMPHASIS_MARKS as readonly string[]).includes(kind);
}

export function wrapEmphasisHtml(html: string, kinds: readonly string[]): string {
  let out = html;
  for (const kind of ["italic", "underline", "bold"] as const) {
    if (!kinds.includes(kind)) continue;
    switch (kind) {
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      default: {
        const neverKind: never = kind;
        return neverKind;
      }
    }
  }
  return out;
}
