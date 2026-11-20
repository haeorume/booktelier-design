"""F5 서버: AI 제안(A-16, A-17, A-19, A-20, A-21)과 S-07·S-08. DB 테스트. 데모 제공자(AI_PROVIDER=demo)."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ChapterRevision, StyleRule
from tests.helpers import Book, auth, make_book

pytestmark = pytest.mark.db


@pytest.fixture
def book(db_client: TestClient) -> Book:
    return make_book(db_client, sample=True)


def _chapter(c: TestClient, b: Book) -> dict[str, Any]:
    return dict(c.get(f"/chapters/{b.chapter_id}", headers=auth(b.author)).json())


def _para(doc: dict[str, Any], pid: str) -> str:
    p = next(p for p in doc["content"] if p["attrs"]["id"] == pid)
    return "".join(t["text"] for t in p.get("content", []))


def _live(c: TestClient, b: Book, version: int = 1) -> Any:
    return c.post(
        f"/chapters/{b.chapter_id}/live-check",
        json={"paragraph_ids": ["para_02"], "base_version": version},
        headers=auth(b.author),
    )


def test_sample_manuscript_starts_first_chapter(db_client: TestClient, book: Book) -> None:
    ch = _chapter(db_client, book)
    assert ch["title"] == "1장 파리에서 보낸 첫 주"
    assert "쏟아지는 것이 가능했고" in _para(ch["doc"], "para_02")


def test_live_check_is_only_for_the_owner_s07(db_client: TestClient, book: Book) -> None:
    res = _live(db_client, book)
    assert res.status_code == 200, res.text
    mine = res.json()
    assert [s["original"] for s in mine][:2] == ["쏟아지는 것이 가능했고", "한참동안"]
    me = db_client.get("/me", headers=auth(book.author)).json()
    assert {s["owner_participant_id"] for s in mine} == {me["participant_id"]}
    # 다른 사람(편집자)의 목록에는 오지 않아요(D-29, S-07)
    others = db_client.get(
        f"/chapters/{book.chapter_id}/ai-suggestions", headers=auth(book.editor)
    ).json()
    assert others == []
    # 남의 제안을 id로 직접 불러도 없는 것과 같아요
    sid = mine[0]["id"]
    res = db_client.post(f"/ai-suggestions/{sid}/dismiss", headers=auth(book.editor))
    assert res.status_code == 404


def test_live_check_twice_does_not_duplicate_and_dismissed_stays_away(
    db_client: TestClient, book: Book
) -> None:
    first = _live(db_client, book).json()
    again = _live(db_client, book).json()
    assert [s["id"] for s in again] == [s["id"] for s in first]
    db_client.post(f"/ai-suggestions/{first[0]['id']}/dismiss", headers=auth(book.author))
    third = _live(db_client, book).json()
    assert first[0]["id"] not in [s["id"] for s in third]  # FR-28 ②
    assert [s["original"] for s in third] == [s["original"] for s in first[1:]]


def test_live_check_needs_latest_version(db_client: TestClient, book: Book) -> None:
    res = _live(db_client, book, version=9)
    assert res.status_code == 409
    assert res.json()["latest"]["version"] == 1


def test_apply_changes_manuscript_on_server_s08(
    db_client: TestClient, db: Session, book: Book
) -> None:
    s = _live(db_client, book).json()[0]
    res = db_client.post(
        f"/ai-suggestions/{s['id']}/apply",
        json={"choice": 0, "base_version": 1},
        headers=auth(book.author),
    )
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["chapter_version"] == 2
    assert out["suggestion"]["status"] == "applied"
    text = _para(_chapter(db_client, book)["doc"], "para_02")
    assert "쏟아졌고" in text and "쏟아지는 것이 가능했고" not in text
    causes = db.scalars(
        select(ChapterRevision.cause).where(
            ChapterRevision.chapter_id == uuid.UUID(book.chapter_id)
        )
    ).all()
    assert list(causes) == ["ai_applied"]


def test_apply_alternative_and_stale_base_is_409(db_client: TestClient, book: Book) -> None:
    s = _live(db_client, book).json()[0]
    stale = db_client.post(
        f"/ai-suggestions/{s['id']}/apply",
        json={"choice": 1, "base_version": 7},
        headers=auth(book.author),
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "version_conflict"
    ok = db_client.post(
        f"/ai-suggestions/{s['id']}/apply",
        json={"choice": 1, "base_version": 1},
        headers=auth(book.author),
    )
    assert "쏟아져 내렸고" in _para(_chapter(db_client, book)["doc"], "para_02")
    assert ok.json()["chapter_version"] == 2


def test_undo_only_right_after_apply(db_client: TestClient, book: Book) -> None:
    s = _live(db_client, book).json()[0]
    h = auth(book.author)
    db_client.post(f"/ai-suggestions/{s['id']}/apply", json={"base_version": 1}, headers=h)
    res = db_client.post(f"/ai-suggestions/{s['id']}/undo", json={"base_version": 2}, headers=h)
    assert res.status_code == 200, res.text
    assert res.json()["chapter_version"] == 3
    assert res.json()["suggestion"]["status"] == "pending"
    assert "쏟아지는 것이 가능했고" in _para(_chapter(db_client, book)["doc"], "para_02")

    # 적용한 뒤 원고를 또 저장하면 실행 취소할 수 없어요(바로 앞 동작만, X-04)
    db_client.post(f"/ai-suggestions/{s['id']}/apply", json={"base_version": 3}, headers=h)
    doc = _chapter(db_client, book)["doc"]
    db_client.put(
        f"/chapters/{book.chapter_id}/doc", json={"doc": doc, "base_version": 4}, headers=h
    )
    late = db_client.post(f"/ai-suggestions/{s['id']}/undo", json={"base_version": 5}, headers=h)
    assert late.status_code == 409
    assert late.json()["code"] == "undo_unavailable"


def test_lost_source_becomes_stale_on_read(db_client: TestClient, book: Book) -> None:
    s = _live(db_client, book).json()[0]
    doc = _chapter(db_client, book)["doc"]
    for p in doc["content"]:
        if p["attrs"]["id"] == "para_02":
            p["content"] = [{"type": "text", "text": "완전히 다른 문단"}]
    db_client.put(
        f"/chapters/{book.chapter_id}/doc",
        json={"doc": doc, "base_version": 1},
        headers=auth(book.author),
    )
    mine = db_client.get(
        f"/chapters/{book.chapter_id}/ai-suggestions", headers=auth(book.author)
    ).json()
    assert next(x for x in mine if x["id"] == s["id"])["status"] == "stale"


def test_keep_adds_style_rule(db_client: TestClient, db: Session, book: Book) -> None:
    s = _live(db_client, book).json()[1]
    res = db_client.post(f"/ai-suggestions/{s['id']}/keep", headers=auth(book.author))
    assert res.json()["suggestion"]["status"] == "stale"
    rules = db.scalars(
        select(StyleRule).where(StyleRule.project_id == uuid.UUID(book.project_id))
    ).all()
    assert [(r.type, r.text) for r in rules] == [("keep", "한참동안")]


def _review(c: TestClient, b: Book, token: str) -> Any:
    return c.post(f"/chapters/{b.chapter_id}/review", json={"base_version": 1}, headers=auth(token))


def test_chapter_review_by_editor_only(db_client: TestClient, book: Book) -> None:
    assert _review(db_client, book, book.author).status_code == 403
    res = _review(db_client, book, book.editor)
    assert res.status_code == 200, res.text
    data = res.json()
    assert sum(data["summary"].values()) == len(data["suggestions"]) > 0
    # 결과는 실행한 편집자에게만(FR-21 ③)
    assert (
        db_client.get(
            f"/chapters/{book.chapter_id}/ai-suggestions", headers=auth(book.author)
        ).json()
        == []
    )


def test_send_as_suggested_edit_is_one_card_then_accept_merges(
    db_client: TestClient, book: Book
) -> None:
    s = _review(db_client, book, book.editor).json()["suggestions"][0]
    res = db_client.post(
        f"/ai-suggestions/{s['id']}/send",
        json={"as": "suggested_edit", "text": "띄어 써 주세요", "choice": 0},
        headers=auth(book.editor),
    )
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["comment"] is None  # 설명용 의견 없음(FR-29 ⑤)
    edit = out["suggested_edit"]
    assert (edit["reason"], edit["kind"], edit["ai_origin_id"]) == (
        "띄어 써 주세요",
        s["kind"],
        s["id"],
    )
    assert out["suggestion"]["status"] == "sent"

    shared = db_client.get(f"/chapters/{book.chapter_id}/shared", headers=auth(book.author)).json()
    assert [e["id"] for e in shared["suggested_edits"]] == [edit["id"]]
    assert shared["comments"] == []

    assert (
        db_client.post(
            f"/suggested-edits/{edit['id']}/accept",
            json={"base_version": 1},
            headers=auth(book.editor),
        ).status_code
        == 403
    )
    acc = db_client.post(
        f"/suggested-edits/{edit['id']}/accept", json={"base_version": 1}, headers=auth(book.author)
    )
    assert acc.status_code == 200, acc.text
    assert acc.json()["chapter_version"] == 2
    assert acc.json()["merged_ai_suggestion_id"] == s["id"]
    text = _para(_chapter(db_client, book)["doc"], s["anchor"]["paragraph_id"])
    assert s["replacement"] in text
    mine = db_client.get(
        f"/chapters/{book.chapter_id}/ai-suggestions", headers=auth(book.editor)
    ).json()
    assert next(x for x in mine if x["id"] == s["id"])["status"] == "merged"


def test_send_as_comment_and_author_cannot_send(db_client: TestClient, book: Book) -> None:
    s = _review(db_client, book, book.editor).json()["suggestions"][0]
    res = db_client.post(
        f"/ai-suggestions/{s['id']}/send",
        json={"as": "comment", "text": "확인해 주세요"},
        headers=auth(book.editor),
    )
    assert res.json()["comment"]["body"] == "확인해 주세요"
    assert res.json()["suggested_edit"] is None
    again = db_client.post(
        f"/ai-suggestions/{s['id']}/send",
        json={"as": "comment", "text": "또"},
        headers=auth(book.editor),
    )
    assert again.status_code == 409  # 다시 보낼 수 없어요(FR-29 ③)
    a = _live(db_client, book).json()[0]
    blocked = db_client.post(
        f"/ai-suggestions/{a['id']}/send",
        json={"as": "comment", "text": "x"},
        headers=auth(book.author),
    )
    assert blocked.status_code == 403  # 작가 카드에는 보내기 없음(FR-29 ④)
