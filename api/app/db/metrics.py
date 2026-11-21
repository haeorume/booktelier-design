"""퍼널·작업 지표에 쓰는 행 읽기(A-34). 계산은 app/metrics.py(순수 함수)가 해요."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AiSuggestion, ChapterRevision, Comment, Event, FirstView, SuggestedEdit
from app.metrics import Ev


@dataclass
class MetricRows:
    events: list[Ev]
    edits: list[tuple[datetime, datetime | None, str]]
    first_views: list[tuple[datetime, datetime | None]]
    completions: list[tuple[int, int]]
    revisions: dict[tuple[str, int], datetime]
    ai_total: int
    ai_with_evidence: int


def _ev(e: Event) -> Ev:
    return Ev(
        name=e.name,
        server_ts=e.server_ts,
        project_id=str(e.project_id) if e.project_id else None,
        chapter_id=str(e.chapter_id) if e.chapter_id else None,
        role=e.role,
        chapter_version=e.chapter_version,
        props=e.props,
    )


def collect(db: Session) -> MetricRows:
    events = [_ev(e) for e in db.scalars(select(Event)).all()]

    edits = [
        (e.created_at, e.decided_at, e.status) for e in db.scalars(select(SuggestedEdit)).all()
    ]

    # 최초 확인: 의견(원래 의견만)·수정 제안을 만든 시각과 처음 본 시각(본 사람 중 가장 이른 것)
    seen: dict[str, datetime] = {}
    for fv in db.scalars(select(FirstView)).all():
        key = str(fv.target_id)
        if key not in seen or fv.first_viewed_at < seen[key]:
            seen[key] = fv.first_viewed_at
    first_views = [
        (e.created_at, seen.get(str(e.id))) for e in db.scalars(select(SuggestedEdit)).all()
    ]
    first_views += [
        (c.created_at, seen.get(str(c.id)))
        for c in db.scalars(select(Comment).where(Comment.parent_id.is_(None))).all()
    ]

    # 수정 누락: 검토 완료 때 남은 수정 제안 ÷ 그 완료 시각까지 그 장에 만들어진 수정 제안(Codex 검수 11.22)
    created_by_chapter: dict[str, list[datetime]] = defaultdict(list)
    for chapter_id, created in db.execute(
        select(SuggestedEdit.chapter_id, SuggestedEdit.created_at)
    ).all():
        created_by_chapter[str(chapter_id)].append(created)
    completions: list[tuple[int, int]] = []
    for e in events:
        if e.name != "review_completed" or not e.chapter_id:
            continue
        pending = (e.props or {}).get("pending_edits")
        if not isinstance(pending, int) or isinstance(pending, bool) or pending < 0:
            continue  # 잘못된 행은 건너뛰어요(받을 때도 막지만 지표 화면이 깨지지 않게)
        total = sum(1 for t in created_by_chapter[e.chapter_id] if t <= e.server_ts)
        completions.append((min(pending, total), total))

    revisions = {
        (str(r.chapter_id), r.version): r.created_at
        for r in db.scalars(select(ChapterRevision)).all()
    }

    ai_total = int(db.scalar(select(func.count()).select_from(AiSuggestion)) or 0)
    ai_with_evidence = int(
        db.scalar(
            select(func.count())
            .select_from(AiSuggestion)
            # JSONB의 None은 JSON null로 저장될 수 있어 '객체'인 것만 세요
            .where(func.jsonb_typeof(AiSuggestion.evidence) == "object")
        )
        or 0
    )
    return MetricRows(
        events, edits, first_views, completions, revisions, ai_total, ai_with_evidence
    )
