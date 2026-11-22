#!/usr/bin/env python3
"""Google 시트에서 내려받은 .xlsx를 Markdown으로 바꿔 docs/sheets/에 둔다.

쓰는 법 (저장소 맨 위 폴더에서):
    python scripts/sheets_to_md.py          # Windows는 py scripts/sheets_to_md.py

- docs/source/ 안의 .xlsx를 모두 읽는다(requirements.xlsx, ux.xlsx, dev.xlsx).
  폴더·파일 이름은 영어로 만든다(예: requirements.xlsx의 '기능 요구사항' 탭 → docs/sheets/requirements/02_functional.md).
  처음 보는 탭은 영문·숫자만 남긴 이름이 된다. 탭 이름 대응표는 아래 TABS.
- 탭 하나가 .md 파일 하나가 된다. 표는 Markdown 표로, 한 칸짜리 줄은 제목이나 문단으로 옮긴다.
- 칸 내용이 JSON이면 docs/sheets/<책>/json/ 에 .json 파일로도 꺼낸다(예시 JSON용).
- 표준 라이브러리만 쓴다. 따로 설치할 것이 없다.

시트를 고친 뒤에는 .xlsx를 다시 내려받아 이 스크립트를 다시 돌린다.
docs/sheets/ 아래 파일은 직접 고치지 않는다.
"""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "source"
OUT = ROOT / "docs" / "sheets"


