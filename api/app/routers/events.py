"""이벤트(A-33)와 퍼널·작업 지표(A-34). events 탭, db 탭 5번, FR-39·40·49.

- A-33은 토큰 없이도 받아요(책을 만들기 전 화면, 화면을 떠날 때의 sendBeacon). 토큰이 붙어 오면
  그 토큰으로 참여자·책·역할을 서버가 다시 채워 화면이 보낸 값을 믿지 않아요(F8 결정).
- A-34는 막지 않아요(routes DV-01 '막지 않는다'). 원고 글자 없이 숫자만 돌려줘요.
"""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter

from app import metrics
from app.auth.token import MaybeMe
from app.db import events as events_db
from app.db import metrics as metrics_db
from app.db.session import DbSession
from app.errors import AppError
from app.events_catalog import EVENT_NAMES
from app.schemas.common import error_responses
from app.schemas.events import EventsIn, EventsOut, FunnelRow, Kpi, MetricsOut

router = APIRouter(tags=["events"])


@router.post(
    "/events",
    summary="A-33 이벤트 보내기",
    response_model=EventsOut,
    responses=error_responses(422),
)
def send_events(body: EventsIn, me: MaybeMe, db: DbSession) -> EventsOut:
    """묶어서 받아요. 이름은 events 탭 목록만(모르는 이름이 하나라도 있으면 422). 받은 시각은 서버가 정해요."""
    unknown = sorted({e.name for e in body.events} - EVENT_NAMES)
    if unknown:
        raise AppError(
            422, "invalid_request", f"name: events 탭에 없는 이름이에요({', '.join(unknown)})"
        )
    now = datetime.now(UTC)
    rows: list[dict[str, Any]] = []
    for e in body.events:
        row = e.model_dump()
        row["server_ts"] = now
        if me is not None:
            # 토큰이 있으면 신원은 서버가 정해요. 장은 화면이 보낸 값을 써요(같은 책인지는 DB 칸으로 묶어요).
            row["participant_id"] = me.participant_id
            row["project_id"] = me.project_id
            row["role"] = me.role
        rows.append(row)
    stored = events_db.store(db, rows)
    return EventsOut(received=len(rows), stored=stored)


@router.get(
    "/dev/metrics",
    summary="A-34 퍼널과 작업 지표",
    response_model=MetricsOut,
)
def dev_metrics(db: DbSession) -> MetricsOut:
    """팀용(DV-01). 퍼널 13단계와 작업 지표 8개. 서버가 받은 이벤트와 DB 표로 셈해요."""
    rows = metrics_db.collect(db)
    kpis = [
        metrics.edit_handling_minutes(rows.edits),
        metrics.first_view_minutes(rows.first_views),
        metrics.approval_minutes(rows.events),
        metrics.completion_rate(rows.events),
        metrics.missed_edit_rate(rows.completions),
        metrics.mismatch_rework(),
        metrics.layout_check_minutes(
            [e for e in rows.events if e.name in ("screen_entered", "preview_opened")],
            rows.revisions,
        ),
        metrics.evidence_rate(rows.ai_with_evidence, rows.ai_total),
    ]
    return MetricsOut(
        generated_at=datetime.now(UTC),
        events_total=len(rows.events),
        funnel=[FunnelRow(**vars(f)) for f in metrics.funnel(rows.events)],
        kpis=[Kpi(**vars(k)) for k in kpis],
    )
