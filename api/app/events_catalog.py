"""이벤트 이름과 퍼널 단계(events 탭 '2. 이벤트'·'3. 지표', FR-40). 화면의 web/src/events/names.ts·domain/funnel.ts와 같아요.

두 목록이 어긋나면 화면이 남긴 이벤트를 서버가 거절해요. tests/test_events.py가 같은지 확인해요.
"""

from dataclasses import dataclass
from typing import Final

EVENT_NAMES: Final[frozenset[str]] = frozenset(
    {
        # 퍼널 1~13단계
        "project_created",
        "template_selected",
        "role_link_copied",
        "role_link_opened",
        "participant_joined",
        "first_edit",
        "review_requested",
        "chapter_review_run",
        "ai_suggestion_sent",
        "suggested_edit_accepted",
        "snapshot_saved",
        "layout_changed",
        # AI 제안
        "ai_suggestion_shown",
        "ai_suggestion_applied",
        "ai_suggestion_dismissed",
        "ai_suggestion_merged",
        "ai_suggestion_kept",
        "suggested_edit_rejected",
        # 참여·원고
        "chapter_added",
        "invite_link_created",
        "invite_link_rotated",
        "invite_link_revoked",
        "editor_link_opened",
        "save_failed",
        # F5·F7
        "review_completed",
        "comment_resolved",
        "comment_reopened",
        "preview_opened",
        "presence_jumped",
        # 체류
        "screen_entered",
        "screen_left",
    }
)


@dataclass(frozen=True)
class FunnelStep:
    step: int
    label: str
    event: str
    role: str | None = None  # 이 역할로 남은 것만 세요(4·5·12단계, 정할 것 14)


FUNNEL_STEPS: Final[tuple[FunnelStep, ...]] = (
    FunnelStep(1, "책 만들기", "project_created"),
    FunnelStep(2, "템플릿 고르기", "template_selected"),
    FunnelStep(3, "역할 링크 복사", "role_link_copied"),
    FunnelStep(4, "작가 링크 열기", "role_link_opened", "author"),
    FunnelStep(5, "작가 들어오기", "participant_joined", "author"),
    FunnelStep(6, "원고 처음 고치기", "first_edit"),
    FunnelStep(7, "검토 요청", "review_requested"),
    FunnelStep(8, "장 검토", "chapter_review_run"),
    FunnelStep(9, "AI 제안 보내기", "ai_suggestion_sent"),
    FunnelStep(10, "수정 제안 수락", "suggested_edit_accepted"),
    FunnelStep(11, "검토본 저장", "snapshot_saved"),
    FunnelStep(12, "디자이너 들어오기", "participant_joined", "designer"),
    FunnelStep(13, "조판 값 바꾸기", "layout_changed"),
)
