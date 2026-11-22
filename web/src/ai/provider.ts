// AI 제공자 인터페이스. 1차 구현은 데모 제공자 하나(D-06). 실제 AI는 사람과 정한 뒤 이 뒤에 붙인다.
import type { ChapterReviewResult, LiveCheckResult, Uuid } from "@/types";

export interface LiveCheckRequest {
  chapter_id: Uuid;
  paragraph_id: string;
  /** 바뀐 문단의 서식 제외 텍스트(D-18: 바뀐 문단만 본다) */
  text: string;
  base_version: number;
  /** 제안의 주인. 보내기 전까지 이 사람만 본다(FR-23) */
  requester_participant_id: Uuid;
}

export interface ChapterReviewRequest {
  chapter_id: Uuid;
  base_version: number;
  requester_participant_id: Uuid;
}

export interface AiProvider {
  liveCheck(request: LiveCheckRequest): Promise<LiveCheckResult>;
  chapterReview(request: ChapterReviewRequest): Promise<ChapterReviewResult>;
}
