// 화면은 이 파일에서만 데이터를 가져다 쓴다(D-07).
// 책·장·참여·링크·검토본은 library(서버 또는 1차 localStorage), 아직 서버에 없는 것은 repo(localStorage).
import { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
import type { ClientIdentityStore, Repository } from "./repository";
import { createClientSession, type ClientSession } from "./session";
import { defaultLocalStorage, defaultSessionStorage } from "./storage";
import type { BookDeps } from "./books";
import { apiBaseUrl, createHttpClient } from "./http";
import { createHttpLibrary, createTokenResolver } from "./http-library";
import { createHttpReview } from "./http-review";
import { createHttpLive, type Live } from "./live";
import { createLocalReview } from "./local-review";
import type { ReviewStore } from "./review-store";
import { getAiProvider } from "@/ai";
import type { Library } from "./library";
import { createLocalLibrary } from "./local-library";
import { createTokenStore } from "./tokens";

export * from "./repository";
export * from "./books";
export * from "./review";
export * from "./studio";
export * from "./library";
export * from "./review-store";
export * from "./live";
export { ApiError, NETWORK } from "./http";
export { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
export { createClientSession, type ClientSession } from "./session";
export { MemoryStorage, type KeyValueStorage } from "./storage";
export { clearInviteToken, readInviteToken, stashInviteToken } from "./tokens";

/**
 * 어디에 저장하나. NEXT_PUBLIC_DATA_SOURCE가 local이면 1차 localStorage(e2e 안전망, D-20),
 * 아니면 NEXT_PUBLIC_API_URL이 있을 때 서버. 둘 다 없으면 local.
 */
export function dataSource(): "server" | "local" {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "local") return "local";
  return apiBaseUrl() ? "server" : "local";
}

let repository: Repository | null = null;
let identity: ClientIdentityStore | null = null;
let session: ClientSession | null = null;
let library: Library | null = null;
let review: ReviewStore | null = null;
let live: Live | null = null;

export function getRepository(): Repository {
  repository ??= createLocalStorageRepository({ storage: defaultLocalStorage() });
  return repository;
}

export function getIdentityStore(): ClientIdentityStore {
  identity ??= createClientIdentityStore({ local: defaultLocalStorage(), session: defaultSessionStorage() });
  return identity;
}

export function getClientSession(): ClientSession {
  session ??= createClientSession(defaultLocalStorage());
  return session;
}

/** 화면 상태를 탭 저장소에 잠시 둘 때(초대 token). */
export function tabStorage() {
  return defaultSessionStorage();
}

export interface AppDeps extends BookDeps {
  library: Library;
  /** AI 제안·의견·수정 제안(F5) */
  review: ReviewStore;
  /** 함께 작업(F4, A-30·31). 서버가 없으면 null(한 브라우저 데모에는 다른 사람이 없다). */
  live: Live | null;
}

/** 화면이 data/ 의 묶음 함수에 넘기는 기본 의존성. */
export function bookDeps(): AppDeps {
  const base: BookDeps = { repo: getRepository(), identity: getIdentityStore(), session: getClientSession() };
  if (dataSource() === "server") {
    const http = createHttpClient();
    const tokens = createTokenStore(defaultLocalStorage());
    library ??= createHttpLibrary({ http, tokens, session: base.session, identity: base.identity });
    review ??= createHttpReview(http, createTokenResolver(tokens, base.session));
    live ??= createHttpLive(http, createTokenResolver(tokens, base.session));
  } else {
    library ??= createLocalLibrary(base);
    review ??= createLocalReview(base, getAiProvider);
  }
  return { ...base, library, review, live: dataSource() === "server" ? live : null };
}
