// 데모 제공자: 예시 JSON을 돌려주고 잠깐 기다리는 흉내만 낸다. 네트워크를 쓰지 않는다(D-06).
// 예시 파일은 글자 하나 바꾸지 않는다(D-19). 돌려줄 때 요청에 묶이는 값만 바꾼다.
// - chapter_id, base_version: 요청한 장과 그 장의 지금 버전
// - owner_participant_id: 요청한 참여자. 보내기 전에는 그 사람만 본다(FR-23)
// - id: 응답마다 새 UUID(D-07). 참여자마다 제안이 따로 있어야 서로 덮어쓰지 않는다.
//   같은 제안을 다시 받으면 이미 처리한 것을 살리는 일은 저장할 때 한다(data/ saveAiSuggestions).
// 위치·원문·수정안·대안·종류·이유·출처·대상 역할·생성 시각은 예시 값 그대로다.
import chapterReviewFixture from "@/fixtures/chapter_review.json";
import liveCheckFixture from "@/fixtures/live_check.json";
import { parseChapterReviewResult, parseLiveCheckResult, type AiSuggestion, type Uuid } from "@/types";
import type { AiProvider } from "./provider";

export interface DemoProviderOptions {
  /** 응답 전에 기다리는 시간(ms). 테스트는 0. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => Uuid;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createDemoProvider(options: DemoProviderOptions = {}): AiProvider {
  const delayMs = options.delayMs ?? 800;
  const sleep = options.sleep ?? defaultSleep;
  const newId = options.newId ?? (() => crypto.randomUUID());

  const bind = (suggestions: AiSuggestion[], req: { chapter_id: Uuid; base_version: number; requester_participant_id: Uuid }) =>
    suggestions.map((s) => ({
      ...s,
      id: newId(),
      chapter_id: req.chapter_id,
      base_version: req.base_version,
      owner_participant_id: req.requester_participant_id,
    }));

  return {
    async liveCheck(request) {
      await sleep(delayMs);
      const result = parseLiveCheckResult(liveCheckFixture);
      // 예시 응답은 para_02 하나에 대한 것이다. 다른 문단을 고치면 고칠 거리가 없다고 돌려준다.
      const suggestions = request.paragraph_id === result.paragraph_id ? result.suggestions : [];
      return {
        ...result,
        chapter_id: request.chapter_id,
        paragraph_id: request.paragraph_id,
        base_version: request.base_version,
        suggestions: bind(suggestions, request),
      };
    },
    async chapterReview(request) {
      await sleep(delayMs);
      const result = parseChapterReviewResult(chapterReviewFixture);
      return {
        ...result,
        chapter_id: request.chapter_id,
        base_version: request.base_version,
        suggestions: bind(result.suggestions, request),
      };
    },
  };
}
