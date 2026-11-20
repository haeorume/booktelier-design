"""F1 신원·초대 링크(A-01~A-09)와 서버 점검 S-01~S-05. 실제 Postgres가 필요해요(@pytest.mark.db)."""

import hashlib
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Participant, RoleLink
from tests.helpers import Book
from tests.helpers import auth as _auth
from tests.helpers import make_book as _make_book
from tests.helpers import token_in as _token_in

pytestmark = pytest.mark.db


@pytest.fixture
def book(db_client: TestClient) -> Book:
    return _make_book(db_client)


# ---- A-02 · A-01 · A-03 ----


def test_create_project_makes_empty_first_chapter_and_editor(db_client: TestClient) -> None:
    pid, cid = str(uuid.uuid4()), str(uuid.uuid4())
    res = db_client.post(
        "/projects",
        json={
            "id": pid,
            "title": "  새 책  ",
            "template_id": "novel",
            "first_chapter_id": cid,
            "anon_id": str(uuid.uuid4()),
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["project"]["title"] == "새 책"
    assert data["chapter"] == data["chapter"] | {
        "id": cid,
        "order": 1,
        "title": "1장",
        "version": 1,
        "status": "editing",
    }
    assert data["chapter"]["doc"] == {"type": "doc", "content": []}  # 빈 첫 장(FR-01 ①)
    assert data["participant"]["role"] == "editor"
    assert data["editor_url"].endswith("/e/" + data["editor_token"])

    me = db_client.get("/me", headers=_auth(data["editor_token"])).json()
    assert me == {
        "kind": "editor",
        "participant_id": data["participant"]["id"],
        "role": "editor",
        "display_name": "편집자",
        "project_id": pid,
    }


def test_duplicate_project_id_is_409(db_client: TestClient, book: Book) -> None:
    res = db_client.post(
        "/projects",
        json={
            "id": book.project_id,
            "title": "또",
            "template_id": "essay",
            "first_chapter_id": str(uuid.uuid4()),
            "anon_id": str(uuid.uuid4()),
        },
    )
    assert res.status_code == 409
    assert res.json()["code"] == "duplicate_id"


def test_blank_title_is_rejected(db_client: TestClient) -> None:
    res = db_client.post(
        "/projects",
        json={
            "id": str(uuid.uuid4()),
            "title": "   ",
            "template_id": "essay",
            "first_chapter_id": str(uuid.uuid4()),
            "anon_id": str(uuid.uuid4()),
        },
    )
    assert res.status_code == 422
    assert res.json()["code"] == "invalid_request"


def test_my_projects_lists_only_editor_tokens(db_client: TestClient, book: Book) -> None:
    other = _make_book(db_client, "두 번째 책")
    res = db_client.post(
        "/projects/list",
        json={"editor_tokens": [book.editor, other.editor, book.author, "틀린 토큰"]},
    )
    assert res.status_code == 200
    cards = res.json()
    assert {c["id"] for c in cards} == {book.project_id, other.project_id}
    card = next(c for c in cards if c["id"] == book.project_id)
    assert card["stage"] == "editing"
    assert card["todo_count"] == 0
    assert sorted(p["role"] for p in card["participants"]) == ["author", "designer", "editor"]


def test_me_for_participant(db_client: TestClient, book: Book) -> None:
    me = db_client.get("/me", headers=_auth(book.author)).json()
    assert me["kind"] == "participant"
    assert me["role"] == "author"
    assert me["display_name"] == "author님"


# ---- A-05 · A-06 ----


def test_check_invite_shows_role_and_actions(db_client: TestClient, book: Book) -> None:
    res = db_client.get(f"/invites/{_token_in(book.author_invite['url'])}").json()
    assert res["state"] == "valid"
    assert res["project_title"] == "테스트 책"
    assert res["role"] == "author"
    assert "edit_manuscript" in res["can"]
    assert "change_layout" not in res["can"]


def test_unknown_invite_is_unusable(db_client: TestClient) -> None:
    assert db_client.get(f"/invites/{uuid.uuid4()}").json()["state"] == "unusable"


def test_rejoin_same_browser_keeps_participant(db_client: TestClient, book: Book) -> None:
    token = _token_in(book.author_invite["url"])
    anon = str(uuid.uuid4())
    first = db_client.post(
        f"/invites/{token}/join", json={"display_name": "김작가", "anon_id": anon}
    ).json()
    again = db_client.post(
        f"/invites/{token}/join", json={"display_name": "김작가2", "anon_id": anon}
    ).json()
    assert again["participant"]["id"] == first["participant"]["id"]
    assert again["participant"]["display_name"] == "김작가2"
    # 옛 참여자 토큰은 더는 맞지 않아요
    assert db_client.get("/me", headers=_auth(first["participant_token"])).status_code == 401
    assert db_client.get("/me", headers=_auth(again["participant_token"])).status_code == 200


def test_create_invite_returns_existing_active_link(db_client: TestClient, book: Book) -> None:
    res = db_client.post(
        f"/projects/{book.project_id}/invites", json={"role": "author"}, headers=_auth(book.editor)
    )
    assert res.json()["id"] == book.author_invite["id"]


# ---- S-01 토큰이 없거나 틀리면 401 ----


@pytest.mark.parametrize(
    "headers", [{}, _auth("wrong-token-not-issued"), {"Authorization": "Basic abc"}]
)
def test_s01_missing_or_wrong_token_is_401(
    db_client: TestClient, book: Book, headers: dict[str, str]
) -> None:
    for method, path in [
        ("GET", "/me"),
        ("GET", f"/projects/{book.project_id}"),
        ("GET", f"/projects/{book.project_id}/invites"),
        ("POST", f"/invites/{book.author_invite['id']}/revoke"),
        ("GET", f"/chapters/{book.chapter_id}"),
    ]:
        res = db_client.request(method, path, headers=headers)
        assert res.status_code == 401, f"{method} {path}"
        assert res.json()["code"] == "unauthorized"


# ---- S-02 다른 책의 자원은 403 ----


def test_s02_other_project_is_403(db_client: TestClient, book: Book) -> None:
    other = _make_book(db_client, "남의 책")
    h = _auth(book.editor)
    for method, path, body in [
        ("GET", f"/projects/{other.project_id}", None),
        ("GET", f"/projects/{other.project_id}/invites", None),
        ("POST", f"/projects/{other.project_id}/invites", {"role": "author"}),
        ("POST", f"/invites/{other.author_invite['id']}/rotate", None),
        ("POST", f"/invites/{other.author_invite['id']}/revoke", None),
        ("PATCH", f"/projects/{other.project_id}/layout", {"layout": {"line_height": 2}}),
    ]:
        res = db_client.request(method, path, json=body, headers=h)
        assert res.status_code == 403, f"{method} {path}"
        assert res.json()["code"] == "forbidden"


# ---- S-03 바꾸거나 취소한 옛 링크로는 들어올 수 없음 ----


def _join(c: TestClient, token: str) -> int:
    return c.post(
        f"/invites/{token}/join", json={"display_name": "누구", "anon_id": str(uuid.uuid4())}
    ).status_code


def test_s03_rotated_link_no_longer_works(db_client: TestClient, book: Book) -> None:
    old = _token_in(book.author_invite["url"])
    res = db_client.post(
        f"/invites/{book.author_invite['id']}/rotate", headers=_auth(book.editor)
    ).json()
    assert res["revoked"]["state"] == "revoked"
    assert res["created"]["role"] == "author"
    new = _token_in(res["created"]["url"])
    assert new != old
    assert db_client.get(f"/invites/{old}").json()["state"] == "unusable"
    assert _join(db_client, old) == 404
    assert db_client.get(f"/invites/{new}").json()["state"] == "valid"
    assert _join(db_client, new) == 201


def test_s03_revoked_link_no_longer_works(db_client: TestClient, book: Book) -> None:
    token = _token_in(book.author_invite["url"])
    res = db_client.post(f"/invites/{book.author_invite['id']}/revoke", headers=_auth(book.editor))
    assert res.json()["state"] == "revoked"
    assert db_client.get(f"/invites/{token}").json()["state"] == "unusable"
    assert _join(db_client, token) == 404
    # 이미 들어온 사람은 그대로 들어올 수 있어요(링크와 참여자 토큰은 따로)
    assert db_client.get("/me", headers=_auth(book.author)).status_code == 200


# ---- S-04 토큰은 해시만, 응답에 token_hash 없음 ----


def _keys(node: Any) -> set[str]:
    if isinstance(node, dict):
        return set(node) | {k for v in node.values() for k in _keys(v)}
    if isinstance(node, list):
        return {k for v in node for k in _keys(v)}
    return set()


def sha(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def test_s04_tokens_are_stored_as_hashes(db_client: TestClient, db: Session, book: Book) -> None:
    for token in (book.editor, book.author, book.designer):
        row = db.scalars(select(Participant).where(Participant.token_hash == sha(token))).one()
        assert row.token_hash != token
        assert token not in {v for v in vars(row).values() if isinstance(v, str)}
    link = db.get(RoleLink, uuid.UUID(book.author_invite["id"]))
    assert link is not None
    assert link.token_hash == sha(link.token)


def test_s04_no_hash_in_any_response(db_client: TestClient, book: Book) -> None:
    h = _auth(book.editor)
    bodies = [
        db_client.get("/me", headers=h).json(),
        db_client.post("/projects/list", json={"editor_tokens": [book.editor]}).json(),
        db_client.get(f"/projects/{book.project_id}/invites", headers=h).json(),
        db_client.get(f"/invites/{_token_in(book.author_invite['url'])}").json(),
        db_client.post(f"/invites/{book.author_invite['id']}/rotate", headers=h).json(),
    ]
    for body in bodies:
        assert not [k for k in _keys(body) if "hash" in k.lower()], body


# ---- S-05 역할 × 엔드포인트 권한 표(D-14, D-15) ----
# 줄을 더할 때: (A 번호, 메서드, 경로 틀, 본문, 할 수 있는 역할). F3~F5에서 계속 더해요.

PERMISSION_TABLE: list[tuple[str, str, str, dict[str, Any] | None, set[str]]] = [
    ("A-01", "GET", "/me", None, {"editor", "author", "designer"}),
    ("A-10", "GET", "/projects/{p}", None, {"editor", "author", "designer"}),
    ("A-07", "GET", "/projects/{p}/invites", None, {"editor"}),
    ("A-08", "POST", "/projects/{p}/invites", {"role": "designer"}, {"editor"}),
    ("A-09", "POST", "/invites/{i}/revoke", None, {"editor"}),
    ("A-09", "POST", "/invites/{i}/rotate", None, {"editor"}),
    (
        "A-15",
        "PATCH",
        "/projects/{p}/layout",
        {"layout": {"font_size": 11}},
        {"editor", "designer"},
    ),
    # F3: 장·원고·검토본. 본문의 "{new}"는 부를 때마다 새 UUID로 바꿔요.
    ("A-11", "GET", "/chapters/{c}", None, {"editor", "author", "designer"}),
    (
        "A-12",
        "PUT",
        "/chapters/{c}/doc",
        {"doc": {"type": "doc", "content": []}, "base_version": 1},
        {"author"},
    ),
    (
        "A-13",
        "POST",
        "/projects/{p}/chapters",
        {"id": "{new}", "title": "2장"},
        {"editor", "author"},
    ),
    ("A-14", "POST", "/chapters/{c}/status", {"to": "review_requested"}, {"author"}),
    ("A-29", "GET", "/chapters/{c}/snapshots", None, {"editor", "author", "designer"}),
    ("A-29", "POST", "/chapters/{c}/snapshots", {"label": "1차 검토"}, {"editor"}),
]


@pytest.mark.parametrize(
    ("need", "method", "path", "body", "allowed"),
    PERMISSION_TABLE,
    ids=[f"{r[0]} {r[1]} {r[2]}" for r in PERMISSION_TABLE],
)
@pytest.mark.parametrize("role", ["editor", "author", "designer"])
def test_s05_permission_table(
    db_client: TestClient,
    need: str,
    method: str,
    path: str,
    body: dict[str, Any] | None,
    allowed: set[str],
    role: str,
) -> None:
    b = _make_book(db_client)
    token = {"editor": b.editor, "author": b.author, "designer": b.designer}[role]
    url = path.format(p=b.project_id, i=b.author_invite["id"], c=b.chapter_id)
    if body is not None:
        body = {k: (str(uuid.uuid4()) if v == "{new}" else v) for k, v in body.items()}
    res = db_client.request(method, url, json=body, headers=_auth(token))
    if role in allowed:
        assert res.status_code < 300, f"{need} {role}: {res.text}"
    else:
        assert res.status_code == 403, f"{need} {role}: {res.status_code}"


# ---- Codex 검수(11.21): 링크 중복, 동시 생성 409, 확인할 일 ----


def _active(c: TestClient, b: Book, role: str) -> list[dict[str, Any]]:
    links = c.get(f"/projects/{b.project_id}/invites", headers=_auth(b.editor)).json()
    return [x for x in links if x["role"] == role and x["state"] == "active"]


def test_rotate_twice_is_409_and_one_active_link(db_client: TestClient, book: Book) -> None:
    url = f"/invites/{book.author_invite['id']}/rotate"
    first = db_client.post(url, headers=_auth(book.editor))
    assert first.status_code == 200
    again = db_client.post(url, headers=_auth(book.editor))
    assert again.status_code == 409
    assert again.json()["code"] == "invite_revoked"
    active = _active(db_client, book, "author")
    assert [x["id"] for x in active] == [first.json()["created"]["id"]]


def test_rotate_revoked_link_is_409(db_client: TestClient, book: Book) -> None:
    h = _auth(book.editor)
    db_client.post(f"/invites/{book.author_invite['id']}/revoke", headers=h)
    res = db_client.post(f"/invites/{book.author_invite['id']}/rotate", headers=h)
    assert res.status_code == 409
    assert _active(db_client, book, "author") == []
    # 취소한 뒤 다시 만들면 새 링크 하나
    made = db_client.post(
        f"/projects/{book.project_id}/invites", json={"role": "author"}, headers=h
    ).json()
    assert made["id"] != book.author_invite["id"]
    assert [x["id"] for x in _active(db_client, book, "author")] == [made["id"]]


def test_db_refuses_second_active_link(db: Session, book: Book) -> None:
    from sqlalchemy.exc import IntegrityError

    db.add(
        RoleLink(
            id=uuid.uuid4(),
            project_id=uuid.UUID(book.project_id),
            role="author",
            token="t",
            token_hash=sha("t"),
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_duplicate_id_race_is_409(
    db_client: TestClient, book: Book, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 미리 확인을 지나간 뒤(동시 요청) 저장에서 걸려도 500이 아니라 409
    from app.db import projects as project_db

    monkeypatch.setattr(project_db, "ids_taken", lambda *_: False)
    res = db_client.post(
        "/projects",
        json={
            "id": book.project_id,
            "title": "또",
            "template_id": "essay",
            "first_chapter_id": str(uuid.uuid4()),
            "anon_id": str(uuid.uuid4()),
        },
    )
    assert res.status_code == 409
    assert res.json()["code"] == "duplicate_id"


def test_todo_count_counts_unseen_comments_and_review_only(
    db_client: TestClient, db: Session, book: Book
) -> None:
    from app.db.models import Chapter, Comment, FirstView, SuggestedEdit

    author_id = uuid.UUID(db_client.get("/me", headers=_auth(book.author)).json()["participant_id"])
    editor_id = uuid.UUID(db_client.get("/me", headers=_auth(book.editor)).json()["participant_id"])
    chapter_id = uuid.UUID(book.chapter_id)
    anchor = {"paragraph_id": "p1", "start": 0, "end": 1}

    def todo() -> int:
        cards = db_client.post("/projects/list", json={"editor_tokens": [book.editor]}).json()
        return int(cards[0]["todo_count"])

    # 수정 제안은 세지 않아요(FR-02 ②)
    db.add(
        SuggestedEdit(
            id=uuid.uuid4(),
            chapter_id=chapter_id,
            author_id=author_id,
            anchor=anchor,
            original="가",
            replacement="나",
            base_version=1,
        )
    )
    # 내가 남긴 의견도 세지 않아요
    db.add(Comment(id=uuid.uuid4(), chapter_id=chapter_id, author_id=editor_id, body="내 말"))
    seen = Comment(id=uuid.uuid4(), chapter_id=chapter_id, author_id=author_id, body="봤음")
    unseen = Comment(
        id=uuid.uuid4(), chapter_id=chapter_id, author_id=author_id, body="안 봄", status="resolved"
    )
    db.add_all([seen, unseen])
    db.flush()
    db.add(FirstView(target_type="comment", target_id=seen.id, participant_id=editor_id))
    db.flush()
    # 해결됐어도 아직 안 본 의견 1개
    assert todo() == 1

    chapter = db.get(Chapter, chapter_id)
    assert chapter is not None
    chapter.status = "review_requested"
    db.flush()
    assert todo() == 2
