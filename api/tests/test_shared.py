"""F5 서버: 의견·수정 제안·처음 본 기록·표기 원칙(A-22~A-28). DB 테스트."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import FirstView
from tests.helpers import Book, auth, make_book

pytestmark = pytest.mark.db

ANCHOR = {"paragraph_id": "para_02", "start": 85, "end": 89}  # "한참동안"(예시 원고)


@pytest.fixture
def book(db_client: TestClient) -> Book:
    return make_book(db_client, sample=True)


def _comment(c: TestClient, b: Book, token: str, **extra: Any) -> Any:
    body = {
        "id": str(uuid.uuid4()),
        "body": "여기 봐 주세요",
        "anchor": ANCHOR,
        "original": "한참동안",
        **extra,
    }
    return c.post(f"/chapters/{b.chapter_id}/comments", json=body, headers=auth(token))


def _shared(c: TestClient, b: Book, token: str, query: str = "") -> dict[str, Any]:
    return dict(c.get(f"/chapters/{b.chapter_id}/shared{query}", headers=auth(token)).json())


def test_everyone_comments_and_replies(db_client: TestClient, book: Book) -> None:
    root = _comment(db_client, book, book.designer)
    assert root.status_code == 201, root.text
    reply = db_client.post(
        f"/chapters/{book.chapter_id}/comments",
        json={"id": str(uuid.uuid4()), "body": "네", "parent_id": root.json()["id"]},
        headers=auth(book.author),
    )
    assert reply.status_code == 201
    assert reply.json()["anchor"] is None
    data = _shared(db_client, book, book.editor)
    assert [c["body"] for c in data["comments"]] == ["여기 봐 주세요", "네"]


def test_comment_on_missing_text_is_409(db_client: TestClient, book: Book) -> None:
    res = _comment(db_client, book, book.author, original="없는 글자")
    assert res.status_code == 409


def test_resolve_reopen_by_author_or_editor_and_filter(db_client: TestClient, book: Book) -> None:
    cid = _comment(db_client, book, book.designer).json()["id"]
    assert (
        db_client.post(f"/comments/{cid}/resolve", headers=auth(book.author)).status_code == 403
    )  # Q-21
    res = db_client.post(f"/comments/{cid}/resolve", headers=auth(book.editor))
    me = db_client.get("/me", headers=auth(book.editor)).json()
    assert res.json()["status"] == "resolved"
    assert res.json()["resolved_by"] == me["participant_id"]
    assert _shared(db_client, book, book.author, "?status=open")["comments"] == []
    assert len(_shared(db_client, book, book.author, "?status=all")["comments"]) == 1
    again = db_client.post(f"/comments/{cid}/reopen", headers=auth(book.designer))
    assert again.json()["status"] == "open"
    assert again.json()["resolved_by"] is None


def _edit(c: TestClient, b: Book, token: str) -> Any:
    body = {
        "id": str(uuid.uuid4()),
        "anchor": ANCHOR,
        "original": "한참동안",
        "replacement": "한참 동안",
        "reason": "띄어 써요",
        "kind": "spacing",
    }
    return c.post(f"/chapters/{b.chapter_id}/suggested-edits", json=body, headers=auth(token))


def test_direct_edit_by_editor_then_reject_keeps_text(db_client: TestClient, book: Book) -> None:
    assert _edit(db_client, book, book.author).status_code == 403  # FR-33
    edit = _edit(db_client, book, book.editor).json()
    assert (edit["reason"], edit["kind"], edit["status"]) == ("띄어 써요", "spacing", "pending")
    res = db_client.post(f"/suggested-edits/{edit['id']}/reject", headers=auth(book.author))
    assert res.json()["status"] == "rejected"
    ch = db_client.get(f"/chapters/{book.chapter_id}", headers=auth(book.author)).json()
    assert ch["version"] == 1  # 원고는 그대로(FR-35)


def test_accept_with_stale_base_is_409_and_type_filter(db_client: TestClient, book: Book) -> None:
    edit = _edit(db_client, book, book.editor).json()
    _comment(db_client, book, book.designer)
    res = db_client.post(
        f"/suggested-edits/{edit['id']}/accept", json={"base_version": 5}, headers=auth(book.author)
    )
    assert res.status_code == 409
    assert res.json()["latest"]["version"] == 1
    only = _shared(db_client, book, book.author, "?type=suggested_edit")
    assert only["comments"] == [] and len(only["suggested_edits"]) == 1


def test_edit_whose_source_was_deleted(db_client: TestClient, book: Book) -> None:
    edit = _edit(db_client, book, book.editor).json()
    ch = db_client.get(f"/chapters/{book.chapter_id}", headers=auth(book.author)).json()
    for p in ch["doc"]["content"]:
        if p["attrs"]["id"] == "para_02":
            p["content"] = [{"type": "text", "text": "다른 글"}]
    db_client.put(
        f"/chapters/{book.chapter_id}/doc",
        json={"doc": ch["doc"], "base_version": 1},
        headers=auth(book.author),
    )
    edits = _shared(db_client, book, book.author)["suggested_edits"]
    assert [e["status"] for e in edits if e["id"] == edit["id"]] == ["source_deleted"]


def test_first_view_once_and_todo_count(db_client: TestClient, db: Session, book: Book) -> None:
    cid = _comment(db_client, book, book.author).json()["id"]
    card = db_client.post("/projects/list", json={"editor_tokens": [book.editor]}).json()[0]
    assert card["todo_count"] == 1
    for _ in range(2):
        res = db_client.post(
            "/views", json={"target_type": "comment", "target_id": cid}, headers=auth(book.editor)
        )
        assert res.status_code == 204
    n = db.scalar(
        select(func.count()).select_from(FirstView).where(FirstView.target_id == uuid.UUID(cid))
    )
    assert n == 1
    assert _shared(db_client, book, book.editor)["seen"] == [cid]
    assert _shared(db_client, book, book.author)["seen"] == []  # 본 기록은 사람마다
    card = db_client.post("/projects/list", json={"editor_tokens": [book.editor]}).json()[0]
    assert card["todo_count"] == 0


def test_view_of_other_project_is_403(db_client: TestClient, book: Book) -> None:
    other = make_book(db_client, "남의 책", sample=True)
    cid = _comment(db_client, other, other.author).json()["id"]
    res = db_client.post(
        "/views", json={"target_type": "comment", "target_id": cid}, headers=auth(book.editor)
    )
    assert res.status_code == 403


def test_style_rules(db_client: TestClient, book: Book) -> None:
    res = db_client.post(
        f"/projects/{book.project_id}/style-rules",
        json={"type": "rule", "text": "루브르"},
        headers=auth(book.designer),
    )
    assert res.status_code == 201
    rules = db_client.get(
        f"/projects/{book.project_id}/style-rules", headers=auth(book.author)
    ).json()
    assert [(r["type"], r["text"]) for r in rules] == [("rule", "루브르")]


# ---- Codex 검수(11.21): 처리된 제안 다시 처리, 의견 위치 저장 ----


def test_reject_after_accept_is_409(db_client: TestClient, book: Book) -> None:
    edit = _edit(db_client, book, book.editor).json()
    h = auth(book.author)
    assert (
        db_client.post(
            f"/suggested-edits/{edit['id']}/accept", json={"base_version": 1}, headers=h
        ).status_code
        == 200
    )
    late = db_client.post(f"/suggested-edits/{edit['id']}/reject", headers=h)
    assert late.status_code == 409
    assert late.json()["code"] == "invalid_transition"
    assert "latest" not in late.json()
    shared = _shared(db_client, book, book.author)
    assert [e["status"] for e in shared["suggested_edits"]] == ["accepted"]


def test_comment_anchor_follows_through_repeated_phrase(db_client: TestClient, book: Book) -> None:
    # 같은 문구가 문단에 두 번 있을 때 뒤쪽에 단 의견은, 앞에 글을 두 번 더해도 뒤쪽 문구를 따라가요(NFR-05 ①)
    h = auth(book.author)
    ch = db_client.get(f"/chapters/{book.chapter_id}", headers=h).json()
    doc = ch["doc"]
    phrase = "같은 말"
    head = "가" * 10
    for p in doc["content"]:
        if p["attrs"]["id"] == "para_01":
            p["content"] = [{"type": "text", "text": head + phrase + "가" * 30 + phrase}]
    version = db_client.put(
        f"/chapters/{book.chapter_id}/doc", json={"doc": doc, "base_version": 1}, headers=h
    ).json()["version"]
    second = 10 + len(phrase) + 30
    cid = db_client.post(
        f"/chapters/{book.chapter_id}/comments",
        json={
            "id": str(uuid.uuid4()),
            "body": "뒤쪽",
            "anchor": {"paragraph_id": "para_01", "start": second, "end": second + len(phrase)},
            "original": phrase,
        },
        headers=auth(book.editor),
    ).json()["id"]
    for _ in range(2):
        for p in doc["content"]:
            if p["attrs"]["id"] == "para_01":
                p["content"] = [{"type": "text", "text": "나" * 15 + p["content"][0]["text"]}]
        version = db_client.put(
            f"/chapters/{book.chapter_id}/doc",
            json={"doc": doc, "base_version": version},
            headers=h,
        ).json()["version"]
        _shared(db_client, book, book.editor)  # 읽을 때 새 자리를 저장해요
    c = next(x for x in _shared(db_client, book, book.editor)["comments"] if x["id"] == cid)
    assert c["anchor"]["start"] == second + 30
