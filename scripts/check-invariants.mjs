#!/usr/bin/env node
// 불변 규칙 검사. 글로 부탁하는 대신 기계가 잡고, 고치는 법을 알려 준다.
// 쓰는 곳: Stop 훅(.claude/hooks/stop-check.mjs), web의 `npm run check`, 사람이 직접 `node scripts/check-invariants.mjs`.
// 규칙을 바꾸거나 예외를 두려면 사람이 이 파일을 고친다(Claude는 고치지 않음: .claude/settings.json deny).
//
// R1 화면이 브라우저 저장소를 직접 씀           D-07
// R2 화면이 예시 데이터(fixtures)를 직접 읽음    D-07, D-19
// R3 옛 AI 제안 종류 이름                       D-04
// R4 화면에 '북엔드' 표기                       D-01
// R5 실제 LLM 호출                              D-06
// R6 api/ 구현(1차에는 비워 둠)                 D-06
// R7 테스트 건너뛰기·하나만 돌리기
// R8 린트·타입 검사 끄기
// R9 비밀값처럼 보이는 문자열
// R10 북엔드 제공 데이터가 git에 올라감
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report", "blob-report", "coverage", "out"]);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const RULES = {
  R1: { why: "화면이 브라우저 저장소를 직접 써요", fix: "web/src/data/ 의 저장 함수를 불러 쓰세요. 저장소를 직접 만지는 코드는 web/src/data/ 안에만 둬요(docs/DECISIONS.md D-07)." },
  R2: { why: "예시 데이터(fixtures)를 화면에서 직접 읽어요", fix: "예시 데이터는 web/src/ai/(데모 제공자)나 web/src/data/ 를 거쳐 읽으세요. 그래야 실제 AI·서버로 바꿀 때 화면을 안 고쳐요(D-07, D-19)." },
  R3: { why: "옛 AI 제안 종류 이름을 써요", fix: "종류(kind)는 spelling · spacing · notation · polish 넷만 써요(D-04, FR-24)." },
  R4: { why: "'북엔드' 표기가 있어요", fix: "제품 이름은 Booktelier(북틀리에)예요. 북엔드는 협력 기업 이름이라 화면 코드에 쓰지 않아요(D-01)." },
  R5: { why: "실제 LLM을 부르는 코드나 패키지가 있어요", fix: "1차는 데모 제공자(예시 JSON)만 써요. 실제 AI는 목요일 이후 사람과 정한 뒤 붙여요(D-06)." },
  R6: { why: "api/ 에 구현 파일이 있어요", fix: "1차에는 서버를 만들지 않아요. api/ 에는 README.md만 둬요(D-06). 필요해 보이면 멈추고 물어보세요." },
  R7: { why: "테스트를 건너뛰거나 하나만 돌리게 했어요", fix: "skip · only · fixme · xit를 지우세요. 아직 안 만든 단계는 테스트에 넣지 않는 것으로 처리해요(docs/PLAN.md)." },
  R8: { why: "린트나 타입 검사를 껐어요", fix: "주석으로 검사를 끄지 말고 원인을 고치세요. 꼭 필요하면 멈추고 사람에게 물어보세요." },
  R9: { why: "비밀값처럼 보이는 문자열이 있어요", fix: "키를 코드에서 지우고 .env(저장소에 안 올라감)로 옮기세요. 1차에는 키가 필요 없어요." },
  R10: { why: "북엔드 제공 데이터가 git에 올라가 있어요", fix: "git rm --cached 로 빼고 .gitignore를 확인하세요. 제공 데이터는 저장소에 올리지 않아요." },
};

const hits = [];
const add = (rule, file, line, text) => hits.push({ rule, file: rel(file), line, text: (text || "").trim().slice(0, 120) });

