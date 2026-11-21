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

/** 여백 4개(mm). 안쪽·바깥쪽은 펼침면 기준(FR-16 ①). */
export interface Margins {
  top: number;
  bottom: number;
  inner: number;
  outer: number;
}

export type RunningHeader = "none" | "book_title" | "chapter_title";

/** 쪽 번호 위치(F7 확정): 바깥쪽 아래 · 가운데 아래 · 없음. */
export type PageNumberPosition = "bottom_outer" | "bottom_center" | "none";

/** 쪽 공통 설정의 한쪽 면(FR-44 ②). 비어 있으면 '없음'으로 본다. */
export interface PageSide {
  page_number?: PageNumberPosition | null;
  header?: RunningHeader | null;
}

/**
 * 조판 값(FR-16, FR-44, FR-45). 서버 계약(api.ts Layout)과 같은 이름. 판형은 "폭x높이"(mm).
 * 서버는 칸을 선택값으로 두지만, 화면은 템플릿 기본값으로 채운 뒤 쓴다(domain/layout.ts fillLayout).
 */
export interface Layout {
  trim: string;
  margin: Margins;
  binding: number;
  line_height: number;
  font_family: string;
  font_size: number;
  running?: { left?: PageSide | null; right?: PageSide | null } | null;
}

export interface Project {
  id: Uuid;
  title: string;
  template_id: TemplateId;
  layout: Layout;
  layout_updated_by: Uuid | null;
  layout_updated_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at?: IsoDateTime;
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

/** 초대 링크(A-07~09). 주소는 서버가 만들어 준다(D-37). 편집자 링크는 여기에 없다. */
export interface RoleLink {
  id: Uuid;
  project_id: Uuid;
  role: Role;
  url: string;
  revoked_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

/** 초대 링크 확인(A-05). 쓸 수 없으면 책·역할을 알려 주지 않는다(JN-02). */
export type InviteCheck = { state: "valid"; project_id: Uuid; project_title: string; role: Role } | { state: "unusable" };

/** 편집자 홈의 책 카드(A-03, FR-02). */
export interface ProjectCard {
  id: Uuid;
  title: string;
  template_id: TemplateId;
  stage: ChapterStatus;
  participants: { id: Uuid; role: Role; display_name: string }[];
  todo_count: number;
  updated_at: IsoDateTime;
  first_chapter_id: Uuid | null;
}

export interface Participant {
  id: Uuid;
  project_id: Uuid;
  /** 1차 브라우저 저장 구현만 쓴다. 서버는 다른 사람의 anon_id를 돌려주지 않는다. */
  anon_id?: Uuid;
  role: Role;
  display_name: string;
}

/** AI 제안의 근거(F6 RAG, D-26, data-contract ai_suggestion.evidence). 장 검토에서만 붙어요. */
export interface Evidence {
  /** norm: 어문 규범 조항, chapter: 같은 책의 다른 장 문단 */
  type: "norm" | "chapter";
  /** 예: 한글 맞춤법 제42항, 2장 1문단 */
  label: string;
  excerpt: string;
  chunk_id: string;
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
  /** 근거. 서버(F6)만 채워요. 1차 데모 구현과 예시 데이터에는 없어요. */
  evidence?: Evidence | null;
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
  /** 수정 이유(비워도 됨, Q-22)와 종류. AI 제안에서 보낸 카드에도 담긴다(FR-29 ⑤, FR-33). */
  reason?: string | null;
  kind?: AiSuggestionKind | null;
}

export interface Comment {
  id: Uuid;
  chapter_id: Uuid;
  anchor: Anchor;
  /**
   * 의견을 단 자리의 원문. 위치가 어긋나면 이 글자로 다시 찾는다(NFR-05).
   * W4 잠정 칸: data-contract의 comment에는 아직 없다(시트 반영 대기).
   */
  original: string;
  body: string;
  author_id: Uuid;
  status: CommentStatus;
  parent_id: Uuid | null;
  ai_origin_id: Uuid | null;
  /** 해결한 사람과 시각(FR-36). */
  resolved_by?: Uuid | null;
  resolved_at?: IsoDateTime | null;
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
  version?: number;
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
  /** 그때의 원고 버전(events 탭 공통 칸, F8). 지면 영향 확인 시간 KPI에 써요. 장과 무관하면 null. */
  chapter_version?: number | null;
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
