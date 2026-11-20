#!/usr/bin/env node
// PostToolUse(Edit|Write) 훅. Claude가 고친 파일 하나만 바로 검사한다.
// - web/ 의 TS·JS 파일: ESLint (경고도 0개여야 통과)
// - api/ 의 .py 파일: ruff format(자동으로 맞춤) 뒤 ruff check
// 문제가 있으면 exit 2 + stderr → Claude가 그 내용을 받아 고친다(파일은 이미 바뀐 뒤).
// 도구가 아직 없거나(설치 전) 도구 자체가 죽으면 막지 않는다.
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
  process.exit(0);
}
const file = input?.tool_input?.file_path;
if (!file) process.exit(0);
const abs = path.resolve(root, file);
const inside = (dir) => {
  const r = path.relative(dir, abs);
  return r && !r.startsWith("..") && !path.isAbsolute(r) ? r : null;
};

// ── web: ESLint ──
const relWeb = inside(web);
if (relWeb && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(abs) && relWeb.split(path.sep)[0] !== "node_modules") {
  const bin = path.join(web, "node_modules", ".bin", process.platform === "win32" ? "eslint.cmd" : "eslint");
  if (!existsSync(bin)) process.exit(0);
  const r = spawnSync(`"${bin}" --max-warnings 0 "${relWeb}"`, { cwd: web, shell: true, encoding: "utf8", timeout: 60_000 });
  // ESLint: 0 = 문제 없음, 1 = 린트 오류(또는 경고), 2 = 설정 오류나 실행 실패
  if (r.status !== 1) process.exit(0);
  process.stderr.write(
    `[훅: ESLint] web/${relWeb.split(path.sep).join("/")} 에 린트 오류나 경고가 있어요. 규칙을 끄지 말고 코드를 고쳐 주세요.\n${tail(`${r.stdout || ""}${r.stderr || ""}`, 40)}\n`
  );
  process.exit(2);
}

// ── api: ruff ──
const relApi = inside(api);
if (relApi && /\.py$/.test(abs) && relApi.split(path.sep)[0] !== ".venv") {
  const run = (cmd) => spawnSync(cmd, { cwd: api, shell: true, encoding: "utf8", timeout: 60_000 });
  const fmt = run(`uv run ruff format "${relApi}"`);
  if (fmt.error || fmt.status === 127 || /not (found|recognized)/i.test(fmt.stderr || "")) process.exit(0); // uv 없음
  const r = run(`uv run ruff check "${relApi}"`);
  // ruff: 0 = 문제 없음, 1 = 위반, 2 = 설정 오류
  if (r.status !== 1) process.exit(0);
  process.stderr.write(
    `[훅: ruff] api/${relApi.split(path.sep).join("/")} 에 린트 오류가 있어요(포맷은 자동으로 맞췄어요). noqa로 끄지 말고 고쳐 주세요.\n${tail(`${r.stdout || ""}${r.stderr || ""}`, 40)}\n`
  );
  process.exit(2);
}

process.exit(0);
