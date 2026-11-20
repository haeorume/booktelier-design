"""F1 계약(A-01~A-15). DB 없이 도는 것만: 계약 모양, 해시 칸 없음, 오류 모양, 토큰 없음 401.

토큰이 있을 때의 동작(S-01~S-05)은 tests/test_identity.py(DB 테스트)에 있어요.
"""

import re
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

PROJECT = "0b9f6c2e-7d41-4a8e-9c53-1f2e3d4a5b6c"
CHAPTER = "3f1c9a52-6b0e-4d7a-9e21-5c8b7a0d4e11"
INVITE = "d1a5f3b8-7c2e-4a90-b6d4-e8f0c2a7b315"

# 토큰이 있어야 부를 수 있는 것(C-1). A-02·A-03·A-05·A-06은 토큰 없이 불러요.
PROTECTED: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/me", None),
    ("GET", f"/projects/{PROJECT}", None),
    ("GET", f"/projects/{PROJECT}/invites", None),
    ("POST", f"/projects/{PROJECT}/invites", {"role": "author"}),
    ("POST", f"/invites/{INVITE}/rotate", None),
    ("POST", f"/invites/{INVITE}/revoke", None),
    ("GET", f"/chapters/{CHAPTER}", None),
    ("PUT", f"/chapters/{CHAPTER}/doc", {"doc": {"type": "doc", "content": []}, "base_version": 3}),
    ("POST", f"/projects/{PROJECT}/chapters", {"id": CHAPTER, "title": "2장"}),
    ("POST", f"/chapters/{CHAPTER}/status", {"to": "review_requested"}),
    ("PATCH", f"/projects/{PROJECT}/layout", {"layout": {"line_height": 1.8}}),
    ("GET", f"/chapters/{CHAPTER}/snapshots", None),
    ("POST", f"/chapters/{CHAPTER}/snapshots", {"label": "1차"}),
    ("GET", f"/snapshots/{CHAPTER}", None),
]


def _summaries() -> set[str]:
    spec = create_app().openapi()
    out = set()
    for ops in spec["paths"].values():
        for op in ops.values():
            m = re.match(r"A-\d+", op.get("summary", ""))
            if m:
                out.add(m.group(0))
    return out


def test_f1_contract_has_a01_to_a15() -> None:
    # A-04는 A-01과 같은 GET /me라 summary가 하나예요.
    want = {f"A-{n:02d}" for n in range(1, 16)} - {"A-04"}
    assert want <= _summaries()


def _property_names(node: Any) -> set[str]:
    names: set[str] = set()
    if isinstance(node, dict):
        props = node.get("properties")
        if isinstance(props, dict):
            names |= set(props)
        for v in node.values():
            names |= _property_names(v)
    elif isinstance(node, list):
        for v in node:
            names |= _property_names(v)
    return names


def test_no_hash_field_in_any_schema() -> None:
    # S-04의 계약 쪽: 어떤 API 모델에도 해시 칸이 없어요(D-24, D-27).
    names = _property_names(create_app().openapi())
    assert not [n for n in names if "hash" in n.lower()]


def test_every_error_response_uses_error_shape() -> None:
    # C-3·D-35: 오류는 늘 { code, message }. 409는 버전 충돌일 때 latest를 더 실어요.
    spec = create_app().openapi()
    allowed = {
        "#/components/schemas/ErrorOut",
        "#/components/schemas/VersionConflictOut",
        "#/components/schemas/ConflictOut",
    }
    assert "HTTPValidationError" not in spec["components"]["schemas"]
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            for code, res in op["responses"].items():
                if not code.startswith("4"):
                    continue
                ref = res["content"]["application/json"]["schema"]["$ref"]
                assert ref in allowed, f"{method.upper()} {path} {code}: {ref}"


@pytest.mark.parametrize(("method", "path", "body"), PROTECTED)
def test_missing_token_is_401(
    client: TestClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    res = client.request(method, path, json=body)
    assert res.status_code == 401
    assert res.json() == {"code": "unauthorized", "message": "토큰이 없어요"}


def test_chapter_doc_round_trips_without_nulls() -> None:
    # 화면이 보낸 원고와 서버가 돌려주는 원고는 같은 모양이에요(빈 선택 칸을 null로 채우지 않음)
    from app.schemas.common import ChapterDoc

    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "attrs": {"id": "p1"},
                "content": [
                    {"type": "text", "text": "가"},
                    {"type": "text", "text": "나", "marks": [{"type": "bold"}]},
                ],
            },
            {"type": "paragraph", "attrs": {"id": "p2"}},
        ],
    }
    assert ChapterDoc.model_validate(doc).model_dump(mode="json") == doc


def test_demo_fixtures_are_the_web_fixtures_d19() -> None:
    # 서버 데모 제공자는 1차 예시 JSON을 글자 하나 바꾸지 않고 써요(D-19). 사본이 웹 원본과 같은지.
    from pathlib import Path

    api = Path(__file__).resolve().parents[1] / "app" / "ai" / "fixtures"
    web = Path(__file__).resolve().parents[2] / "web" / "src" / "fixtures"
    for name in ("live_check.json", "chapter_review.json", "manuscript.json"):
        assert (api / name).read_bytes() == (web / name).read_bytes(), name


def test_ai_and_edit_conflicts_declare_conflict_out() -> None:
    # 409가 여러 종류(source_changed 등)인 곳은 latest가 선택인 ConflictOut(Codex 검수 11.21)
    spec = create_app().openapi()
    for path in ("/ai-suggestions/{suggestion_id}/apply", "/suggested-edits/{edit_id}/accept"):
        ref = spec["paths"][path]["post"]["responses"]["409"]["content"]["application/json"][
            "schema"
        ]["$ref"]
        assert ref.endswith("/ConflictOut"), path
    schema = spec["components"]["schemas"]["ConflictOut"]
    assert "latest" not in schema.get("required", [])
