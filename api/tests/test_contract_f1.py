"""F1 첫 조각: A-01~A-15 계약(가짜 응답, D-25).

실제 구현(토큰 해시, 책 범위 403, S-01~S-05)은 F1 두 번째 조각에서 DB 테스트로 더해요.
여기서는 계약 모양과, 가짜 응답이어도 지키는 약속(토큰 없음 401, 오류 모양, 409의 latest)만 봐요.
"""

import re
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

PROJECT = "0b9f6c2e-7d41-4a8e-9c53-1f2e3d4a5b6c"
CHAPTER = "3f1c9a52-6b0e-4d7a-9e21-5c8b7a0d4e11"
INVITE = "d1a5f3b8-7c2e-4a90-b6d4-e8f0c2a7b315"
AUTH = {"Authorization": "Bearer anything"}

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
    # C-3·D-35: 오류는 늘 { code, message }. A-12의 409만 latest를 더 실어요.
    spec = create_app().openapi()
    allowed = {"#/components/schemas/ErrorOut", "#/components/schemas/VersionConflictOut"}
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


@pytest.mark.parametrize(("method", "path", "body"), PROTECTED)
def test_with_token_answers(
    client: TestClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    res = client.request(method, path, json=body, headers=AUTH)
    assert res.status_code < 300, res.text


def test_save_doc_conflict_returns_latest(client: TestClient) -> None:
    body = {"doc": {"type": "doc", "content": []}, "base_version": 1}
    res = client.put(f"/chapters/{CHAPTER}/doc", json=body, headers=AUTH)
    assert res.status_code == 409
    data = res.json()
    assert data["code"] == "version_conflict"
    assert data["message"]
    assert data["latest"]["id"] == CHAPTER
    assert data["latest"]["version"] == 3


def test_create_project_gives_token_once(client: TestClient) -> None:
    body = {
        "id": PROJECT,
        "title": "새 책",
        "template_id": "novel",
        "first_chapter_id": CHAPTER,
    }
    res = client.post("/projects", json=body)
    assert res.status_code == 201
    data = res.json()
    assert data["project"]["title"] == "새 책"
    assert data["editor_token"]
    assert "/e/" in data["editor_url"]


def test_empty_title_is_rejected(client: TestClient) -> None:
    body = {"id": PROJECT, "title": "", "template_id": "novel", "first_chapter_id": CHAPTER}
    res = client.post("/projects", json=body)
    assert res.status_code == 422
    assert res.json()["code"] == "invalid_request"


def test_unusable_invite(client: TestClient) -> None:
    assert client.get("/invites/revoked").json()["state"] == "unusable"
    res = client.post(
        "/invites/revoked/join",
        json={"display_name": "김작가", "anon_id": "5b1d9f2a-8c3e-4a7b-b6d0-e2f4a8c1d593"},
    )
    assert res.status_code == 404
    assert res.json()["code"] == "invite_unusable"


def test_invite_list_has_copyable_url(client: TestClient) -> None:
    # D-37: 편집자는 언제든 다시 복사할 수 있어요.
    res = client.get(f"/projects/{PROJECT}/invites", headers=AUTH)
    assert all("/j/" in i["url"] for i in res.json())
