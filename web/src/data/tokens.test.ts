import { describe, expect, it } from "vitest";
import { MemoryStorage } from "./storage";
import { clearInviteToken, createTokenStore, readInviteToken, stashInviteToken } from "./tokens";

describe("토큰 저장(D-27)", () => {
  it("참여자마다 하나, 책으로 찾고 편집자 토큰만 모은다(A-03)", () => {
    const tokens = createTokenStore(new MemoryStorage());
    tokens.save({ participant_id: "e1", project_id: "b1", role: "editor", token: "te1" });
    tokens.save({ participant_id: "a1", project_id: "b1", role: "author", token: "ta1" });
    tokens.save({ participant_id: "e2", project_id: "b2", role: "editor", token: "te2" });
    expect(tokens.forProject("b1").map((e) => e.participant_id).sort()).toEqual(["a1", "e1"]);
    expect(tokens.editorTokens().sort()).toEqual(["te1", "te2"]);
    // 같은 참여자로 다시 들어오면 새 토큰으로 바뀐다(A-06 재방문)
    tokens.save({ participant_id: "a1", project_id: "b1", role: "author", token: "ta1-new" });
    expect(tokens.get("a1")?.token).toBe("ta1-new");
    tokens.remove("a1");
    expect(tokens.get("a1")).toBeNull();
  });

  it("깨진 값이 있어도 빈 것으로 읽는다", () => {
    const storage = new MemoryStorage();
    storage.setItem("booktelier:tokens", "{not json");
    expect(createTokenStore(storage).editorTokens()).toEqual([]);
  });

  it("주소에서 지운 초대 token은 탭 저장소에 잠시 둔다", () => {
    const tab = new MemoryStorage();
    stashInviteToken(tab, "inv");
    expect(readInviteToken(tab)).toBe("inv");
    clearInviteToken(tab);
    expect(readInviteToken(tab)).toBeNull();
  });
});
