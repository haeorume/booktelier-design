#!/usr/bin/env node
// 지금 어디까지 왔나. 루프를 돌 때마다 사람과 Claude가 같은 숫자를 봐요(D-36).
//   node scripts/progress.mjs          지금 F의 남은 API·확인할 QA·서버 점검
//   node scripts/progress.mjs --all    F 전체
// 읽는 것
// - docs/PLAN.md: '지금 할 F:' 줄, 'F별 번호' 표, '서버 점검' 표
// - api/openapi.json: summary가 'A-xx'로 시작하는 엔드포인트 = 서버에 있음(가짜 응답 포함)
// - docs/sheets/dev/*api-needs.md, *qa-final-front.md: 이름, 경로, 결과(시트에서 사람이 고른 값)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => (p && existsSync(p) ? readFileSync(p, "utf8") : null);
const all = process.argv.includes("--all");

// 'A-01~09', 'A-10~15·29', 'QA-F01·03~08', 'S-05·07·08' → 번호 목록
function expand(text, prefix) {
  const out = [];
  const re = new RegExp(`${prefix}(\\d+)((?:\\s*[~·,]\\s*(?:${prefix})?\\d+)*)`, "g");
  for (const m of text.matchAll(re)) {
    const width = m[1].length;
    const fmt = (n) => `${prefix}${String(n).padStart(width, "0")}`;
    let last = Number(m[1]);
    out.push(fmt(last));
    for (const t of m[2].matchAll(new RegExp(`([~·,])\\s*(?:${prefix})?(\\d+)`, "g"))) {
      const n = Number(t[2]);
      if (t[1] === "~") for (let k = last + 1; k <= n; k += 1) out.push(fmt(k));
      else out.push(fmt(n));
      last = n;
    }
  }
  return [...new Set(out)];
}

// Markdown 표 → 줄마다 { 머리 칸: 값 }
function mdTable(text, firstHeader) {
  const rows = [];
  let head = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("|")) {
      head = null;
      continue;
    }
    const cells = line.slice(1, line.endsWith("|") ? -1 : undefined).split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").replace(/<br>/g, " ").trim());
    if (/^-+$/.test(cells[0]?.replace(/\s/g, "") ?? "")) continue;
    if (cells[0] === firstHeader) {
      head = cells;
      continue;
    }
    if (head) rows.push(Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""])));
  }
  return rows;
}

function sheet(suffix) {
  const dir = path.join(root, "docs", "sheets", "dev");
  if (!existsSync(dir)) return null;
  const name = readdirSync(dir).find((f) => f.endsWith(suffix));
  return name ? read(path.join(dir, name)) : null;
}

const plan = read(path.join(root, "docs", "PLAN.md"));
if (!plan) {
  console.error("docs/PLAN.md가 없어요.");
  process.exit(1);
}
const current = /지금 할 F:\s*(F\d+)/.exec(plan)?.[1] ?? "F0";
const fRows = mdTable(plan, "F").filter((r) => /^(F\d+|Could)$/.test(r.F) && "API" in r);
const checks = new Map(mdTable(plan, "번호").filter((r) => /^S-\d+$/.test(r["번호"])).map((r) => [r["번호"], r["확인할 것"]]));

const onServer = new Set();
const spec = read(path.join(root, "api", "openapi.json"));
if (spec) {
  for (const ops of Object.values(JSON.parse(spec).paths || {})) {
    for (const op of Object.values(ops)) {
      const id = /^A-(\d+)/.exec(op.summary || "")?.[0];
      if (id) onServer.add(id);
    }
  }
}

const needsMd = sheet("api-needs.md");
const qaMd = sheet("qa-final-front.md");
const needs = new Map((needsMd ? mdTable(needsMd, "번호") : []).filter((r) => /^A-\d+$/.test(r["번호"])).map((r) => [r["번호"], r]));
const qa = new Map((qaMd ? mdTable(qaMd, "번호") : []).filter((r) => /^QA-F\d+$/.test(r["번호"])).map((r) => [r["번호"], r]));

const out = [`지금 할 F: ${current} (docs/PLAN.md)`];
if (!needsMd) out.push("  · docs/sheets/dev/ 에 api-needs 사본이 없어요. 시트를 다시 내보내요(scripts/sheets_to_md.py).");
out.push(`서버에 있는 API: ${onServer.size} / ${needs.size || "?"}개 (api/openapi.json의 summary 기준, 가짜 응답 포함)`);
if (qa.size) {
  const count = {};
  for (const r of qa.values()) {
    const k = r["결과"] || "아직";
    count[k] = (count[k] || 0) + 1;
  }
  out.push(`최종 점검(프론트): ${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(" · ")} / ${qa.size} (시트 사본 기준)`);
}

for (const r of fRows) {
  if (!all && r.F !== current) continue;
  const api = expand(r.API, "A-");
  const qas = expand(r["확인할 QA"], "QA-F");
  const svs = expand(r["서버 점검"], "S-");
  out.push("", `## ${r.F}`);
  if (api.length) {
    const have = api.filter((id) => onServer.has(id)).length;
    out.push(`API ${have}/${api.length} 서버에 있음`);
    for (const id of api) {
      const n = needs.get(id) || {};
      const where = n["확정 경로 (정모)"] || n["잠정 경로 (혜린)"] || "";
      out.push(`  ${onServer.has(id) ? "✓" : "·"} ${id} ${n["하는 일"] || ""}${where ? `  ${where}` : ""}`);
    }
  }
  if (qas.length) {
    out.push(`확인할 QA ${qas.length}개 (결과는 시트에서 사람이 골라요)`);
    for (const id of qas) out.push(`  [${qa.get(id)?.["결과"] || "아직"}] ${id} ${qa.get(id)?.["확인할 것"] || ""}`);
  }
  if (svs.length) {
    out.push(`서버 점검 ${svs.length}개 (pytest로)`);
    for (const id of svs) out.push(`  ${id} ${checks.get(id) || ""}`);
  }
}
console.log(out.join("\n"));
