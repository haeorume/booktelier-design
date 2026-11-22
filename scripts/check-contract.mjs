#!/usr/bin/env node
// 불변 규칙 R13: 계약 파일이 서버 코드와 맞는지.
//   1) api/openapi.json 이 지금 FastAPI 코드에서 나온 것과 같은가
//   2) web/src/types/api.ts 가 그 openapi.json 에서 만든 것과 같은가(손으로 고치지 않았나)
// 다르면: cd api && uv run python scripts/dump_openapi.py → cd web && npm run gen:api → 둘 다 커밋.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.join(root, "api");
const web = path.join(root, "web");
const FIX = "고치는 법: `cd api && uv run python scripts/dump_openapi.py` 뒤 `cd web && npm run gen:api`, 바뀐 두 파일을 같이 커밋해요.";
const fail = (msg) => {
  console.error(`[R13] 계약 파일이 어긋나요\n  ${msg}\n  ${FIX}`);
  process.exit(1);
};

const dump = spawnSync("uv run python scripts/dump_openapi.py --check", { cwd: api, shell: true, encoding: "utf8" });
if (dump.error || dump.status === 127 || /not (found|recognized)/i.test(dump.stderr || "")) {
  console.error("[R13] uv를 찾지 못했어요. HARNESS.md '처음 한 번'의 uv 설치를 먼저 해요.");
  process.exit(1);
}
if (dump.status !== 0) fail((dump.stderr || dump.stdout).trim().split(/\r?\n/).slice(-3).join("\n  "));

const bin = path.join(web, "node_modules", ".bin", process.platform === "win32" ? "openapi-typescript.cmd" : "openapi-typescript");
if (!existsSync(bin)) {
  console.error("[R13] web/node_modules에 openapi-typescript가 없어요. `cd web && npm install`을 먼저 해요.");
  process.exit(1);
}
const tmp = path.join(mkdtempSync(path.join(os.tmpdir(), "bt-contract-")), "api.ts");
const gen = spawnSync(`"${bin}" ../api/openapi.json -o "${tmp}"`, { cwd: web, shell: true, encoding: "utf8" });
if (gen.status !== 0) fail(`openapi-typescript 실패: ${(gen.stderr || gen.stdout).trim().slice(0, 300)}`);

const committed = path.join(web, "src", "types", "api.ts");
const norm = (s) => s.replace(/\r\n/g, "\n");
if (!existsSync(committed)) fail("web/src/types/api.ts 가 없어요.");
if (norm(readFileSync(committed, "utf8")) !== norm(readFileSync(tmp, "utf8"))) {
  fail("web/src/types/api.ts 가 api/openapi.json 에서 만든 것과 달라요(손으로 고쳤거나 다시 만들지 않았어요).");
}
console.log("계약(R13): 통과");
