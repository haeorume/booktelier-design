import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // 테스트 결과(trace 등)는 web/ 밖에 쓴다. web/ 안에 쓰면 개발 서버가 파일이 바뀐 줄 알고 다시 빌드해서
  // 그사이 다른 테스트의 화면 이동이 멈춘다(W4에서 '만들기' 뒤 작업 공간으로 못 가던 원인).
  outputDir: path.join(os.tmpdir(), "booktelier-playwright"),
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  // 개발 서버는 주소를 처음 열 때 컴파일한다. 처음 여는 화면은 5초를 넘길 수 있다.
  expect: { timeout: 15_000 },
  // 데모 플로우는 13단계를 한 테스트로 이어서 누른다. 기본 30초로는 모자란다.
  timeout: 120_000,
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    // 1차 e2e는 서버 없이 브라우저 저장 구현으로 돈다(안전망, D-20). 서버로 도는 e2e는 F4에서 따로 붙인다.
    env: { NEXT_PUBLIC_DATA_SOURCE: "local" },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
