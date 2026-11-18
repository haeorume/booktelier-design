#!/usr/bin/env node
// PostToolUse(Edit|Write) 훅.
// Claude가 web/ 안의 코드 파일을 고치면 그 파일만 ESLint로 검사한다.
// 린트 오류가 있으면 exit 2 + stderr → Claude가 그 내용을 받아 고친다(파일은 이미 바뀐 뒤).
// ESLint가 아직 없거나(W0 전) 설정 오류로 ESLint 자체가 죽으면 막지 않는다.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const web = path.join(root, "web");

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}

const file = input?.tool_input?.file_path;
if (!file) process.exit(0);

const abs = path.resolve(root, file);
const rel = path.relative(web, abs);
if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) process.exit(0);
if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(abs)) process.exit(0);
if (rel.split(path.sep)[0] === "node_modules") process.exit(0);

const bin = path.join(web, "node_modules", ".bin", process.platform === "win32" ? "eslint.cmd" : "eslint");
if (!existsSync(bin)) process.exit(0);

// Next.js 기본 설정은 안 쓰는 변수 같은 것을 '경고'로만 내서, 경고도 0개여야 통과하게 한다.
const r = spawnSync(`"${bin}" --max-warnings 0 "${rel}"`, { cwd: web, shell: true, encoding: "utf8", timeout: 60_000 });

// ESLint: 0 = 문제 없음, 1 = 린트 오류(또는 경고가 남음), 2 = 설정 오류나 실행 실패
if (r.status !== 1) process.exit(0);

const out = `${r.stdout || ""}${r.stderr || ""}`.trim().split(/\r?\n/).slice(-40).join("\n");
process.stderr.write(`[훅: ESLint] web/${rel.split(path.sep).join("/")} 에 린트 오류나 경고가 있어요. 규칙을 끄지 말고 코드를 고쳐 주세요.\n${out}\n`);
process.exit(2);
