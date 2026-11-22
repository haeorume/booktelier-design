#!/usr/bin/env node
// 저장소 전체 검사 한 번에. 커밋 전, PR 전, CI에서 같은 것을 돌려요.
//   node scripts/check-all.mjs          # 전부
//   node scripts/check-all.mjs --web    # 웹만(불변 규칙 포함)
//   node scripts/check-all.mjs --api    # 서버만(불변 규칙·계약 포함)
// DB 테스트는 TEST_DATABASE_URL(api/.env 또는 환경 변수)이 있을 때만 돌아요. CI는 늘 돌려요.
// e2e(Playwright)는 오래 걸려서 여기 넣지 않았어요: cd web && npm run test:e2e
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const only = args.includes("--web") ? "web" : args.includes("--api") ? "api" : "all";
const doWeb = only !== "api";
const doApi = only !== "web";

const steps = [["불변 규칙", "node scripts/check-invariants.mjs", root]];
if (doWeb) {
  if (!existsSync(path.join(root, "web", "node_modules"))) {
    console.error("web/node_modules가 없어요. `cd web && npm install`을 먼저 해요.");
    process.exit(1);
  }
  steps.push(
    ["web 린트", "npm run lint --silent", "web"],
    ["web 타입", "npm run typecheck --silent", "web"],
    ["web 단위 테스트", "npm run test --silent", "web"]
  );
}
if (doApi) {
  steps.push(
    ["api 린트", "uv run ruff check .", "api"],
    ["api 포맷", "uv run ruff format --check .", "api"],
    ["api 타입", "uv run mypy app tests", "api"],
    ["api 테스트", "uv run pytest -q", "api"],
    ["계약(R13)", "node scripts/check-contract.mjs", root]
  );
}

const results = [];
for (const [name, cmd, cwd] of steps) {
  process.stdout.write(`▶ ${name} … `);
  const r = spawnSync(cmd, { cwd: path.resolve(root, cwd), shell: true, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0" } });
  const ok = r.status === 0;
  console.log(ok ? "통과" : "실패");
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  if (!ok) console.log(out.split(/\r?\n/).slice(-40).join("\n") + "\n");
  else if (/경고|DB 테스트 .*돌리지 않았어요/.test(out)) console.log(out.split(/\r?\n/).filter((l) => /경고|DB 테스트/.test(l)).join("\n"));
  results.push([name, ok]);
}

const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
console.log(failed.length ? `\n실패: ${failed.join(", ")}` : "\n전체 검사: 통과");
process.exit(failed.length ? 1 : 0);
