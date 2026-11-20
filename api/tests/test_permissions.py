"""서버 권한 표(app/auth/permissions.py)가 화면의 표(web/src/domain/permissions.ts)와 같은지(D-14, D-15).

화면은 버튼을 숨기고 서버는 다시 막아요(D-22). 두 표가 다르면 숨긴 버튼과 막는 요청이 어긋나요.
"""

import re
from pathlib import Path

from app.auth.permissions import PERMISSIONS, actions_for, can

WEB_TABLE = Path(__file__).resolve().parents[2] / "web" / "src" / "domain" / "permissions.ts"
GROUPS = {
    "AUTHOR": {"author"},
    "EDITOR": {"editor"},
    "AUTHOR_EDITOR": {"author", "editor"},
    "EDITOR_DESIGNER": {"editor", "designer"},
    "ALL": {"editor", "author", "designer"},
}


def _web_table() -> dict[str, set[str]]:
    text = WEB_TABLE.read_text(encoding="utf-8")
    body = text[text.index("export const PERMISSIONS") :]
    body = body[: body.index("} as const")]
    return {
        name: GROUPS[group] for name, group in re.findall(r"^\s+(\w+):\s*([A-Z_]+),", body, re.M)
    }


def test_server_table_matches_web_table() -> None:
    web = _web_table()
    assert web, "web 권한 표를 읽지 못했어요"
    assert {a: set(r) for a, r in PERMISSIONS.items()} == web


def test_can_and_actions_for() -> None:
    assert can("author", "edit_manuscript")
    assert not can("editor", "edit_manuscript")  # D-14
    assert not can("author", "change_layout")  # FR-16 ③
    assert "share_role_links" in actions_for("editor")
    assert "share_role_links" not in actions_for("designer")
