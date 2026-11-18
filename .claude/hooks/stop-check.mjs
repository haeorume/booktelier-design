#!/usr/bin/env node
// Stop 훅. Claude가 턴을 끝내려 할 때 검사를 돌리고, 실패하면 exit 2 + stderr로 끝내지 못하게 한다.
//   1) 불변 규칙(scripts/check-invariants.mjs): 늘 돌린다. 빠르다.
//   2) web/의 타입 검사와 단위 테스트: web/이 있고, web/ 아래 커밋 안 한 변경이 있을 때만.
// 막지 않는 경우
// - 이미 이 훅 때문에 한 번 더 일한 뒤(stop_hook_active): 같은 실패로 계속 막히지 않게 한다.
//   이때 Claude는 실패를 보고에 그대로 적고 멈춘다(CLAUDE.md 작업 루프).
// 데모 플로우 e2e는 여기서 돌리지 않는다. 아직 만들지 않은 단계 때문에 늘 실패한다.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const web = path.join(root, "web");
const tail = (s, n) => s.trim().split(/\r?\n/).slice(-n).join("\n");

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  input = {};
}
if (input.stop_hook_active) process.exit(0);

const failures = [];

const inv = spawnSync(process.execPath, [path.join(root, "scripts", "check-invariants.mjs")], { cwd: root, encoding: "utf8", timeout: 60_000 });
if (inv.status !== 0) failures.push(`## 불변 규칙 (scripts/check-invariants.mjs)\n${tail(`${inv.stdout || ""}${inv.stderr || ""}`, 60)}`);

const pkgPath = path.join(web, "package.json");
const webReady = existsSync(pkgPath) && existsSync(path.join(web, "node_modules"));
const st = spawnSync("git", ["status", "--porcelain", "--", "web"], { cwd: root, encoding: "utf8" });
const webChanged = !(st.status === 0 && st.stdout.trim() === "");

if (webReady && webChanged) {
  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(pkgPath, "utf8")).scripts || {};
  } catch {
    scripts = {};
  }
  for (const name of ["typecheck", "test"]) {
    if (!scripts[name]) {
      failures.push(`## web/package.json에 '${name}' 스크립트가 없어요\ndocs/PLAN.md W0의 scripts 이름대로 넣어 주세요.`);
      continue;
    }
    const r = spawnSync(`npm run ${name} --silent`, { cwd: web, shell: true, encoding: "utf8", timeout: 240_000 });
    if (r.status !== 0) {
      const why = r.error ? `실행 실패: ${r.error.message}\n` : "";
      failures.push(`## npm run ${name} 실패\n${why}${tail(`${r.stdout || ""}${r.stderr || ""}`, 60)}`);
    }
  }
}

if (failures.length === 0) process.exit(0);

process.stderr.write(
  "[훅: 끝내기 전 검사] 아래 검사가 실패해서 아직 끝낼 수 없어요. 원인을 고친 뒤 다시 검사하세요. " +
    "테스트를 지우거나 건너뛰게 하거나 검사를 꺼서 통과시키지 마세요.\n\n" +
    failures.join("\n\n") +
    "\n"
);
process.exit(2);
