"""F3 서버: 책 열기·장·원고 저장·상태·조판·검토본(A-10~A-15, A-29)과 S-06. DB 테스트."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ChapterRevision
from tests.helpers import Book, auth, make_book

pytestmark = pytest.mark.db

DOC: dict[str, Any] = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "attrs": {"id": "p1"},
            "content": [{"type": "text", "text": "첫 문단"}],
        }
    ],
}


@pytest.fixture
def book(db_client: TestClient) -> Book:
    return make_book(db_client)


def _save(c: TestClient, b: Book, base: int, doc: dict[str, Any] = DOC) -> Any:
    return c.put(
        f"/chapters/{b.chapter_id}/doc",
        json={"doc": doc, "base_version": base},
        headers=auth(b.author),
    )


# ---- A-02 템플릿 기본값 · A-10 책 열기 ----


def test_new_project_gets_template_layout(db_client: TestClient, book: Book) -> None:
    data = db_client.get(f"/projects/{book.project_id}", headers=auth(book.author)).json()
    layout = data["project"]["layout"]
    assert data["project"]["template_id"] == "essay"
    assert layout["trim"] == "148x210"
    assert layout["margin"] == {"top": 20, "bottom": 22, "inner": 20, "outer": 16}
    assert layout["font_family"] == "Noto Serif KR"
    assert layout["running"]["left"]["header"] == "book_title"
    assert [c["id"] for c in data["chapters"]] == [book.chapter_id]
    assert "doc" not in data["chapters"][0]
    assert sorted(p["role"] for p in data["participants"]) == ["author", "designer", "editor"]


# ---- A-11 · A-12 · S-06 ----


def test_save_doc_bumps_version_and_keeps_revision(
    db_client: TestClient, db: Session, book: Book
) -> None:
    res = _save(db_client, book, 1)
    assert res.status_code == 200, res.text
    assert res.json()["version"] == 2
    ch = db_client.get(f"/chapters/{book.chapter_id}", headers=auth(book.editor)).json()
    assert ch["version"] == 2
    assert ch["doc"] == DOC
    revs = db.scalars(
        select(ChapterRevision).where(ChapterRevision.chapter_id == uuid.UUID(book.chapter_id))
    ).all()
    assert [(r.version, r.cause) for r in revs] == [(2, "typing")]


def test_s06_stale_base_version_is_409_with_latest(db_client: TestClient, book: Book) -> None:
    assert _save(db_client, book, 1).status_code == 200
    other = {"type": "doc", "content": []}
    res = _save(db_client, book, 1, other)  # 다른 브라우저가 옛 버전으로 저장
    assert res.status_code == 409
    data = res.json()
    assert data["code"] == "version_conflict"
    assert data["latest"]["version"] == 2
    assert data["latest"]["doc"] == DOC  # 덮어쓰지 않았어요
    # 최신 버전으로 다시 보내면 저장돼요
    assert _save(db_client, book, 2, other).json()["version"] == 3


def test_editor_cannot_edit_manuscript(db_client: TestClient, book: Book) -> None:
    res = db_client.put(
        f"/chapters/{book.chapter_id}/doc",
        json={"doc": DOC, "base_version": 1},
        headers=auth(book.editor),
    )
    assert res.status_code == 403  # D-14


def test_other_project_chapter_is_403(db_client: TestClient, book: Book) -> None:
    other = make_book(db_client, "남의 책")
    h = auth(book.author)
    assert db_client.get(f"/chapters/{other.chapter_id}", headers=h).status_code == 403
    res = db_client.put(
        f"/chapters/{other.chapter_id}/doc",
        json={"doc": DOC, "base_version": 1},
        headers=h,
    )
    assert res.status_code == 403
    assert db_client.get(f"/chapters/{uuid.uuid4()}", headers=h).status_code == 404


# ---- A-13 장 추가 ----


def test_add_chapter_goes_last(db_client: TestClient, book: Book) -> None:
    ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    a = db_client.post(
        f"/projects/{book.project_id}/chapters",
        json={"id": ids[0], "title": "2장"},
        headers=auth(book.author),
    ).json()
    b = db_client.post(
        f"/projects/{book.project_id}/chapters",
        json={"id": ids[1], "title": "3장"},
        headers=auth(book.editor),
    ).json()
    assert (a["order"], b["order"]) == (2, 3)
    assert a["version"] == 1 and a["doc"] == {"type": "doc", "content": []}
    again = db_client.post(
        f"/projects/{book.project_id}/chapters",
        json={"id": ids[0], "title": "또"},
        headers=auth(book.editor),
    )
    assert again.status_code == 409
    listed = db_client.get(f"/projects/{book.project_id}", headers=auth(book.editor)).json()
    assert [c["title"] for c in listed["chapters"]] == ["1장", "2장", "3장"]


# ---- A-14 장 상태 ----


def _status(c: TestClient, b: Book, token: str, to: str) -> Any:
    return c.post(f"/chapters/{b.chapter_id}/status", json={"to": to}, headers=auth(token))


def test_chapter_status_flow(db_client: TestClient, book: Book) -> None:
    assert _status(db_client, book, book.editor, "review_requested").status_code == 403
    res = _status(db_client, book, book.author, "review_requested")
    assert res.json()["status"] == "review_requested"
    assert res.json()["status_changed_at"]
    assert _status(db_client, book, book.author, "reviewed").status_code == 403
    assert _status(db_client, book, book.editor, "reviewed").json()["status"] == "reviewed"
    # 검토 완료 뒤에도 작가가 다시 요청할 수 있고(FR-13 ①), 편집자는 다시 열 수 있어요
    assert _status(db_client, book, book.editor, "editing").json()["status"] == "editing"


def test_invalid_transition_is_409(db_client: TestClient, book: Book) -> None:
    res = _status(db_client, book, book.editor, "reviewed")  # 수정 중 → 검토 완료는 없음
    assert res.status_code == 409
    assert res.json()["code"] == "invalid_transition"


# ---- A-15 조판 값 ----


def _layout(c: TestClient, b: Book, token: str, body: dict[str, Any]) -> Any:
    return c.patch(f"/projects/{b.project_id}/layout", json=body, headers=auth(token))


def test_layout_patch_merges_and_records_who(db_client: TestClient, book: Book) -> None:
    res = _layout(db_client, book, book.designer, {"layout": {"margin": {"top": 25}}})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["layout"]["margin"] == {"top": 25, "bottom": 22, "inner": 20, "outer": 16}
    assert data["layout"]["line_height"] == 1.8
    me = db_client.get("/me", headers=auth(book.designer)).json()
    assert data["layout_updated_by"] == me["participant_id"]
    # 다른 역할 화면에서 다시 읽어도 같아요(FR-16 ②)
    again = db_client.get(f"/projects/{book.project_id}", headers=auth(book.author)).json()
    assert again["project"]["layout"]["margin"]["top"] == 25


def test_template_change_resets_layout(db_client: TestClient, book: Book) -> None:
    _layout(db_client, book, book.editor, {"layout": {"line_height": 2.2}})
    data = _layout(db_client, book, book.editor, {"template_id": "practical"}).json()
    assert data["template_id"] == "practical"
    assert data["layout"]["trim"] == "152x225"
    assert data["layout"]["line_height"] == 1.65  # FR-16 ④
    assert data["layout"]["font_family"] == "Noto Sans KR"


def test_author_cannot_change_layout(db_client: TestClient, book: Book) -> None:
    assert _layout(db_client, book, book.author, {"layout": {"font_size": 12}}).status_code == 403


def test_running_side_merges_and_page_number_values(db_client: TestClient, book: Book) -> None:
    # FR-44 ②: 왼쪽 쪽만 바꿔도 오른쪽은 그대로. 쪽 번호 위치는 세 값만(F7)
    patch = {"layout": {"running": {"left": {"page_number": "none", "header": "none"}}}}
    res = _layout(db_client, book, book.designer, patch)
    assert res.status_code == 200, res.text
    running = res.json()["layout"]["running"]
    assert running["left"] == {"page_number": "none", "header": "none"}
    assert running["right"] == {"page_number": "bottom_outer", "header": "chapter_title"}
    bad = {"layout": {"running": {"right": {"page_number": "top_left"}}}}
    assert _layout(db_client, book, book.designer, bad).status_code == 422


# ---- A-29 검토본 ----


def test_snapshot_copies_current_doc(db_client: TestClient, book: Book) -> None:
    _save(db_client, book, 1)
    made = db_client.post(
        f"/chapters/{book.chapter_id}/snapshots",
        json={"label": "1차 검토"},
        headers=auth(book.editor),
    )
    assert made.status_code == 201, made.text
    snap = made.json()
    assert (snap["version"], snap["label"], snap["doc"]) == (2, "1차 검토", DOC)
    # 원고를 더 고쳐도 검토본은 그대로
    _save(db_client, book, 2, {"type": "doc", "content": []})
    listed = db_client.get(
        f"/chapters/{book.chapter_id}/snapshots", headers=auth(book.designer)
    ).json()
    assert [s["id"] for s in listed] == [snap["id"]]
    assert "doc" not in listed[0]
    one = db_client.get(f"/snapshots/{snap['id']}", headers=auth(book.author)).json()
    assert one["doc"] == DOC


def test_snapshot_of_other_project_is_403(db_client: TestClient, book: Book) -> None:
    other = make_book(db_client, "남의 책")
    snap = db_client.post(
        f"/chapters/{other.chapter_id}/snapshots",
        json={"label": "x"},
        headers=auth(other.editor),
    ).json()
    assert db_client.get(f"/snapshots/{snap['id']}", headers=auth(book.editor)).status_code == 403


# ---- Codex 검수(11.21): 저장 응답 버전, 조판 합치기 ----


def test_save_response_is_this_requests_version(
    db_client: TestClient, db: Session, book: Book
) -> None:
    first = _save(db_client, book, 1).json()
    second = _save(db_client, book, 2, {"type": "doc", "content": []}).json()
    assert (first["version"], second["version"]) == (2, 3)
    rev = db.scalars(
        select(ChapterRevision).where(
            ChapterRevision.chapter_id == uuid.UUID(book.chapter_id), ChapterRevision.version == 2
        )
    ).one()
    assert rev.doc == DOC  # 응답의 버전 2는 첫 요청이 저장한 원고예요


def test_layout_patch_after_template_change_keeps_new_template(
    db_client: TestClient, book: Book
) -> None:
    _layout(db_client, book, book.editor, {"template_id": "novel"})
    data = _layout(db_client, book, book.designer, {"layout": {"font_size": 11}}).json()
    assert data["template_id"] == "novel"
    assert data["layout"]["trim"] == "127x188"  # 옛 템플릿(에세이) 값이 섞이지 않아요
    assert data["layout"]["font_size"] == 11
    again = db_client.get(f"/projects/{book.project_id}", headers=auth(book.author)).json()
    assert again["project"]["template_id"] == "novel"
    assert again["project"]["layout"]["font_size"] == 11


def test_layout_text_align_is_saved_and_validated(db_client: TestClient, book: Book) -> None:
    """본문 정렬(FR-16 ⑥, D-41): 편집자·디자이너가 바꾸고, 넷 밖의 값은 막아요. 작가는 못 바꿔요."""
    data = _layout(db_client, book, book.designer, {"layout": {"text_align": "justify"}}).json()
    assert data["layout"]["text_align"] == "justify"
    again = db_client.get(f"/projects/{book.project_id}", headers=auth(book.author)).json()
    assert again["project"]["layout"]["text_align"] == "justify"
    bad = _layout(db_client, book, book.editor, {"layout": {"text_align": "middle"}})
    assert bad.status_code == 422
    denied = _layout(db_client, book, book.author, {"layout": {"text_align": "center"}})
    assert denied.status_code == 403
