// 퍼널(FR-40, events 탭 '3. 지표'). 데모 플로우 13단계마다 도달한 책과 이탈한 책을 센다.
// 도달 수: 그 단계의 이벤트가 하나 이상 기록된 책의 수. 이탈 수: 직전 단계에는 도달했지만 이 단계에는 도달하지 못한 책의 수.
import type { Role, TrackedEvent } from "@/types";

export interface FunnelStep {
  step: number;
  label: string;
  event: string;
  /** 이 역할로 남은 것만 센다(4·5·12단계, 정할 것 14) */
  role?: Role;
}

export const FUNNEL_STEPS: FunnelStep[] = [
  { step: 1, label: "책 만들기", event: "project_created" },
  { step: 2, label: "템플릿 고르기", event: "template_selected" },
  { step: 3, label: "역할 링크 복사", event: "role_link_copied" },
  { step: 4, label: "작가 링크 열기", event: "role_link_opened", role: "author" },
  { step: 5, label: "작가 들어오기", event: "participant_joined", role: "author" },
  { step: 6, label: "원고 처음 고치기", event: "first_edit" },
  { step: 7, label: "검토 요청", event: "review_requested" },
  { step: 8, label: "장 검토", event: "chapter_review_run" },
  { step: 9, label: "AI 제안 보내기", event: "ai_suggestion_sent" },
  { step: 10, label: "수정 제안 수락", event: "suggested_edit_accepted" },
  { step: 11, label: "검토본 저장", event: "snapshot_saved" },
  { step: 12, label: "디자이너 들어오기", event: "participant_joined", role: "designer" },
  { step: 13, label: "조판 값 바꾸기", event: "layout_changed" },
];

export interface FunnelRow extends FunnelStep {
  reached: number;
  dropped: number;
}

function matches(e: TrackedEvent, s: FunnelStep): boolean {
  if (e.name !== s.event) return false;
  if (!s.role) return true;
  // 역할은 공통 칸 role로 본다. 링크를 연 순간처럼 참여자가 없을 때도 role은 링크의 역할로 채워져 있다.
  return e.role === s.role || e.props.role === s.role;
}

export function computeFunnel(events: TrackedEvent[]): FunnelRow[] {
  let previous: Set<string> | null = null;
  return FUNNEL_STEPS.map((s) => {
    const books = new Set(events.filter((e) => e.project_id && matches(e, s)).map((e) => e.project_id as string));
    const dropped = previous ? [...previous].filter((id) => !books.has(id)).length : 0;
    previous = books;
    return { ...s, reached: books.size, dropped };
  });
}
