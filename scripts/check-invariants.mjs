#!/usr/bin/env node
// 불변 규칙 검사(최종 MVP, 하네스 v3). 글로 부탁하는 대신 기계가 잡고, 고치는 법을 알려 준다.
// 쓰는 곳: Stop 훅, scripts/check-all.mjs, web의 `npm run check`, CI, 사람이 직접 `node scripts/check-invariants.mjs`.
// 규칙을 바꾸거나 예외를 두려면 사람이 이 파일을 고친다(Claude는 고치지 않음: .claude/settings.json deny).
// 빠르게 도는 정적 검사만 둔다. 계약 파일 비교(R13)는 uv·npm이 필요해서 scripts/check-contract.mjs가 맡는다.
//
// R1  화면이 브라우저 저장소를 직접 씀                         D-07
// R2  화면이 예시 데이터(fixtures)를 직접 읽음                  D-19
// R3  옛 AI 제안 종류 이름                                     D-04
// R4  '북엔드' 표기                                            D-01
// R5  LLM SDK·LLM 주소는 api/app/ai/ 안에서만, web/에는 없음    D-21
// R6  api/에서 DB 접근(sqlalchemy·psycopg)은 api/app/db/ 안에서만 D-22
// R7  테스트 건너뛰기·하나만 돌리기 (TS·Python)
// R8  린트·타입 검사 끄기 (TS·Python)
// R9  비밀값처럼 보이는 문자열 (공개 저장소)
// R10 저장소에 올리면 안 되는 파일(북엔드 제공 데이터, IDE·개인 설정, Claude outputs/)
// R11 컴포넌트 CSS에 색 값 직접 쓰기 → tokens.css 변수만     DESIGN.md 2장  (1차 파일 5개만 F7까지 경고, 새 파일은 바로 막음)
// R12 fetch·EventSource·sendBeacon·WebSocket은 web/src/data/ 안에서만     NFR-15 ①
// R13 계약 파일(openapi.json, web/src/types/api.ts)            → scripts/check-contract.mjs
// R14 개발용 막대는 개발 서버나 NEXT_PUBLIC_DEV_BAR=1일 때만   FR-41
// R15 LangChain의 Postgres 벡터 저장소(langchain_postgres, PGVector) 금지  D-26
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// F7(디자인 적용)에서 true로 바꾼다. 그 전에는 아래 1차 파일의 R11 위반만 경고로 보여 주고 통과시킨다.
const R11_STRICT = true;
// 1차 MVP에서 색 값을 직접 쓴 파일. 여기 없는 파일(새 파일)은 R11_STRICT와 상관없이 바로 막는다.
const R11_BASELINE = new Set([
  "web/src/components/DevBar.module.css",
  "web/src/components/Dialog.module.css",
  "web/src/components/ShareDialog.module.css",
  "web/src/components/editor/ManuscriptEditor.module.css",
  "web/src/components/review/ReviewPanel.module.css",
]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "test-results", "playwright-report", "blob-report", "coverage", "out",
  ".venv", "__pycache__", ".mypy_cache", ".ruff_cache", ".pytest_cache",
]);
const TS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PY = /\.py$/;

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
  R1: { why: "화면이 브라우저 저장소를 직접 써요", fix: "web/src/data/ 의 함수를 불러 쓰세요. 저장소를 직접 만지는 코드는 web/src/data/ 안에만 둬요(D-07)." },
  R2: { why: "예시 데이터(fixtures)를 화면에서 직접 읽어요", fix: "예시 데이터는 web/src/ai/(데모 제공자)나 web/src/data/ 를 거쳐 읽으세요(D-19)." },
  R3: { why: "옛 AI 제안 종류 이름을 써요", fix: "종류(kind)는 spelling · spacing · notation · polish 넷만 써요(D-04, FR-24). consistency는 '정할 것' 22번이 정해지면 사람이 이 규칙에 더해요." },
  R4: { why: "'북엔드' 표기가 있어요", fix: "제품 이름은 Booktelier(북틀리에)예요. 북엔드는 협력 기업 이름이라 화면·서버 코드에 쓰지 않아요(D-01)." },
  R5: { why: "LLM을 부르는 코드·패키지가 정해진 곳 밖에 있어요", fix: "LLM SDK·LangChain·LLM 주소는 api/app/ai/ 안에서만 써요. 웹은 서버 API만 불러요(D-21). 키가 브라우저로 새지 않게 하려는 규칙이에요." },
  R6: { why: "api/app/db/ 밖에서 DB 라이브러리를 써요", fix: "SQL과 세션 다루기는 api/app/db/ 의 함수로 옮기고, 라우터는 `from app.db.session import DbSession`으로 세션만 받아 넘겨요(D-22, 리뷰 B-2)." },
  R7: { why: "테스트를 건너뛰거나 하나만 돌리게 했어요", fix: "skip · only · fixme · xit · pytest.skip · pytest.mark.skip/skipif/xfail 를 지우세요. 아직 안 만든 기능은 테스트에 넣지 않는 것으로 처리해요(docs/PLAN.md)." },
  R8: { why: "린트나 타입 검사를 껐어요", fix: "주석으로 검사를 끄지 말고 원인을 고치세요. 꼭 필요하면 멈추고 사람에게 물어보세요." },
  R9: { why: "비밀값처럼 보이는 문자열이 있어요", fix: "저장소는 공개예요. 키·DB 주소를 코드에서 지우고 .env(저장소에 안 올라감)나 배포처 환경 변수로 옮기세요(docs/DEPLOY.md). 이미 올렸다면 키를 새로 발급하세요." },
  R10: { why: "저장소에 올리면 안 되는 파일이 git에 있어요", fix: "git rm -r --cached <파일> 로 빼고 .gitignore를 확인하세요. 북엔드 제공 데이터, IDE·개인 설정(.idea/, .vscode/, .claude/settings.local.json), Claude outputs/는 올리지 않아요." },
  R11: { why: "컴포넌트 CSS에 색 값을 직접 썼어요", fix: "web/src/styles/tokens.css 의 var(--bt-…)를 쓰세요. 맞는 변수가 없으면 tokens.css에 이름을 더하고 DESIGN.md 2장 표에 적어요." },
  R12: { why: "화면이 서버를 직접 불러요", fix: "fetch · EventSource · sendBeacon · WebSocket 은 web/src/data/ 의 HTTP 어댑터 안에서만 써요. 화면은 data/ 의 함수만 불러요(NFR-15 ①)." },
  R14: { why: "개발용 막대가 배포에서도 보일 수 있어요", fix: "web/src/components/DevBar.tsx 의 DEV_BAR_ENABLED가 NEXT_PUBLIC_DEV_BAR와 NODE_ENV로 정해지고, 꺼져 있으면 아무것도 그리지 않아야 해요(FR-41)." },
  R15: { why: "LangChain의 Postgres 벡터 저장소를 써요", fix: "rag_chunk 테이블은 Alembic이 관리해요. 검색은 app/db 의 함수를 BaseRetriever로 감싸서 써요(D-26). langchain-postgres 는 설치하지 않아요." },
};

