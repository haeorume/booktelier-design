import { Mark, mergeAttributes } from "@tiptap/core";
import { EMPHASIS_MARKS, type EmphasisMark } from "@/domain/text-marks";

function emphasisMark(name: EmphasisMark, tag: "strong" | "em" | "u", shortcut: string) {
  return Mark.create({
    name,
    parseHTML() {
      return [{ tag }];
    },
    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(HTMLAttributes), 0];
    },
    addKeyboardShortcuts() {
      return {
        [shortcut]: () => this.editor.commands.toggleMark(this.name),
      };
    },
  });
}

export const BoldMark = emphasisMark("bold", "strong", "Mod-b");
export const ItalicMark = emphasisMark("italic", "em", "Mod-i");
export const UnderlineMark = emphasisMark("underline", "u", "Mod-u");

export const EMPHASIS_EXTENSIONS = [BoldMark, ItalicMark, UnderlineMark];

export const EMPTY_EMPHASIS: Record<EmphasisMark, boolean> = { bold: false, italic: false, underline: false };

export function readEmphasis(isActive: (name: string) => boolean): Record<EmphasisMark, boolean> {
  return Object.fromEntries(EMPHASIS_MARKS.map((name) => [name, isActive(name)])) as Record<EmphasisMark, boolean>;
}
