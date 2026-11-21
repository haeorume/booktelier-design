"""F8 이벤트(A-33)와 퍼널·작업 지표(A-34). S-09: 이벤트에 원고 글자가 없음, KPI 계산 함수의 단위 테스트.

- DB 없이: 이벤트 이름·퍼널 단계가 화면 목록과 같은지, 지표 계산, 추가 정보 길이 제한
- DB(@pytest.mark.db): 저장·중복 무시·모르는 이름 422·토큰으로 신원 다시 채우기·sendBeacon(text/plain)·지표 응답
"""

import json
import re
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import metrics
from app.db.models import Event
from app.events_catalog import EVENT_NAMES, FUNNEL_STEPS
from app.metrics import Ev
from app.schemas.events import PROPS_TEXT_MAX, EventIn
from tests.helpers import auth, make_book

WEB = Path(__file__).resolve().parents[2] / "web" / "src"
T0 = datetime(2026, 11, 22, 9, 0, tzinfo=UTC)


def _min(m: float) -> datetime:
    return T0 + timedelta(minutes=m)


# ---- 화면 목록과 같은지(어긋나면 서버가 화면 이벤트를 거절해요) ----


def test_event_names_match_web() -> None:
    text = (WEB / "events" / "names.ts").read_text(encoding="utf-8")
    body = text[text.index("EVENT_NAMES = [") : text.index("] as const")]
    assert set(re.findall(r'"([a-z_]+)"', body)) == set(EVENT_NAMES)


def test_funnel_steps_match_web() -> None:
    text = (WEB / "domain" / "funnel.ts").read_text(encoding="utf-8")
    web = re.findall(
        r'step: (\d+), label: "([^"]+)", event: "([a-z_]+)"(?:, role: "([a-z]+)")?', text
    )
    assert [(int(s), label, ev, role or None) for s, label, ev, role in web] == [
        (s.step, s.label, s.event, s.role) for s in FUNNEL_STEPS
    ]


# ---- S-09: 원고 글자가 이벤트에 들어오지 않게 ----


def _event(**extra: Any) -> dict[str, Any]:
    return {
        "event_id": str(uuid.uuid4()),
        "name": "first_edit",
        "ts": 1,
        "anon_id": str(uuid.uuid4()),
        "session_id": str(uuid.uuid4()),
        "path": "/p/x/c/y",
        **extra,
    }


def test_long_text_or_nested_props_are_refused() -> None:
    EventIn.model_validate(_event(props={"via": "direct", "panel_layout": "single", "n": 3}))
    with pytest.raises(ValidationError):
        EventIn.model_validate(_event(props={"text": "가" * (PROPS_TEXT_MAX + 1)}))
    with pytest.raises(ValidationError):
        EventIn.model_validate(_event(props={"doc": {"type": "doc"}}))


# ---- 지표 계산(db 탭 5번) ----


def test_funnel_counts_books_and_dropouts() -> None:
    events = [
        Ev("project_created", T0, project_id="a"),
        Ev("project_created", T0, project_id="b"),
        Ev("template_selected", T0, project_id="a"),
        Ev("role_link_opened", T0, project_id="a", props={"role": "author"}),
        Ev("participant_joined", T0, project_id="a", role="designer"),
    ]
    rows = {r.step: r for r in metrics.funnel(events)}
    assert (rows[1].reached, rows[1].dropped) == (2, 0)
    assert (rows[2].reached, rows[2].dropped) == (1, 1)
    assert rows[4].reached == 1  # props.role로도 세요
    assert rows[5].reached == 0 and rows[12].reached == 1  # 역할로 나눠 세요


def test_edit_handling_and_first_view() -> None:
    k = metrics.edit_handling_minutes(
        [
            (T0, _min(10), "accepted"),
            (T0, _min(30), "accepted"),
            (T0, _min(5), "rejected"),
            (T0, None, "pending"),
        ]
    )
    assert (k.value, k.count, k.note) == (20.0, 2, "거절 1건")
    f = metrics.first_view_minutes([(T0, _min(4)), (T0, None)])
    assert (f.value, f.count, f.note) == (4.0, 1, "아직 안 본 것 1건")


