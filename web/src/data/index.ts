// 화면은 이 파일에서만 데이터를 가져다 쓴다(D-07).
import { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
import type { ClientIdentityStore, Repository } from "./repository";
import { createClientSession, type ClientSession } from "./session";
import { defaultLocalStorage, defaultSessionStorage } from "./storage";
import type { BookDeps } from "./books";

export * from "./repository";
export * from "./books";
export * from "./review";
export { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
export { createClientSession, type ClientSession } from "./session";
export { MemoryStorage, type KeyValueStorage } from "./storage";

let repository: Repository | null = null;
let identity: ClientIdentityStore | null = null;
let session: ClientSession | null = null;

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

/** 화면이 data/ 의 묶음 함수(createBook 등)에 넘기는 기본 의존성. */
export function bookDeps(): BookDeps {
  return { repo: getRepository(), identity: getIdentityStore(), session: getClientSession() };
}
