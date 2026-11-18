// 화면은 이 파일에서만 데이터를 가져다 쓴다(D-07).
import { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
import type { ClientIdentityStore, Repository } from "./repository";
import { defaultLocalStorage, defaultSessionStorage } from "./storage";

export * from "./repository";
export { createClientIdentityStore, createLocalStorageRepository } from "./local-storage-repository";
export { MemoryStorage, type KeyValueStorage } from "./storage";

let repository: Repository | null = null;
let identity: ClientIdentityStore | null = null;

export function getRepository(): Repository {
  repository ??= createLocalStorageRepository({ storage: defaultLocalStorage() });
  return repository;
}

export function getIdentityStore(): ClientIdentityStore {
  identity ??= createClientIdentityStore({ local: defaultLocalStorage(), session: defaultSessionStorage() });
  return identity;
}
