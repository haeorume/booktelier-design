import { describe, expect, it } from "vitest";
import { createDemoProvider } from "@/ai/demo-provider";
import { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
import { createLocalReview } from "./local-review";
import { createClientSession } from "./session";
import { MemoryStorage } from "./storage";

function setup() {
  const local = new MemoryStorage();
  const deps = {
    repo: createLocalStorageRepository({ storage: local }),
    identity: createClientIdentityStore({ local, session: new MemoryStorage() }),
    session: createClientSession(local),
  };
  const provider = createDemoProvider({ delayMs: 0 });
  return { deps, review: createLocalReview(deps, () => provider) };
}

describe("1차 구현의 읽음 기록(FR-02 ②)", () => {
  it("편집자가 연 의견만 남기고, 작가가 열어도 편집자의 확인할 일은 그대로다", async () => {
    const { deps, review } = setup();
    const ctx = (role: "editor" | "author") => ({ projectId: "book", chapterId: "ch", viewer: { participant_id: role, role } });
    await review.markSeen(ctx("author"), { type: "comment", id: "c1" });
    expect(deps.session.getSeenComments("book").has("c1")).toBe(false);
    await review.markSeen(ctx("editor"), { type: "comment", id: "c1" });
    expect(deps.session.getSeenComments("book").has("c1")).toBe(true);
  });
});