def test_approval_and_completion() -> None:
    events = [
        Ev("review_requested", _min(0), chapter_id="c1"),
        Ev("review_requested", _min(10), chapter_id="c1"),  # 마지막 요청부터 세요
        Ev("review_completed", _min(25), chapter_id="c1"),
        Ev("review_requested", _min(0), chapter_id="c2"),
    ]
    assert metrics.approval_minutes(events).value == 15.0
    c = metrics.completion_rate(events)
    assert (c.value, c.count) == (50.0, 2)
    assert metrics.completion_rate([]).value is None  # 분모 0이면 표시하지 않아요


def test_missed_edit_layout_check_and_evidence() -> None:
    assert metrics.missed_edit_rate([(1, 4), (0, 1)]).value == 20.0
    assert metrics.missed_edit_rate([]).value is None
    opens = [
        Ev("screen_entered", _min(12), chapter_id="c1", role="designer", chapter_version=3),
        Ev(
            "preview_opened", _min(8), chapter_id="c1", role="designer", chapter_version=3
        ),  # 처음 연 것
        Ev(
            "screen_entered", _min(1), chapter_id="c1", role="author", chapter_version=3
        ),  # 디자이너만
    ]
    k = metrics.layout_check_minutes(opens, {("c1", 3): _min(2)})
    assert (k.value, k.count) == (6.0, 1)
    assert metrics.evidence_rate(3, 5).value == 60.0
    assert metrics.mismatch_rework().value is None


# ---- DB: A-33·A-34 ----


def _payload(*events: dict[str, Any]) -> dict[str, Any]:
    return {"events": list(events)}


@pytest.mark.db
def test_store_dedupes_and_refuses_unknown_names(db_client: TestClient) -> None:
    one = _event(name="project_created", props={"panel_layout": "single"})
    res = db_client.post("/events", json=_payload(one))
    assert res.status_code == 200, res.text
    assert res.json() == {"received": 1, "stored": 1}
    again = db_client.post("/events", json=_payload(one))
    assert again.json() == {"received": 1, "stored": 0}  # 같은 event_id는 한 번만
    bad = db_client.post("/events", json=_payload(_event(name="bookend_opened")))
    assert bad.status_code == 422


@pytest.mark.db
def test_token_overrides_identity(db_client: TestClient, db: Session) -> None:
    book = make_book(db_client, sample=True)
    me = db_client.get("/me", headers=auth(book.author)).json()
    fake = _event(project_id=str(uuid.uuid4()), role="editor")
    res = db_client.post("/events", json=_payload(fake), headers=auth(book.author))
    assert res.status_code == 200, res.text
    # 화면이 보낸 책·역할 대신 토큰의 것으로 저장돼요
    row = db.scalar(select(Event).where(Event.event_id == uuid.UUID(fake["event_id"])))
    assert row is not None
    assert str(row.project_id) == book.project_id
    assert row.role == "author"
    assert str(row.participant_id) == me["participant_id"]


@pytest.mark.db
def test_beacon_text_plain_is_accepted(db_client: TestClient) -> None:
    body = json.dumps(_payload(_event(name="screen_left")))
    res = db_client.post(
        "/events", content=body, headers={"Content-Type": "text/plain;charset=UTF-8"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["stored"] == 1


@pytest.mark.db
def test_metrics_shape(db_client: TestClient) -> None:
    res = db_client.get("/dev/metrics")
    assert res.status_code == 200, res.text
    data = res.json()
    assert [r["step"] for r in data["funnel"]] == list(range(1, 14))
    assert {k["key"] for k in data["kpis"]} == {
        "edit_handling",
        "first_view",
        "approval",
        "completion",
        "missed_edit",
        "mismatch_rework",
        "layout_check",
        "evidence",
    }


# ---- Codex 검수(11.22) ----


def test_pending_edits_must_be_a_number() -> None:
    EventIn.model_validate(_event(name="review_completed", props={"pending_edits": 2}))
    for bad in ("abc", -1, True, 1.5):
        with pytest.raises(ValidationError):
            EventIn.model_validate(_event(name="review_completed", props={"pending_edits": bad}))


def test_rerequested_chapter_is_not_complete() -> None:
    # 완료 뒤 다시 검토를 요청한 장은 지금 완료가 아니에요(FR-13)
    events = [
        Ev("review_requested", _min(0), chapter_id="c1"),
        Ev("review_completed", _min(5), chapter_id="c1"),
        Ev("review_requested", _min(9), chapter_id="c1"),
        Ev("review_requested", _min(0), chapter_id="c2"),
        Ev("review_completed", _min(3), chapter_id="c2"),
    ]
    c = metrics.completion_rate(events)
    assert (c.value, c.count) == (50.0, 2)
