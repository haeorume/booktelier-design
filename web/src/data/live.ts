// 함께 작업(F4): 내 위치 알리기(A-30)와 바뀐 것 받기(A-31). 몇 초 간격 새로 읽기(D-31, C-7).
// 서버가 없으면(1차 localStorage 구현) 함께 작업도 없다. 그때 bookDeps().live는 null이다.
import type { components } from "@/types/api";
import type { Layout, Role, TemplateId, Uuid } from "@/types";
import { fillLayout } from "@/domain/layout";
import type { HttpClient } from "./http";
import { toChapterInfo } from "./http-library";
import type { ChapterInfo } from "./library";

type S = components["schemas"];

/** 몇 초 간격의 잠정값(F4 계획). 서버의 PRESENCE_TTL_SECONDS(30초)보다 짧아야 접속자에서 빠지지 않는다. */
export const PRESENCE_INTERVAL_MS = 5_000;
export const CHANGES_INTERVAL_MS = 3_000;

/** 지금 같은 책을 연 다른 사람과 그 사람이 보는 장·문단(FR-19, FR-47). */
export interface PresentPerson {
  participant_id: Uuid;
  role: Role;
  display_name: string;
  chapter_id: Uuid | null;
  paragraph_id: string | null;
}

export interface LiveChanges {
  cursor: string;
  /** 원고·상태가 바뀌었거나 새로 생긴 장. 같은 변경이 두 번 올 수 있어 version으로 거른다. */
  chapters: ChapterInfo[];
  /** 의견·수정 제안이 바뀐 장 */
  sharedChapterIds: Uuid[];
  /** 조판 값이 바뀌었으면 새 값 */
  layout: Layout | null;
  presence: PresentPerson[];
}

export interface Live {
  reportPresence(projectId: Uuid, chapterId: Uuid, paragraphId: string | null): Promise<void>;
  changes(projectId: Uuid, templateId: TemplateId, since: string | null): Promise<LiveChanges>;
}

export function createHttpLive(http: HttpClient, tokenFor: (projectId: Uuid) => string | null): Live {
  return {
    async reportPresence(projectId, chapterId, paragraphId) {
      await http.request<null>("POST", `/projects/${projectId}/presence`, {
        token: tokenFor(projectId),
        body: { chapter_id: chapterId, paragraph_id: paragraphId },
      });
    },

    async changes(projectId, templateId, since) {
      const query = since ? `?since=${encodeURIComponent(since)}` : "";
      const res = await http.request<S["ChangesOut"]>("GET", `/projects/${projectId}/changes${query}`, { token: tokenFor(projectId) });
      return {
        cursor: res.cursor,
        chapters: res.chapters.map(toChapterInfo),
        sharedChapterIds: res.shared_chapter_ids,
        layout: res.layout ? fillLayout(templateId, res.layout) : null,
        presence: res.presence.map((p) => ({
          participant_id: p.participant_id,
          role: p.role,
          display_name: p.display_name,
          chapter_id: p.chapter_id ?? null,
          paragraph_id: p.paragraph_id ?? null,
        })),
      };
    },
  };
}
