"""DB 테스트가 같이 쓰는 준비: 책 하나와 세 역할의 토큰을 API로 만들어요."""

import uuid
from dataclasses import dataclass
from typing import Any

from fastapi.testclient import TestClient


@dataclass
class Book:
    project_id: str
    chapter_id: str
    editor: str
    author: str
    designer: str
    author_invite: dict[str, Any]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def token_in(url: str) -> str:
    return url.rsplit("/", 1)[-1]


def make_book(c: TestClient, title: str = "테스트 책") -> Book:
    pid, cid = str(uuid.uuid4()), str(uuid.uuid4())
    res = c.post(
        "/projects",
        json={
            "id": pid,
            "title": title,
            "template_id": "essay",
            "first_chapter_id": cid,
            "anon_id": str(uuid.uuid4()),
        },
    )
    assert res.status_code == 201, res.text
    editor = res.json()["editor_token"]
    tokens: dict[str, str] = {}
    invites: dict[str, dict[str, Any]] = {}
    for role in ("author", "designer"):
        inv = c.post(f"/projects/{pid}/invites", json={"role": role}, headers=auth(editor))
        assert inv.status_code == 201, inv.text
        invites[role] = inv.json()
        joined = c.post(
            f"/invites/{token_in(inv.json()['url'])}/join",
            json={"display_name": f"{role}님", "anon_id": str(uuid.uuid4())},
        )
        assert joined.status_code == 201, joined.text
        tokens[role] = joined.json()["participant_token"]
    return Book(pid, cid, editor, tokens["author"], tokens["designer"], invites["author"])
