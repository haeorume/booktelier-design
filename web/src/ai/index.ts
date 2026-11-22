import { createDemoProvider } from "./demo-provider";
import type { AiProvider } from "./provider";

export * from "./provider";
export { createDemoProvider } from "./demo-provider";

let provider: AiProvider | null = null;

/** 화면이 쓰는 AI 제공자. 1차는 늘 데모 제공자(D-06). */
export function getAiProvider(): AiProvider {
  provider ??= createDemoProvider();
  return provider;
}