def col_index(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def col_letter(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def text_of(node) -> str:
    """<si> 또는 <is> 안의 모든 <t>를 이어 붙인다(서식이 섞인 글자 포함)."""
    return "".join(t.text or "" for t in node.iter(f"{{{NS['m']}}}t"))


def read_workbook(path: Path) -> list[tuple[str, list[list[str]]]]:
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        shared: list[str] = []
        if "xl/sharedStrings.xml" in names:
            sroot = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = [text_of(si) for si in sroot.findall("m:si", NS)]

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = {r.get("Id"): r.get("Target") for r in rels.findall("rel:Relationship", NS)}

        sheets = []
        for s in wb.find("m:sheets", NS).findall("m:sheet", NS):
            name = s.get("name")
            rid = s.get(f"{{{NS['r']}}}id")
            t = target[rid].lstrip("/")
            part = t if t.startswith("xl/") else f"xl/{t}"
            sroot = ET.fromstring(z.read(part))
            grid: dict[int, dict[int, str]] = {}
            for row in sroot.iter(f"{{{NS['m']}}}row"):
                for c in row.findall("m:c", NS):
                    ref = c.get("r")
                    r_i = int(re.search(r"\d+", ref).group(0)) - 1
                    c_i = col_index(ref)
                    typ = c.get("t")
                    if typ == "inlineStr":
                        is_ = c.find("m:is", NS)
                        val = text_of(is_) if is_ is not None else ""
                    else:
                        v = c.find("m:v", NS)
                        raw = v.text if v is not None and v.text is not None else ""
                        if typ == "s" and raw != "":
                            val = shared[int(raw)]
                        elif typ == "b":
                            val = "TRUE" if raw == "1" else "FALSE"
                        else:
                            val = raw
                            if re.fullmatch(r"-?\d+\.0", val):
                                val = val[:-2]
                    if val != "":
                        grid.setdefault(r_i, {})[c_i] = val
            rows: list[list[str]] = []
            if grid:
                max_r = max(grid)
                max_c = max(max(cols) for cols in grid.values())
                for r_i in range(max_r + 1):
                    cols = grid.get(r_i, {})
                    rows.append([cols.get(c_i, "") for c_i in range(max_c + 1)])
            sheets.append((name, rows))
        return sheets


def slug(s: str) -> str:
    s = s.strip().replace(" ", "_")
    s = re.sub(r"[^\w\-가-힣]", "", s)
    return s or "sheet"


def esc(cell: str) -> str:
    return cell.replace("|", "\\|").replace("\r\n", "\n").replace("\n", "<br>").strip()


def as_json(cell: str):
    t = cell.strip()
    if not t or t[0] not in "{[":
        return None
    try:
        return json.loads(t)
    except ValueError:
        return None


def render_sheet(book: str, sheet: str, rows: list[list[str]], json_dir: Path, sheet_slug: str) -> tuple[str, int]:
    out = [
        f"# {book} · {sheet}",
        "",
        f"> 원본은 Google 시트 '{book}'의 '{sheet}' 탭이에요. `scripts/sheets_to_md.py`가 만든 파일이라 직접 고치지 않아요.",
        "",
    ]
    json_count = 0

    def flush_table(block: list[tuple[int, list[str]]]):
        nonlocal json_count
        if not block:
            return
        width = max(len(r) for _, r in block)
        cells = [r + [""] * (width - len(r)) for _, r in block]
        keep = [c for c in range(width) if any(row[c].strip() for row in cells)]
        lines = []
        for k, (r_i, row) in enumerate(block):
            row = row + [""] * (width - len(row))
            rendered = []
            for c in keep:
                val = row[c]
                obj = as_json(val)
                if obj is not None:
                    json_count += 1
                    fname = f"{sheet_slug}_{col_letter(c)}{r_i + 1}.json"
                    json_dir.mkdir(parents=True, exist_ok=True)
                    (json_dir / fname).write_text(
                        json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
                    )
                    rendered.append(f"JSON → [json/{fname}](json/{fname})")
                else:
                    rendered.append(esc(val))
            lines.append("| " + " | ".join(rendered) + " |")
            if k == 0:
                lines.append("|" + "|".join([" --- "] * len(keep)) + "|")
        out.extend(lines)
        out.append("")

    block: list[tuple[int, list[str]]] = []
    for r_i, row in enumerate(rows):
        filled = [c for c in row if c.strip()]
        if not filled:
            flush_table(block)
            block = []
            continue
        if len(filled) == 1 and not block:
            text = filled[0].strip()
            if r_i == 0 and text == sheet:
                continue  # 탭 이름과 같은 제목 줄은 건너뜀
            if len(text) <= 40 and "\n" not in text and re.match(r"^(\d+[.)]|[0-9]+\s|[A-Z]\d*\.)", text):
                out.extend([f"## {text}", ""])
            elif len(text) <= 30 and "\n" not in text:
                out.extend([f"## {text}", ""])
            else:
                obj = as_json(text)
                if obj is not None:
                    json_count += 1
                    fname = f"{sheet_slug}_A{r_i + 1}.json"
                    json_dir.mkdir(parents=True, exist_ok=True)
                    (json_dir / fname).write_text(
                        json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
                    )
                    out.extend([f"JSON → [json/{fname}](json/{fname})", ""])
                else:
                    out.extend([text, ""])
            continue
        block.append((r_i, row))
    flush_table(block)
    return "\n".join(out).rstrip() + "\n", json_count


def read_text_export(path: Path) -> list[tuple[str, list[list[str]]]]:
    """'## Sheet name: 탭이름' 줄 아래에 CSV가 이어지는 글자 내보내기를 읽는다."""
    text = path.read_text(encoding="utf-8-sig")
    parts = re.split(r"^## Sheet name: (.+)$", text, flags=re.M)
    sheets = []
    for i in range(1, len(parts), 2):
        name = parts[i].strip()
        rows = [list(r) for r in csv.reader(io.StringIO(parts[i + 1].strip("\n")))]
        while rows and not any(c.strip() for c in rows[-1]):
            rows.pop()
        sheets.append((name, rows))
    return sheets


# 폴더·파일 이름은 영어로 둔다(Windows·Mac·git에서 한글 경로가 말썽을 일으키지 않게). 화면에 보이는 제목은 한글 그대로.
BOOKS = {
    "requirements": ("requirements", "요구사항 정의서"),
    "요구사항_정의서": ("requirements", "요구사항 정의서"),
    "ux": ("ux", "UX 설계서"),
    "UX_설계서": ("ux", "UX 설계서"),
    "dev": ("dev", "개발 문서"),
    "개발_문서": ("dev", "개발 문서"),
}
TABS = {
    "개요": "overview",
    "기능 요구사항": "functional",
    "비기능 요구사항": "non-functional",
    "요구사항 추적": "traceability",
    "하지 않는 것": "out-of-scope",
    "미결 사항": "open-questions",
    "문서 간 차이": "doc-conflicts",
    "사용자 시나리오": "scenarios",
    "1 정보 정의": "1-information",
    "2 IA": "2-ia",
    "3 내비게이션": "3-navigation",
    "4 검색": "4-search",
    "5 필터·태그": "5-filter-tag",
    "6 레이블링": "6-labeling",
    "목표와 과업": "goals-tasks",
    "7 제스처": "7-gesture",
    "8 선택": "8-selection",
    "9 상태(대상)": "9-state-object",
    "10 상태(컴포넌트)": "10-state-component",
    "11 상태 변화": "11-state-transition",
    "FigJam 그림": "figjam",
    "프로토타입 검토": "prototype-review",
    "확인할 것": "to-check",
    "정할 것": "to-decide",
    "1차 점검": "qa-checklist",
    "db": "db",
    "api-needs": "api-needs",
    "최종 점검(프론트)": "qa-final-front",
}


def ascii_slug(s: str) -> str:
    """알려진 탭은 영어 이름으로, 처음 보는 탭은 영문·숫자만 남긴다(없으면 'tab')."""
    if s in TABS:
        return TABS[s]
    t = re.sub(r"[^A-Za-z0-9\-]+", "-", s.strip()).strip("-").lower()
    return t or "tab"


def main() -> int:
    # Windows 터미널(cp949)에서 글자가 깨져 멈추지 않게 한다. 파일은 늘 UTF-8로 쓴다.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    if not SRC.exists():
        print(f"docs/source 폴더가 없어요: {SRC}")
        return 1
    books = sorted(list(SRC.glob("*.xlsx")) + list(SRC.glob("*.txt")))
    if not books:
        print("docs/source/ 에 .xlsx 파일이 없어요. 구글 시트에서 '파일 → 다운로드 → Microsoft Excel(.xlsx)'로 받아 넣어 주세요.")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    index = [
        "# 시트에서 옮긴 문서",
        "",
        f"`scripts/sheets_to_md.py`가 {stamp}에 만든 목록이에요. 직접 고치지 않아요. 시트를 고쳤으면 다시 내려받아 다시 만들어요.",
        "어느 탭을 언제 보는지는 `docs/README.md`에 있어요.",
        "",
    ]
    total_json = 0
    for x in books:
        folder, title = BOOKS.get(x.stem, (ascii_slug(x.stem), x.stem))
        bdir = OUT / folder
        if bdir.exists():
            shutil.rmtree(bdir)
        bdir.mkdir(parents=True)
        index.append(f"## {title} (`{folder}/`)")
        index.append("")
        sheets = read_workbook(x) if x.suffix.lower() == ".xlsx" else read_text_export(x)
        for n, (sheet, rows) in enumerate(sheets, start=1):
            s_slug = ascii_slug(sheet)
            md, jc = render_sheet(title, sheet, rows, bdir / "json", s_slug)
            total_json += jc
            fname = f"{n:02d}_{s_slug}.md"
            (bdir / fname).write_text(md, encoding="utf-8")
            note = f" (JSON {jc}개)" if jc else ""
            index.append(f"- [{sheet}]({folder}/{fname}){note}")
        index.append("")
        print(f"{x.name} → docs/sheets/{folder}/")
    (OUT / "INDEX.md").write_text("\n".join(index).rstrip() + "\n", encoding="utf-8")
    print(f"끝. 목록: docs/sheets/INDEX.md, 꺼낸 JSON {total_json}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
