import { describe, expect, it, vi } from "vitest";
import { ApiError, createHttpClient, NETWORK, type Fetch } from "./http";
import { createHttpLibrary } from "./http-library";
import { VersionConflictError } from "./library";
import { createClientIdentityStore } from "./local-storage-repository";
import { createClientSession } from "./session";
import { MemoryStorage } from "./storage";
import { createTokenStore } from "./tokens";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("HTTP 클라이언트(C-1, C-3)", () => {
  it("토큰을 Bearer로 싣고 본문을 JSON으로 보낸다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(200, { ok: true }));
    const http = createHttpClient({ baseUrl: "http://api", fetchFn });
    await http.request("PUT", "/x", { token: "t-1", body: { a: 1 } });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://api/x");
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer t-1" });
    expect(init.body).toBe('{"a":1}');
  });

  it("오류 { code, message }를 ApiError로 바꾼다", async () => {
    const http = createHttpClient({ baseUrl: "", fetchFn: vi.fn().mockResolvedValue(json(403, { code: "forbidden", message: "안 돼요" })) });
    await expect(http.request("GET", "/x")).rejects.toMatchObject({ status: 403, code: "forbidden", message: "안 돼요" });
  });

  it("서버에 닿지 못하면 code=network(연결 끊김, L-42)", async () => {
    const http = createHttpClient({ baseUrl: "", fetchFn: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    const err = await http.request("GET", "/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(NETWORK);
  });
});

describe("서버 구현의 원고 저장(C-4, D-30)", () => {
  function library(fetchFn: ReturnType<typeof vi.fn<Fetch>>) {
    const local = new MemoryStorage();
    const session = createClientSession(local);
    const tokens = createTokenStore(local);
    tokens.save({ participant_id: "p-1", project_id: "book", role: "author", token: "secret" });
    session.setCurrentParticipantId("book", "p-1");
    return createHttpLibrary({
      http: createHttpClient({ baseUrl: "", fetchFn }),
      tokens,
      session,
      identity: createClientIdentityStore({ local, session: new MemoryStorage() }),
    });
  }

  it("base_version을 보내고, 409면 최신 장을 담은 VersionConflictError", async () => {
    const latest = { id: "c", project_id: "book", order: 1, title: "1장", status: "editing", version: 5, status_changed_at: null, updated_at: "t", doc: { type: "doc", content: [] } };
    const fetchFn = vi.fn<Fetch>().mockResolvedValue(json(409, { code: "version_conflict", message: "바뀌었어요", latest }));
    const err = await library(fetchFn)
      .saveChapterDoc("book", "c", { type: "doc", content: [] }, 3)
      .catch((e: unknown) => e);
    const init = fetchFn.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(JSON.parse(String(init.body))).toMatchObject({ base_version: 3 });
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).latest.version).toBe(5);
  });

  it("다른 책은 토큰이 없어 서버를 부르지 않고 null", async () => {
    const fetchFn = vi.fn<Fetch>();
    expect(await library(fetchFn).getProject("other")).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
