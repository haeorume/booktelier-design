"""퍼널과 작업 지표 계산(FR-40, FR-49, db 탭 5번). DB와 무관한 순수 함수라 단위 테스트로 확인해요(S-09).

app/db/metrics.py가 표에서 행을 읽어 여기 넘기고, 라우터(A-34)가 결과를 돌려줘요.
시간은 서버 시각으로 세요(events 탭 server_ts: 기기 시계가 틀려도 순서가 맞게).
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.events_catalog import FUNNEL_STEPS


@dataclass(frozen=True)
class Ev:
    """지표에 쓰는 이벤트 한 줄."""

    name: str
    server_ts: datetime
    project_id: str | None = None
    chapter_id: str | None = None
    role: str | None = None
    chapter_version: int | None = None
    props: dict[str, Any] | None = None


@dataclass(frozen=True)
class FunnelResult:
    step: int
    label: str
    event: str
    role: str | None
    reached: int
    dropped: int


@dataclass(frozen=True)
class KpiResult:
    key: str
    label: str
    value: float | None
    unit: str
    count: int
    note: str | None = None


def _minutes(delta_seconds: float) -> float:
    return round(delta_seconds / 60, 1)


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def funnel(events: Iterable[Ev]) -> list[FunnelResult]:
    """도달: 그 단계 이벤트가 있는 책 수. 이탈: 직전 단계엔 왔지만 여기엔 없는 책 수(1차 domain/funnel.ts와 같음)."""
    events = list(events)
    out: list[FunnelResult] = []
    previous: set[str] | None = None
    for s in FUNNEL_STEPS:
        books = {
            e.project_id
            for e in events
            if e.project_id
            and e.name == s.event
            and (s.role is None or e.role == s.role or (e.props or {}).get("role") == s.role)
        }
        dropped = len(previous - books) if previous is not None else 0
        previous = books
        out.append(FunnelResult(s.step, s.label, s.event, s.role, len(books), dropped))
    return out


def edit_handling_minutes(edits: Iterable[tuple[datetime, datetime | None, str]]) -> KpiResult:
    """수정 처리 시간: 수락·거절한 시각 − 보낸 시각. 거절은 따로 세요(db 탭 5번)."""
    accepted: list[float] = []
    rejected = 0
    for created, decided, status in edits:
        if decided is None:
            continue
        if status == "accepted":
            accepted.append(_minutes((decided - created).total_seconds()))
        elif status == "rejected":
            rejected += 1
    return KpiResult(
        "edit_handling",
        "수정 처리 시간(수락)",
        _avg(accepted),
        "분",
        len(accepted),
        f"거절 {rejected}건",
    )


def first_view_minutes(items: Iterable[tuple[datetime, datetime | None]]) -> KpiResult:
    """최초 확인 시간: 처음 본 시각 − 만든 시각. 안 본 건은 평균에서 빼고 수를 따로 보여 줘요."""
    seen: list[float] = []
    unseen = 0
    for created, viewed in items:
        if viewed is None:
            unseen += 1
        else:
            seen.append(_minutes((viewed - created).total_seconds()))
    return KpiResult(
        "first_view", "최초 확인 시간", _avg(seen), "분", len(seen), f"아직 안 본 것 {unseen}건"
    )


def approval_minutes(events: Iterable[Ev]) -> KpiResult:
    """승인 소요 시간: 검토 완료 시각 − 그 앞의 마지막 검토 요청 시각(같은 장)."""
    requested: dict[str, list[datetime]] = defaultdict(list)
    completed: list[Ev] = []
    for e in sorted(events, key=lambda x: x.server_ts):
        if not e.chapter_id:
            continue
        if e.name == "review_requested":
            requested[e.chapter_id].append(e.server_ts)
        elif e.name == "review_completed":
            completed.append(e)
    values: list[float] = []
    for e in completed:
        before = [t for t in requested[e.chapter_id or ""] if t <= e.server_ts]
        if before:
            values.append(_minutes((e.server_ts - before[-1]).total_seconds()))
    return KpiResult("approval", "승인 소요 시간", _avg(values), "분", len(values))


def completion_rate(events: Iterable[Ev]) -> KpiResult:
    """작업 완료율: 지금 검토 완료인 장 ÷ 검토 요청된 적이 있는 장. 분모가 0이면 표시하지 않아요.

    장마다 가장 마지막 검토 이벤트로 판단해요. 완료 뒤 다시 검토를 요청하면 아직 완료가 아니에요(FR-13, Codex 검수).
    """
    latest: dict[str, Ev] = {}
    for e in events:
        if e.name not in ("review_requested", "review_completed") or not e.chapter_id:
            continue
        if e.chapter_id not in latest or e.server_ts >= latest[e.chapter_id].server_ts:
            latest[e.chapter_id] = e
    requested = len(latest)
    done = sum(1 for e in latest.values() if e.name == "review_completed")
    value = round(100 * done / requested, 1) if requested else None
    return KpiResult("completion", "작업 완료율", value, "%", requested)


def missed_edit_rate(completions: Iterable[tuple[int, int]]) -> KpiResult:
    """수정 누락률: 검토 완료 때 대기로 남은 수정 제안 ÷ 그 장의 수정 제안. (남은 수, 전체 수) 쌍을 받아요."""
    pending = total = 0
    for p, t in completions:
        pending += p
        total += t
    value = round(100 * pending / total, 1) if total else None
    return KpiResult("missed_edit", "수정 누락률", value, "%", total)


def layout_check_minutes(
    opens: Iterable[Ev], revisions: dict[tuple[str, int], datetime]
) -> KpiResult:
    """지면 영향 확인 시간: 디자이너가 바뀐 버전을 처음 연 시각 − 원고가 그 버전이 된 시각.

    opens는 디자이너의 screen_entered·preview_opened(공통 칸 chapter_version이 있는 것). 장·버전마다 처음 연 것만 세요.
    """
    first_open: dict[tuple[str, int], datetime] = {}
    for e in opens:
        if e.role != "designer" or not e.chapter_id or e.chapter_version is None:
            continue
        key = (e.chapter_id, e.chapter_version)
        if key not in first_open or e.server_ts < first_open[key]:
            first_open[key] = e.server_ts
    values = [
        _minutes((opened - revisions[key]).total_seconds())
        for key, opened in first_open.items()
        if key in revisions and opened >= revisions[key]
    ]
    return KpiResult("layout_check", "지면 영향 확인 시간", _avg(values), "분", len(values))


def evidence_rate(with_evidence: int, total: int) -> KpiResult:
    """AI 근거 표시율: 근거가 붙은 AI 제안 ÷ 전체 AI 제안(db 탭 5번, F6 RAG)."""
    value = round(100 * with_evidence / total, 1) if total else None
    return KpiResult("evidence", "AI 근거 표시율", value, "%", total)


def mismatch_rework() -> KpiResult:
    """정보 불일치 재작업률(대리, FR-49). 계산 방법이 문서에 아직 없어요."""
    return KpiResult(
        "mismatch_rework", "정보 불일치 재작업률(대리)", None, "%", 0, "계산 방법 정해지지 않음"
    )
