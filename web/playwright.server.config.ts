import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// 서버로 도는 e2e(F2·F3). api(uvicorn)와 web(next dev)을 따로 띄운다. DB는 api/.env의 DATABASE_URL(내 dev 브랜치).
// 평소 검사(check-all, CI)에는 넣지 않는다. CI에 api·DB를 붙이는 것은 F4(두 브라우저 e2e)에서 사람이 한다.
// 돌리기 전에 켜 둔 `npm run dev`를 끈다(같은 폴더에 next dev가 둘이면 막힌다).
const WEB = 3100;
const API = 8100;
const webURL = `http://localhost:${WEB}`;
const apiURL = `http://localhost:${API}`;

export default defineConfig({
  testDir: "./e2e-server",
  outputDir: path.join(os.tmpdir(), "booktelier-playwright-server"),
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  timeout: 180_000,
  use: {
    baseURL: webURL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `uv run uvicorn app.main:app --port ${API}`,
      cwd: path.join(__dirname, "..", "api"),
      env: { CORS_ORIGINS: webURL, WEB_URL: webURL, AI_PROVIDER: "demo" },
      url: `${apiURL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next dev --port ${WEB}`,
      env: { NEXT_PUBLIC_API_URL: apiURL, NEXT_PUBLIC_DATA_SOURCE: "server" },
      url: webURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
