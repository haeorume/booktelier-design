import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { describe, expect, it } from "vitest";
import { ParagraphWithId } from "./paragraph-id";
import { paragraphPositions } from "./underline-plugin";
import { selectionToAnchor } from "./selection";
import manuscript from "@/fixtures/manuscript.json";

const schema = getSchema([Document, ParagraphWithId, Text]);
const doc = schema.nodeFromJSON(manuscript.chapter.doc);
const pos = paragraphPositions(doc);
const at = (id: string, offset: number) => pos.get(id)!.pos + 1 + offset;

describe("selectionToAnchor", () => {
  it("한 문단 안에서 고른 글자를 문단 id + 글자 위치로 바꾼다", () => {
    expect(selectionToAnchor(doc, at("para_03", 21), at("para_03", 26))).toEqual({
      anchor: { paragraph_id: "para_03", start: 21, end: 26 },
      text: "모나리자를",
    });
  });

  it("거꾸로 골라도 같다", () => {
    expect(selectionToAnchor(doc, at("para_01", 9), at("para_01", 4))?.text).toBe("도착한지 ");
  });

  it("두 문단에 걸치면 받지 않는다", () => {
    expect(selectionToAnchor(doc, at("para_01", 2), at("para_02", 3))).toBeNull();
  });

  it("아무것도 고르지 않았거나 빈칸만 고르면 받지 않는다", () => {
    expect(selectionToAnchor(doc, at("para_01", 2), at("para_01", 2))).toBeNull();
    expect(selectionToAnchor(doc, at("para_01", 8), at("para_01", 9))).toBeNull();
  });
});