const webSrc = path.join(root, "web", "src");
const webE2e = path.join(root, "web", "e2e");
const isTest = (f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || rel(f).startsWith("web/e2e/");
const inDir = (f, d) => rel(f).startsWith(d);

const codeFiles = [...walk(webSrc), ...walk(webE2e)].filter((f) => CODE.test(f));
for (const f of codeFiles) {
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  const test = isTest(f);
  lines.forEach((ln, i) => {
    const n = i + 1;
    if (!test && !inDir(f, "web/src/data/") && /\b(localStorage|sessionStorage)\b/.test(ln)) add("R1", f, n, ln);
    if (!test && !inDir(f, "web/src/data/") && !inDir(f, "web/src/ai/") && /(from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*fixtures[^'"]*['"]/.test(ln)) add("R2", f, n, ln);
    // R3·R4·R5는 테스트 파일에서는 보지 않는다. "옛 이름은 거절된다", "화면에 북엔드가 없다"(QA-05),
    // "LLM 호출이 나가지 않는다"(QA-37)처럼 그 낱말을 써서 확인하는 테스트가 있어서.
    if (!test && (/['"`](correction|copyedit)['"`]/.test(ln) || /kind\s*[:=]\s*['"`]layout['"`]/.test(ln))) add("R3", f, n, ln);
    if (!test && /북엔드|BOOKEND|Bookend\b/.test(ln)) add("R4", f, n, ln);
    if (!test && /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|from\s+['"](openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai)['"]/.test(ln)) add("R5", f, n, ln);
    if (test && /\b(describe|it|test)\.(only|skip|fixme)\s*\(|\b(xit|xdescribe|xtest)\s*\(/.test(ln)) add("R7", f, n, ln);
    if (/eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error/.test(ln)) add("R8", f, n, ln);
  });
}

const webPkg = path.join(root, "web", "package.json");
if (existsSync(webPkg)) {
  try {
    const pkg = JSON.parse(readFileSync(webPkg, "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const d of ["openai", "@anthropic-ai/sdk", "@google/generative-ai", "@google/genai"]) {
      if (deps[d]) add("R5", webPkg, 0, `의존성 ${d}`);
    }
  } catch {
    /* package.json이 깨졌으면 다른 검사(npm)가 잡는다 */
  }
}

const apiDir = path.join(root, "api");
for (const f of walk(apiDir)) {
  if (path.basename(f).toLowerCase() !== "readme.md") add("R6", f, 0, "");
}

const SECRET = /\bsk-[A-Za-z0-9_-]{20,}|\bsk-ant-[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{35}\b/;
const textFiles = [...walk(path.join(root, "web")), ...walk(apiDir), ...walk(path.join(root, "scripts"))].filter((f) =>
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|py|env|txt|ya?ml|toml)$/.test(f) && !/\.env(\.|$)/.test(path.basename(f))
);
for (const f of textFiles) {
  if (statSync(f).size > 1_000_000) continue;
  readFileSync(f, "utf8").split(/\r?\n/).forEach((ln, i) => {
    if (SECRET.test(ln)) add("R9", f, i + 1, ln.replace(SECRET, "<가림>"));
  });
}

const ls = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
if (ls.status === 0) {
  for (const f of ls.stdout.split(/\r?\n/).filter(Boolean)) {
    if (/\.jsonl$/i.test(f) || /북엔드.*데이터/.test(f)) add("R10", path.join(root, f), 0, "");
  }
}

if (hits.length === 0) {
  console.log("불변 규칙: 통과 (R1~R10)");
  process.exit(0);
}

const byRule = new Map();
for (const h of hits) {
  if (!byRule.has(h.rule)) byRule.set(h.rule, []);
  byRule.get(h.rule).push(h);
}
const out = [`불변 규칙 위반 ${hits.length}건`];
for (const [rule, list] of byRule) {
  out.push("", `[${rule}] ${RULES[rule].why}`, `  고치는 법: ${RULES[rule].fix}`);
  for (const h of list.slice(0, 15)) out.push(`  - ${h.file}${h.line ? `:${h.line}` : ""}${h.text ? `  ${h.text}` : ""}`);
  if (list.length > 15) out.push(`  - 외 ${list.length - 15}건`);
}
console.error(out.join("\n"));
process.exit(1);
