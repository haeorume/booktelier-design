// data-contract '1. 엔터티'의 확정 이름과 필드. 시각은 ISO 문자열, 이벤트 ts만 ms 숫자(D-08).
import type {
  AiSuggestionKind,
  AiSuggestionSource,
  AiSuggestionStatus,
  ChapterStatus,
  CommentStatus,
  PanelLayout,
  Role,
  StyleRuleType,
  SuggestedEditStatus,
  TemplateId,
} from "./status";

export type Uuid = string;
export type IsoDateTime = string;

/** 문단 id + 문단의 서식 제외 텍스트 기준 글자 위치. start 포함, end 제외, JS 문자열 인덱스(D-19). */
export interface Anchor {
  paragraph_id: string;
  start: number;
  end: number;
}

export interface TextNode {
  type: "text";
  text: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface ParagraphNode {
  type: "paragraph";
  attrs: { id: string };
  content?: TextNode[];
}

export interface ChapterDoc {
  type: "doc";
  content: ParagraphNode[];
}

/** 조판 값. 판형(trim), 여백(margin), 행간(line_height). 1차 잠정 이름. */
export interface Layout {
  trim: string;
  margin: number;
  line_height: number;
}

export interface Project {
  id: Uuid;
  title: string;
  template_id: TemplateId;
  layout: Layout;
  layout_updated_by: Uuid | null;
  layout_updated_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface Chapter {
  id: Uuid;
  project_id: Uuid;
  order: number;
  title: string;
  status: ChapterStatus;
  version: number;
  doc: ChapterDoc;
}

export interface RoleLink {
  token: Uuid;
  project_id: Uuid;
  role: Role;
  revoked_at: IsoDateTime | null;
}

export interface Participant {
  id: Uuid;
  project_id: Uuid;
  anon_id: Uuid;
  role: Role;
  display_name: string;
}

export interface AiSuggestion {
  id: Uuid;
  chapter_id: Uuid;
  anchor: Anchor;
  original: string;
  replacement: string;
  /** 최대 2개(C3). */
  alternatives: string[];
  kind: AiSuggestionKind;
  reason: string;
  source: AiSuggestionSource;
  target_role: Role;
  base_version: number;
  created_at: IsoDateTime;
  status: AiSuggestionStatus;
  owner_participant_id: Uuid;
}

export interface SuggestedEdit {
  id: Uuid;
  chapter_id: Uuid;
  anchor: Anchor;
  original: string;
  replacement: string;
  author_id: Uuid;
  status: SuggestedEditStatus;
  ai_origin_id: Uuid | null;
}

export interface Comment {
  id: Uuid;
  chapter_id: Uuid;
  anchor: Anchor;
  body: string;
  author_id: Uuid;
  status: CommentStatus;
  parent_id: Uuid | null;
  ai_origin_id: Uuid | null;
}

export interface StyleRule {
  id: Uuid;
  project_id: Uuid;
  type: StyleRuleType;
  text: string;
  created_by: Uuid;
}

export interface Snapshot {
  id: Uuid;
  chapter_id: Uuid;
  doc: ChapterDoc;
  label: string;
  created_by: Uuid;
  created_at: IsoDateTime;
}

export type EventProps = Record<string, unknown> & { panel_layout: PanelLayout };

export interface TrackedEvent {
  event_id: Uuid;
  name: string;
  ts: number;
  anon_id: Uuid;
  session_id: Uuid;
  participant_id: Uuid | null;
  project_id: Uuid | null;
  chapter_id: Uuid | null;
  role: Role | null;
  path: string;
  props: EventProps;
}

/** 실시간 교정 응답(data-contract 예시 JSON 1). */
export interface LiveCheckResult {
  source: "live_check";
  chapter_id: Uuid;
  paragraph_id: string;
  base_version: number;
  suggestions: AiSuggestion[];
}

/** 장 검토 응답(data-contract 예시 JSON 2). */
export interface ChapterReviewResult {
  source: "chapter_review";
  chapter_id: Uuid;
  base_version: number;
  summary: Record<AiSuggestionKind, number>;
  suggestions: AiSuggestion[];
}