const hits = [];
const warns = [];
const add = (rule, file, line, text) => {
  const h = { rule, file: rel(file), line, text: (text || "").trim().slice(0, 120) };
  if (rule === "R11" && !R11_STRICT && R11_BASELINE.has(h.file)) warns.push(h);
  else hits.push(h);
};

const isTest = (f) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || rel(f).startsWith("web/e2e/") || rel(f).startsWith("api/tests/") || /(^|\/)test_[^/]*\.py$/.test(rel(f));
const inDir = (f, d) => rel(f).startsWith(d);

// ── web ──────────────────────────────────────────────
const webSrc = path.join(root, "web", "src");
const webFiles = [...walk(webSrc), ...walk(path.join(root, "web", "e2e"))];
const LLM_TS = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|from\s+['"](openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|@langchain\/[^'"]+|langchain)['"]/;
for (const f of webFiles.filter((f) => TS.test(f))) {
  if (rel(f) === "web/src/types/api.ts") continue; // 생성 파일(R13)
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  const test = isTest(f);
  lines.forEach((ln, i) => {
    const n = i + 1;
    if (!test && !inDir(f, "web/src/data/") && /\b(localStorage|sessionStorage)\b/.test(ln)) add("R1", f, n, ln);
    if (!test && !inDir(f, "web/src/data/") && !inDir(f, "web/src/ai/") && /(from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*fixtures[^'"]*['"]/.test(ln)) add("R2", f, n, ln);
    // R3·R4·R5·R12는 테스트 파일에서는 보지 않는다. 그 낱말로 '없다'를 확인하는 테스트가 있어서(QA-05, QA-37).
    if (!test && (/['"`](correction|copyedit)['"`]/.test(ln) || /kind\s*[:=]\s*['"`]layout['"`]/.test(ln))) add("R3", f, n, ln);
    if (!test && /북엔드|BOOKEND|Bookend\b/.test(ln)) add("R4", f, n, ln);
    if (!test && LLM_TS.test(ln)) add("R5", f, n, ln);
    if (!test && !inDir(f, "web/src/data/") && /\bfetch\s*\(|\bEventSource\b|\bsendBeacon\b|\bXMLHttpRequest\b|\bWebSocket\b/.test(ln)) add("R12", f, n, ln);
    if (test && /\b(describe|it|test)\.(only|skip|fixme)\s*\(|\b(xit|xdescribe|xtest)\s*\(/.test(ln)) add("R7", f, n, ln);
    if (/eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error/.test(ln)) add("R8", f, n, ln);
  });
}

for (const f of walk(webSrc).filter((f) => /\.module\.css$/.test(f))) {
  readFileSync(f, "utf8").split(/\r?\n/).forEach((ln, i) => {
    const code = ln.replace(/\/\*.*?\*\//g, "");
    if (/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/.test(code)) add("R11", f, i + 1, ln);
  });
}

const webPkg = path.join(root, "web", "package.json");
if (existsSync(webPkg)) {
  try {
    const pkg = JSON.parse(readFileSync(webPkg, "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const d of Object.keys(deps)) {
      if (/^(openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|langchain|@langchain\/.+)$/.test(d)) add("R5", webPkg, 0, `의존성 ${d}`);
    }
  } catch {
    /* package.json이 깨졌으면 npm이 잡는다 */
  }
}

const devBar = path.join(webSrc, "components", "DevBar.tsx");
if (existsSync(devBar)) {
  const s = readFileSync(devBar, "utf8");
  const gated =
    /process\.env\.NEXT_PUBLIC_DEV_BAR/.test(s) &&
    /DEV_BAR_ENABLED\s*=[^;]*NODE_ENV\s*===\s*["']development["']/.test(s) &&
    /if\s*\(\s*!DEV_BAR_ENABLED\s*\)\s*return\s+null/.test(s);
  if (!gated || /NEXT_PUBLIC_DEV_BAR\s*!==\s*["']off["']/.test(s)) add("R14", devBar, 0, "DEV_BAR_ENABLED 조건");
}

// ── api ──────────────────────────────────────────────
const apiDir = path.join(root, "api");
const pyFiles = walk(apiDir).filter((f) => PY.test(f));
const LLM_PY = /^\s*(from|import)\s+(openai|anthropic|langchain\w*|langgraph\w*|google\.genai|google\.generativeai)\b|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/;
const DB_PY = /^\s*(from|import)\s+(sqlalchemy|psycopg\w*|pgvector)\b/;
const VSTORE_PY = /^\s*(from|import)\s+(langchain_postgres|langchain_community\.vectorstores\.pgvector)\b|^\s*from\s+\S+\s+import\s+.*\bPGVector(Store)?\b/;
for (const f of pyFiles) {
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  const test = isTest(f);
  const inApp = inDir(f, "api/app/");
  lines.forEach((ln, i) => {
    const n = i + 1;
    const code = ln.replace(/#.*$/, "");
    if (!test && /['"](correction|copyedit)['"]/.test(code)) add("R3", f, n, ln);
    if (!test && /북엔드|BOOKEND|Bookend\b/.test(code)) add("R4", f, n, ln);
    if (!test && LLM_PY.test(ln) && !inDir(f, "api/app/ai/")) add("R5", f, n, ln);
    if (inApp && DB_PY.test(ln) && !inDir(f, "api/app/db/")) add("R6", f, n, ln);
    if (/\bpytest\.skip\s*\(|pytest\.mark\.(skip|skipif|xfail)\b|\bunittest\.skip\b/.test(code)) add("R7", f, n, ln);
    if (/#\s*(noqa|type:\s*ignore|pyright:\s*ignore|ruff:\s*noqa|mypy:\s*ignore)/i.test(ln)) add("R8", f, n, ln);
    if (VSTORE_PY.test(ln)) add("R15", f, n, ln);
  });
}

const pyproject = path.join(apiDir, "pyproject.toml");
if (existsSync(pyproject)) {
  readFileSync(pyproject, "utf8").split(/\r?\n/).forEach((ln, i) => {
    if (/["']langchain-postgres/.test(ln)) add("R15", pyproject, i + 1, ln);
    if (/^\s*ignore_errors\s*=\s*true/.test(ln)) add("R8", pyproject, i + 1, ln);
  });
}

// ── 비밀값(공개 저장소) ─────────────────────────────
const SECRET = new RegExp(
  [
    String.raw`\bsk-[A-Za-z0-9_-]{20,}`,
    String.raw`\bsk-ant-[A-Za-z0-9_-]{20,}`,
    String.raw`\bAKIA[0-9A-Z]{16}\b`,
    String.raw`\bAIza[0-9A-Za-z_-]{35}\b`,
    String.raw`\bgh[pousr]_[A-Za-z0-9]{30,}`,
    String.raw`\bnpg_[A-Za-z0-9]{10,}`,
    String.raw`postgres(?:ql)?(?:\+\w+)?://[^:\s/@]+:[^@\s]{6,}@[^\s'"]*(neon\.tech|railway\.app|rlwy\.net|supabase\.co)`,
  ].join("|")
);
const secretRoots = ["web", "api", "scripts", "docs", ".github", ".claude"].map((d) => path.join(root, d));
const textFiles = [
  ...secretRoots.flatMap((d) => walk(d)),
  ...readdirSync(root).map((n) => path.join(root, n)).filter((p) => statSync(p).isFile()),
].filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json|md|py|txt|ya?ml|toml|ini|cfg|html|css)$/.test(f) && !/(^|[\\/])\.env(\.|$)/.test(f) && !/package-lock\.json$|uv\.lock$/.test(f));
for (const f of textFiles) {
  if (statSync(f).size > 1_000_000) continue;
  readFileSync(f, "utf8").split(/\r?\n/).forEach((ln, i) => {
    if (SECRET.test(ln)) add("R9", f, i + 1, ln.replace(SECRET, "<가림>"));
  });
}

const ls = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
if (ls.status === 0) {
  for (const f of ls.stdout.split(/\r?\n/).filter(Boolean)) {
    if (/\.jsonl$/i.test(f) || /북엔드.*데이터/.test(f)) add("R10", path.join(root, f), 0, "북엔드 제공 데이터");
    if (/^\.idea\//.test(f) || /^\.vscode\/(?!extensions\.json$)/.test(f) || f === ".claude/settings.local.json" || /^Claude outputs\//.test(f)) add("R10", path.join(root, f), 0, "IDE·개인 설정, 개인 산출물");
    if (/(^|\/)\.env$/.test(f) || /(^|\/)\.env\.(?!example$)/.test(f)) add("R9", path.join(root, f), 0, ".env 파일이 git에 올라가 있어요");
  }
}

// ── 결과 ─────────────────────────────────────────────
function report(list, title) {
  const byRule = new Map();
  for (const h of list) {
    if (!byRule.has(h.rule)) byRule.set(h.rule, []);
    byRule.get(h.rule).push(h);
  }
  const out = [title];
  for (const [rule, items] of byRule) {
    out.push("", `[${rule}] ${RULES[rule].why}`, `  고치는 법: ${RULES[rule].fix}`);
    for (const h of items.slice(0, 15)) out.push(`  - ${h.file}${h.line ? `:${h.line}` : ""}${h.text ? `  ${h.text}` : ""}`);
    if (items.length > 15) out.push(`  - 외 ${items.length - 15}건`);
  }
  return out.join("\n");
}

if (warns.length) {
  const files = new Set(warns.map((w) => w.file)).size;
  console.log(`[경고] R11 컴포넌트 CSS 색 값 직접 쓰기 ${warns.length}건(${files}개 파일). 1차 파일 5개만 F7까지 봐줘요. F7에서 tokens.css로 옮기고 R11_STRICT를 켜요. 목록: node scripts/check-invariants.mjs --r11`);
  if (process.argv.includes("--r11")) console.log(report(warns, "R11 경고 목록"));
}

if (hits.length === 0) {
  console.log("불변 규칙: 통과 (R1~R12, R14, R15. R13은 check-contract)");
  process.exit(0);
}
console.error(report(hits, `불변 규칙 위반 ${hits.length}건`));
process.exit(1);
