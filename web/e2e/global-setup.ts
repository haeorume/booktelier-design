// 개발 서버는 주소를 처음 열 때 컴파일한다. 테스트가 컴파일을 기다리다 시간을 넘기지 않게 주요 화면을 미리 한 번 연다.
import type { FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  const id = "00000000-0000-4000-8000-000000000000";
  for (const path of ["/", "/home", `/j/${id}`, `/p/${id}/c/${id}`]) {
    try {
      await fetch(new URL(path, base));
    } catch {
      // 미리 열기는 도움일 뿐이다. 실패해도 테스트는 그대로 돈다.
    }
  }
}
