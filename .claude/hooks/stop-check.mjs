#!/usr/bin/env node
// Stop 훅. Claude가 턴을 끝내려 할 때 검사를 돌리고, 실패하면 exit 2 + stderr로 끝내지 못하게 한다.
//   1) 불변 규칙(scripts/check-invariants.mjs): 늘 돌린다. 빠르다.
//   2) web/ 아래 커밋 안 한 변경이 있으면: 타입 검사, 단위 테스트
//   3) api/ 아래 커밋 안 한 변경이 있으면: ruff, mypy, pytest
//   4) api/app, api/openapi.json, web/src/types 가 바뀌었으면: 계약(R13)
// 막지 않는 경우
// - 이미 이 훅 때문에 한 번 더 일한 뒤(stop_hook_active): 같은 실패로 계속 막히지 않게 한다.
//   이때 Claude는 실패를 보고에 그대로 적고 멈춘다(CLAUDE.md 작업 루프).
// e2e는 여기서 돌리지 않는다(오래 걸리고 개발 서버가 필요하다). 보고 전에 Claude가 직접 돌린다.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const web = path.join(root, "web");
const api = path.join(root, "api");
const tail = (s, n) => s.trim().split(/\r?\n/).slice(-n).join("\n");

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  input = {};
}
if (input.stop_hook_active) process.exit(0);

const failures = [];
const run = (name, cmd, cwd, timeout = 240_000) => {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", timeout });
  if (r.status !== 0) {
    const why = r.error ? `실행 실패: ${r.error.message}\n` : "";
    failures.push(`## ${name} 실패 (${cmd})\n${why}${tail(`${r.stdout || ""}${r.stderr || ""}`, 50)}`);
  }
};
const changed = (...paths) => {
  const st = spawnSync("git", ["status", "--porcelain", "--", ...paths], { cwd: root, encoding: "utf8" });
  return !(st.status === 0 && st.stdout.trim() === "");
};

run("불변 규칙", `"${process.execPath}" scripts/check-invariants.mjs`, root, 60_000);

if (existsSync(path.join(web, "node_modules")) && changed("web")) {
  run("web 타입 검사", "npm run typecheck --silent", web);
  run("web 단위 테스트", "npm run test --silent", web);
}

if (existsSync(path.join(api, "pyproject.toml")) && changed("api")) {
  const uv = spawnSync("uv --version", { shell: true, encoding: "utf8" });
  if (uv.status !== 0) {
    failures.push("## uv가 없어요\nHARNESS.md '처음 한 번'대로 uv를 설치해야 api 검사를 돌릴 수 있어요.");
  } else {
    run("api 린트", "uv run ruff check .", api);
    run("api 포맷", "uv run ruff format --check .", api);
    run("api 타입", "uv run mypy app tests", api);
    run("api 테스트", "uv run pytest -q", api, 400_000);
  }
}

if (changed("api/app", "api/openapi.json", "web/src/types")) {
  run("계약(R13)", `"${process.execPath}" scripts/check-contract.mjs`, root);
}

if (failures.length === 0) process.exit(0);

process.stderr.write(
  "[훅: 끝내기 전 검사] 아래 검사가 실패해서 아직 끝낼 수 없어요. 원인을 고친 뒤 다시 검사하세요. " +
    "테스트를 지우거나 건너뛰게 하거나 검사를 꺼서 통과시키지 마세요.\n\n" +
    failures.join("\n\n") +
    "\n"
);
process.exit(2);
