"""서버의 OpenAPI(계약)를 api/openapi.json으로 내보내요. 웹 타입은 이 파일에서 만들어요(R13).

uv run python scripts/dump_openapi.py          # 다시 쓰기
uv run python scripts/dump_openapi.py --check  # 지금 코드와 파일이 다르면 실패
"""

import json
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
OUT = API_DIR / "openapi.json"


def main() -> int:
    sys.path.insert(0, str(API_DIR))
    from app.main import app  # 경로를 넣은 뒤에 불러요

    text = json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print(
                "api/openapi.json이 지금 서버 코드와 달라요. "
                "`cd api && uv run python scripts/dump_openapi.py` 뒤 "
                "`cd web && npm run gen:api`를 돌려 둘 다 커밋해요.",
                file=sys.stderr,
            )
            return 1
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"썼어요: {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
