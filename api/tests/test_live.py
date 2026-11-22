"""F4 함께 작업(A-30, A-31). 접속자·작업 위치, since 뒤에 바뀐 것. DB 테스트."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.db.models import Chapter, Comment, Participant, Project
from tests.helpers import Book, auth, make_book

pytestmark = pytest.mark.db

ANCHOR = {"paragraph_id": "para_02", "start": 85, "end": 89}  # "한참동안"(예시 원고)
LONG_AGO = datetime(2026, 1, 1, tzinfo=UTC)


@pytest.fixture
def book(db_client: TestClient) -> Book:
    return make_book(db_client, sample=True)


def _changes(c: TestClient, b: Book, token: str, since: str | None = None) -> dict[str, Any]:
    params = {"since": since} if since else None
    res = c.get(f"/projects/{b.project_id}/changes", params=params, headers=auth(token))
    assert res.status_code == 200, res.text
    return dict(res.json())


def _here(c: TestClient, b: Book, token: str, paragraph_id: str | None = "para_02") -> None:
    res = c.post(
        f"/projects/{b.project_id}/presence",
        json={"chapter_id": b.chapter_id, "paragraph_id": paragraph_id},
        headers=auth(token),
    )
    assert res.status_code == 204, res.text


def _age_everything(db: Session, b: Book) -> None:
    """책의 시각을 오래전으로 돌려, since 뒤에 바뀐 것만 오는지 볼 수 있게 해요."""
    pid = uuid.UUID(b.project_id)
    db.execute(
        update(Chapter)
        .where(Chapter.project_id == pid)
        .values(updated_at=LONG_AGO, status_changed_at=None)
    )
    db.execute(update(Project).where(Project.id == pid).values(layout_updated_at=LONG_AGO))
    db.execute(
        update(Comment)
        .where(Comment.chapter_id == uuid.UUID(b.chapter_id))
        .values(updated_at=LONG_AGO)
    )
    db.flush()


def test_first_call_returns_every_chapter_and_layout(db_client: TestClient, book: Book) -> None:
    data = _changes(db_client, book, book.designer)
    assert [ch["id"] for ch in data["chapters"]] == [book.chapter_id]
    assert "doc" not in data["chapters"][0]
    assert data["layout"] is not None
    assert data["cursor"]


def test_presence_shows_others_not_me(db_client: TestClient, book: Book) -> None:
    _here(db_client, book, book.author)
    _here(db_client, book, book.designer, None)
    seen = _changes(db_client, book, book.editor)["presence"]
    assert {(p["role"], p["chapter_id"], p["paragraph_id"]) for p in seen} == {
        ("author", book.chapter_id, "para_02"),
        ("designer", book.chapter_id, None),
    }
    mine = _changes(db_client, book, book.author)["presence"]
    assert [p["role"] for p in mine] == ["designer"]


def test_joined_but_never_reported_is_not_present(db_client: TestClient, book: Book) -> None:
    # 링크로 들어온 것만으로는 작업 공간을 연 것이 아니에요
    assert _changes(db_client, book, book.editor)["presence"] == []


def test_presence_expires_after_ttl(db_client: TestClient, db: Session, book: Book) -> None:
    _here(db_client, book, book.author)
    db.execute(
        update(Participant)
        .where(Participant.project_id == uuid.UUID(book.project_id))
        .values(last_seen_at=datetime.now(UTC) - timedelta(seconds=31))
    )
    db.flush()
    assert _changes(db_client, book, book.editor)["presence"] == []


def test_presence_on_other_books_chapter_is_404(db_client: TestClient, book: Book) -> None:
    other = make_book(db_client, "다른 책")
    res = db_client.post(
        f"/projects/{book.project_id}/presence",
        json={"chapter_id": other.chapter_id},
        headers=auth(book.author),
    )
    assert res.status_code == 404


def test_changes_of_other_book_is_403(db_client: TestClient, book: Book) -> None:
    other = make_book(db_client, "다른 책")
    res = db_client.get(f"/projects/{other.project_id}/changes", headers=auth(book.author))
    assert res.status_code == 403


def test_nothing_changed_since_cursor(db_client: TestClient, db: Session, book: Book) -> None:
    _age_everything(db, book)
    data = _changes(db_client, book, book.editor, since=datetime.now(UTC).isoformat())
    assert data["chapters"] == []
    assert data["shared_chapter_ids"] == []
    assert data["layout"] is None


def test_saved_doc_and_new_chapter_come_after_since(
    db_client: TestClient, db: Session, book: Book
) -> None:
    _age_everything(db, book)
    since = _changes(db_client, book, book.editor)["cursor"]
    ch = db_client.get(f"/chapters/{book.chapter_id}", headers=auth(book.author)).json()
    saved = db_client.put(
        f"/chapters/{book.chapter_id}/doc",
        json={"doc": ch["doc"], "base_version": ch["version"]},
        headers=auth(book.author),
    )
    assert saved.status_code == 200, saved.text
    new_id = str(uuid.uuid4())
    made = db_client.post(
        f"/projects/{book.project_id}/chapters",
        json={"id": new_id, "title": "2장"},
        headers=auth(book.author),
    )
    assert made.status_code == 201, made.text
    data = _changes(db_client, book, book.editor, since=since)
    got = {c["id"]: c["version"] for c in data["chapters"]}
    assert got == {book.chapter_id: ch["version"] + 1, new_id: 1}


def test_status_change_comes_after_since(db_client: TestClient, db: Session, book: Book) -> None:
    _age_everything(db, book)
    since = datetime.now(UTC).isoformat()
    res = db_client.post(
        f"/chapters/{book.chapter_id}/status",
        json={"to": "review_requested"},
        headers=auth(book.author),
    )
    assert res.status_code == 200, res.text
    data = _changes(db_client, book, book.editor, since=since)
    assert [(c["id"], c["status"]) for c in data["chapters"]] == [
        (book.chapter_id, "review_requested")
    ]


def test_comment_and_reopen_mark_chapter(db_client: TestClient, db: Session, book: Book) -> None:
    since = datetime.now(UTC).isoformat()
    made = db_client.post(
        f"/chapters/{book.chapter_id}/comments",
        json={
            "id": str(uuid.uuid4()),
            "body": "봐 주세요",
            "anchor": ANCHOR,
            "original": "한참동안",
        },
        headers=auth(book.designer),
    )
    assert made.status_code == 201, made.text
    assert _changes(db_client, book, book.author, since=since)["shared_chapter_ids"] == [
        book.chapter_id
    ]
    cid = made.json()["id"]
    db_client.post(f"/comments/{cid}/resolve", headers=auth(book.designer))
    _age_everything(db, book)
    assert _changes(db_client, book, book.author, since=since)["shared_chapter_ids"] == []
    # '다시 열기'는 resolved_at을 지우지만 updated_at으로 잡아요
    res = db_client.post(f"/comments/{cid}/reopen", headers=auth(book.designer))
    assert res.status_code == 200, res.text
    assert _changes(db_client, book, book.author, since=since)["shared_chapter_ids"] == [
        book.chapter_id
    ]


def test_unsent_ai_suggestions_do_not_show(db_client: TestClient, db: Session, book: Book) -> None:
    # D-29: 편집자의 장 검토 결과(보내기 전)는 작가의 바뀐 것에 나오지 않아요
    _age_everything(db, book)
    since = datetime.now(UTC).isoformat()
    ch = db_client.get(f"/chapters/{book.chapter_id}", headers=auth(book.editor)).json()
    res = db_client.post(
        f"/chapters/{book.chapter_id}/review",
        json={"base_version": ch["version"]},
        headers=auth(book.editor),
    )
    assert res.status_code == 200, res.text
    data = _changes(db_client, book, book.author, since=since)
    assert data["shared_chapter_ids"] == []
    assert data["chapters"] == []
