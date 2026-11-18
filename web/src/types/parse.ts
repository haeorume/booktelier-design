// 예시 JSON(나중에는 서버 응답)을 타입으로 읽어 들이는 곳. 확정 값이 아니면 여기서 멈춘다.
import type { AiSuggestion, Anchor, ChapterDoc, ChapterReviewResult, LiveCheckResult, ParagraphNode } from "./entities";
import {
  AI_SUGGESTION_KINDS,
  AI_SUGGESTION_SOURCES,
  AI_SUGGESTION_STATUSES,
  ROLES,
  isOneOf,
} from "./status";

export class ContractError extends Error {
  constructor(where: string, detail: string) {
    super(`data-contract와 다른 값이에요 (${where}): ${detail}`);
    this.name = "ContractError";
  }
}

type Obj = Record<string, unknown>;

function obj(v: unknown, where: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new ContractError(where, "객체가 아니에요");
  return v as Obj;
}
function str(o: Obj, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new ContractError(`${where}.${key}`, "문자열이 아니에요");
  return v;
}
function int(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new ContractError(`${where}.${key}`, "0 이상의 정수가 아니에요");
  return v;
}
function oneOf<T extends string>(values: readonly T[], o: Obj, key: string, where: string): T {
  const v = o[key];
  if (!isOneOf(values, v)) throw new ContractError(`${where}.${key}`, `${JSON.stringify(v)}는 ${values.join(" · ")} 중 하나가 아니에요`);
  return v;
}

export function parseAnchor(raw: unknown, where = "anchor"): Anchor {
  const o = obj(raw, where);
  const start = int(o, "start", where);
  const end = int(o, "end", where);
  if (end <= start) throw new ContractError(where, "end가 start보다 커야 해요");
  return { paragraph_id: str(o, "paragraph_id", where), start, end };
}

export function parseAiSuggestion(raw: unknown, where = "ai_suggestion"): AiSuggestion {
  const o = obj(raw, where);
  const alternatives = o.alternatives;
  if (!Array.isArray(alternatives) || alternatives.some((a) => typeof a !== "string")) {
    throw new ContractError(`${where}.alternatives`, "문자열 배열이 아니에요");
  }
  if (alternatives.length > 2) throw new ContractError(`${where}.alternatives`, "대안은 최대 2개예요");
  return {
    id: str(o, "id", where),
    chapter_id: str(o, "chapter_id", where),
    anchor: parseAnchor(o.anchor, `${where}.anchor`),
    original: str(o, "original", where),
    replacement: str(o, "replacement", where),
    alternatives: alternatives as string[],
    kind: oneOf(AI_SUGGESTION_KINDS, o, "kind", where),
    reason: str(o, "reason", where),
    source: oneOf(AI_SUGGESTION_SOURCES, o, "source", where),
    target_role: oneOf(ROLES, o, "target_role", where),
    base_version: int(o, "base_version", where),
    created_at: str(o, "created_at", where),
    status: oneOf(AI_SUGGESTION_STATUSES, o, "status", where),
    owner_participant_id: str(o, "owner_participant_id", where),
  };
}

function suggestions(o: Obj, where: string): AiSuggestion[] {
  if (!Array.isArray(o.suggestions)) throw new ContractError(`${where}.suggestions`, "배열이 아니에요");
  return o.suggestions.map((s, i) => parseAiSuggestion(s, `${where}.suggestions[${i}]`));
}

export function parseLiveCheckResult(raw: unknown): LiveCheckResult {
  const where = "live_check";
  const o = obj(raw, where);
  if (o.source !== "live_check") throw new ContractError(`${where}.source`, "live_check가 아니에요");
  return {
    source: "live_check",
    chapter_id: str(o, "chapter_id", where),
    paragraph_id: str(o, "paragraph_id", where),
    base_version: int(o, "base_version", where),
    suggestions: suggestions(o, where),
  };
}

export function parseChapterReviewResult(raw: unknown): ChapterReviewResult {
  const where = "chapter_review";
  const o = obj(raw, where);
  if (o.source !== "chapter_review") throw new ContractError(`${where}.source`, "chapter_review가 아니에요");
  const s = obj(o.summary, `${where}.summary`);
  const summary = Object.fromEntries(AI_SUGGESTION_KINDS.map((k) => [k, int(s, k, `${where}.summary`)])) as ChapterReviewResult["summary"];
  for (const k of Object.keys(s)) {
    if (!isOneOf(AI_SUGGESTION_KINDS, k)) throw new ContractError(`${where}.summary`, `${k}는 종류가 아니에요`);
  }
  return {
    source: "chapter_review",
    chapter_id: str(o, "chapter_id", where),
    base_version: int(o, "base_version", where),
    summary,
    suggestions: suggestions(o, where),
  };
}

export function parseChapterDoc(raw: unknown, where = "doc"): ChapterDoc {
  const o = obj(raw, where);
  if (o.type !== "doc" || !Array.isArray(o.content)) throw new ContractError(where, "doc 문서가 아니에요");
  const content: ParagraphNode[] = o.content.map((p, i) => {
    const pw = `${where}.content[${i}]`;
    const po = obj(p, pw);
    if (po.type !== "paragraph") throw new ContractError(pw, "문단이 아니에요");
    const id = str(obj(po.attrs, `${pw}.attrs`), "id", `${pw}.attrs`);
    const texts = po.content === undefined ? [] : po.content;
    if (!Array.isArray(texts)) throw new ContractError(`${pw}.content`, "배열이 아니에요");
    return {
      type: "paragraph",
      attrs: { id },
      content: texts.map((t, j) => {
        const to = obj(t, `${pw}.content[${j}]`);
        if (to.type !== "text") throw new ContractError(`${pw}.content[${j}]`, "글자 노드가 아니에요");
        return { type: "text" as const, text: str(to, "text", `${pw}.content[${j}]`) };
      }),
    };
  });
  return { type: "doc", content };
}
