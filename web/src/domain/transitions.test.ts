import { describe, expect, it } from "vitest";
import {
  AI_SUGGESTION_ACTIONS,
  CHAPTER_ACTIONS,
  SUGGESTED_EDIT_ACTIONS,
  TransitionError,
  nextAiSuggestionStatus,
  nextChapterStatus,
  nextSuggestedEditStatus,
  transitionAiSuggestion,
  transitionChapter,
  transitionSuggestedEdit,
} from "./transitions";
import { AI_SUGGESTION_STATUSES, CHAPTER_STATUSES, SUGGESTED_EDIT_STATUSES, parseLiveCheckResult } from "@/types";
import type { AiSuggestionStatus, Chapter, SuggestedEdit } from "@/types";
import liveCheck from "@/fixtures/live_check.json";

const suggestion = parseLiveCheckResult(liveCheck).suggestions[0];

describe("AI 제안 상태 전이", () => {
  const allowed: [AiSuggestionStatus, (typeof AI_SUGGESTION_ACTIONS)[number], AiSuggestionStatus][] = [
    ["pending", "apply", "applied"],
    ["pending", "dismiss", "dismissed"],
    ["pending", "send", "sent"],
    ["pending", "keep", "stale"],
    ["pending", "invalidate", "stale"],
    ["applied", "undo_apply", "pending"],
    ["sent", "merge", "merged"],
  ];

  it.each(allowed)("%s 에서 %s → %s", (from, action, to) => {
    expect(nextAiSuggestionStatus(from, action)).toBe(to);
  });

  it("표에 없는 전이는 모두 막는다", () => {
    const ok = new Set(allowed.map(([f, a]) => `${f}:${a}`));
    for (const from of AI_SUGGESTION_STATUSES) {
      for (const action of AI_SUGGESTION_ACTIONS) {
        if (ok.has(`${from}:${action}`)) continue;
        expect(nextAiSuggestionStatus(from, action), `${from}:${action}`).toBeNull();
      }
    }
  });

  it("적용 → 실행 취소 → 다시 대기로 뜬다(FR-27 ③)", () => {
    const applied = transitionAiSuggestion(suggestion, "apply");
    expect(applied.status).toBe("applied");
    expect(transitionAiSuggestion(applied, "undo_apply").status).toBe("pending");
  });

  it("보낸 제안은 다시 보낼 수 없다(FR-29 ③)", () => {
    const sent = transitionAiSuggestion(suggestion, "send");
    expect(() => transitionAiSuggestion(sent, "send")).toThrow(TransitionError);
  });

  it("원래 객체를 바꾸지 않는다", () => {
    transitionAiSuggestion(suggestion, "dismiss");
    expect(suggestion.status).toBe("pending");
  });
});

describe("장 상태 전이", () => {
  const chapter = { status: "editing" } as Chapter;

  it("수정 중 → 검토 요청 → 검토 완료", () => {
    const requested = transitionChapter(chapter, "request_review");
    expect(requested.status).toBe("review_requested");
    expect(transitionChapter(requested, "complete_review").status).toBe("reviewed");
  });

  it("검토 요청 없이 검토 완료할 수 없다", () => {
    expect(() => transitionChapter(chapter, "complete_review")).toThrow(TransitionError);
  });

  it("검토 완료인 장에서도 다시 검토를 요청할 수 있다(FR-13 ①)", () => {
    const reviewed = { status: "reviewed" } as Chapter;
    expect(transitionChapter(reviewed, "request_review").status).toBe("review_requested");
  });

  it("검토 요청 중인 장에서는 다시 요청할 수 없다(FR-13 ①)", () => {
    expect(nextChapterStatus("review_requested", "request_review")).toBeNull();
  });

  it("그 밖의 전이는 막는다", () => {
    const ok = new Set(["editing:request_review", "review_requested:complete_review", "reviewed:request_review"]);
    for (const from of CHAPTER_STATUSES) {
      for (const action of CHAPTER_ACTIONS) {
        if (!ok.has(`${from}:${action}`)) expect(nextChapterStatus(from, action)).toBeNull();
      }
    }
  });
});

describe("수정 제안 상태 전이", () => {
  const edit = { status: "pending" } as SuggestedEdit;

  it("대기 → 수락됨 / 거절됨", () => {
    expect(transitionSuggestedEdit(edit, "accept").status).toBe("accepted");
    expect(transitionSuggestedEdit(edit, "reject").status).toBe("rejected");
  });

  it("처리한 수정 제안은 다시 처리할 수 없다", () => {
    for (const from of SUGGESTED_EDIT_STATUSES.filter((s) => s !== "pending")) {
      for (const action of SUGGESTED_EDIT_ACTIONS) expect(nextSuggestedEditStatus(from, action)).toBeNull();
    }
  });
});
