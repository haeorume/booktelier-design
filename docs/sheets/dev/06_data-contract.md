# 개발 문서 · data-contract

> 원본은 Google 시트 '개발 문서'의 'data-contract' 탭이에요. `scripts/sheets_to_md.py`가 만든 파일이라 직접 고치지 않아요.

화면과 서버가 같이 쓰는 데이터의 모양이에요. 1차(11.18)까지는 이 문서와 웹 타입이 원본이었어요(M5). 2차부터는 이 탭에서 이름과 모양을 합의하고, 코드에서는 API 모양은 FastAPI의 Pydantic 모델, 테이블 모양은 SQLAlchemy 모델과 Alembic 마이그레이션이 원본이 돼요. 웹 타입은 Pydantic에서 나온 OpenAPI로 만들어요(db 탭 1번). 엔터티와 필드는 회의록의 논리 ERD 초안을, 상태 값은 A6과 UX 설계서 '9 상태(대상)' 탭을 옮겼어요. '4. 필드'는 DB 설계 초안(11.19)과 11.20 RAG 논의의 잠정값이고, DB 타입과 키도 같이 적었어요. 테이블을 넘는 것(저장소, 색인, RAG 자료)은 db 탭에 있어요. 정모님이 C3 예시 JSON과 용어집에 맞춰 이름과 필드를 확정해요. 노란 칸이 정모님 칸이고, 용어집의 이름 칸은 혜린이 아는 것만 적었어요.

## 1. 엔터티

| 엔터티 (회의록 초안) | 뜻 | 주요 필드 (회의록 초안) | 쓰는 화면 | 1차에 필요한가 | 용어집의 이름 | 확정 이름 (정모) | 수용 여부 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| project | 책 한 권을 만드는 작업 단위 (A1) | id, title, template_id, layout(판형·여백·행간), layout_updated_by·layout_updated_at(가칭), created_at | ST-01, HM-04, WS-01 | 필요 |  | project | 수용 | layout은 조판 설정 값(FR-16, UX 설계서 I-25, 11.18). 템플릿 기본값에서 바꾼 값만 담을지는 정모님이 정함. 템플릿을 바꾸면 layout을 그 템플릿 기본값으로 되돌린다. 마지막으로 바꾼 사람과 시각을 패널에 보여 주려고 두 칸이 필요(FR-16 ④⑤, 11.18 혜린) |
| chapter | 장. 원고 본문을 담는다 | id, project_id, order, title, status, doc(문단 id 포함), version | WS-20, WS-21, WS-30 | 필요 |  | chapter | 수용 | doc은 P1의 편집기 문서. status는 '2. 상태 값'의 장 |
| role_link | 역할마다 다른 초대 링크 | token, project_id, role, revoked_at | WS-02, JN-01 | 필요 |  | role_link | 수용 | revoked_at은 링크 재발급(2차)에 쓴다. token은 무작위 UUID(v4). 책과 역할은 token으로 찾는다. 발급은 원칙적으로 서버. 수요일 1차는 서버가 없어 브라우저(crypto.randomUUID)로 임시 발급하고, 목요일에 서버 발급으로 바꾼다(모양은 그대로). 정모 확정 11.18 |
| participant | 책에 들어온 사람 | id, project_id, anon_id, role, display_name | JN-01, WS-12, WS-13 | 필요 | member | participant | 수용 | 요구사항 정의서 '문서 간 차이' 10번. role 값은 editor · author · designer · viewer (viewer는 D8 결정 전, 1차에 없음) |
| ai_suggestion | AI가 낸 고칠 거리. 보내기 전까지 본인만 본다 (A3) | C3 필드(id, 위치, 원문, 수정안, 종류, 이유, 출처, 대상 역할, 기준 원고 버전, 생성 시각) + status, owner_participant_id | WS-33, WS-46 | 필요 |  | ai_suggestion | 수용 | C3 예시 JSON이 원본. Q-06. 초안은 '3. 예시 JSON'(11.18 혜린). anchor의 start·end는 문단 글자 위치(0부터, end는 포함하지 않음). 위치가 어긋나면 original 문구로 다시 찾는다(NFR-05). 수정안은 replacement 1개 + alternatives 최대 2개(C3) |
| suggested_edit | 수정 제안. 수락하면 원고에 반영된다 (A4) | id, chapter_id, anchor, original, replacement, author_id, status, ai_origin_id | WS-34, WS-48 | 필요 | suggestion | suggested_edit | 수용 | 문서 간 차이' 10번 |
| comment | 의견. 원고를 바꾸지 않는 말 (A4) | id, chapter_id, anchor, body, author_id, status, parent_id, ai_origin_id, original | WS-35, WS-49 | 필요 |  | comment | 수용 | parent_id는 답글에 쓴다, original(의견을 단 자리의 원문, 위치가 어긋나면 이 글자로 다시 찾음) |
| style_rule | 표기 원칙의 한 줄. 통일 규칙이거나 유지 표현 (A9) | id, project_id, type(rule · keep), text, created_by | WS-46, WS-51 | 유지 표현만 필요 |  | style_rule | 수용 | 이 표현 유지'(FR-30)가 쓴다. 목록 화면(FR-31)은 Could |
| snapshot | 검토본. 저장한 때의 장 원고 | id, chapter_id, doc, label, created_by, created_at | WS-03 | 필요 |  | snapshot | 수용 |  |
| event | 행동 기록 | event_id, name, ts, anon_id, session_id, participant_id, project_id, chapter_id, role, path, props | DV-01 | 필요 |  | event | 수용 | events 탭 |
| anchor | 원고 위치. 의견, 수정 제안, AI 제안이 가리키는 자리 (A2) | paragraph_id, start, end | WS-33, WS-34 | 필요 | range | anchor | 수용 | 엔터티가 아니라 다른 엔터티 안에 드는 값 묶음. 문단 id + 글자 위치(P5). start/end는 그 문단의 서식 제외 텍스트 기준, 0부터 시작, start 포함·end 제외, JS 문자열 인덱스 단위. 문단을 나누거나 합칠 때의 처리는 P6(목요일 이후). '문서 간 차이' 10번. 정모 확정 11.18 |
| chapter_revision | 원고 버전. 저장할 때마다 그때의 장 원고를 남긴다 | id, chapter_id, version, doc, cause, created_by, created_at | 없음 (변경 이력 FR-37) | 2차 |  |  | 보류 | 새 엔터티(DB 설계 초안 11.19). 강사님 KPI '원고 버전 ID'. 언제 남길지는 '정할 것' 19번 |
| first_view | 받는 사람이 의견·수정 제안을 처음 본 기록 | target_type, target_id, participant_id, first_viewed_at | HM-04, WS-48, WS-49 | 2차 |  |  | 보류 | 새 엔터티(DB 설계 초안 11.19). 강사님 KPI '최초 확인 시간'. 받는 사람이 여럿이라 칸이 아니라 테이블 |
| rag_chunk | AI가 근거로 찾아 쓰는 글 조각(어문 규범 조항, 같은 책의 다른 장 문단)과 그 벡터 | id, source, project_id, chapter_id, chapter_version, paragraph_id, label, content, embedding, created_at | 없음 (장 검토 서버) | 2차 |  |  | 보류 | 새 엔터티(11.20 RAG 논의). 화면에는 오지 않는 서버 전용 테이블. 책 원칙(style_rule)은 넣지 않는다. 원고 조각은 project_id로 같은 책만 찾는다. db 탭 4번 |

## 2. 상태 값

| 대상 | 화면에 쓰는 이름 | 뜻 | 코드 값 (회의록 초안) | 1차에 쓰나 | 코드 값 (용어집) | 확정 값 (정모) | 수용 여부 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI 제안 | 대기 | 아직 처리하지 않은 제안 | open | 쓴다 | pending | pending | 수용 | A6, Q-11. '문서 간 차이' 10번 |
| AI 제안 | 적용됨 | 작가가 적용해 원고가 바뀌었다 | applied | 쓴다 |  | applied | 수용 |  |
| AI 제안 | 무시됨 | 무시해서 다시 뜨지 않는다 | dismissed | 쓴다 |  | dismissed | 수용 |  |
| AI 제안 | 보냄 | 의견이나 수정 제안으로 보냈다 | sent | 쓴다 |  | sent | 수용 |  |
| AI 제안 | 반영됨 | 보낸 수정 제안을 받은 사람이 수락했다 | merged | 쓴다 | 용어집에 없음 | merged | 수용 | 문서 간 차이' 3번 |
| AI 제안 | 무효 | 원고가 먼저 바뀌었거나 유지하기로 정했다 | stale | 쓴다 |  | stale | 수용 | 카드를 어떻게 보일지는 Q-15, '문서 간 차이' 2번 |
| 장 | 수정 중 | 작가가 쓰고 고치는 중 |  | 쓴다 | 용어집에 정의 없음 | editing | 수용 | Q-07. 오름님 가이드는 '작성 중'을 더한 4개('문서 간 차이' 7번) |
| 장 | 검토 요청 | 작가가 검토를 요청했다 |  | 쓴다 |  | review_requested | 수용 |  |
| 장 | 검토 완료 | 편집자가 검토를 마쳤다 |  | 쓴다 |  | reviewed | 수용 |  |
| 수정 제안 | 대기 | 받은 사람이 아직 처리하지 않았다 |  | 쓴다 |  | pending | 수용 | 용어집에는 '보류'(hold)가 더 있다. '문서 간 차이' 4번 |
| 수정 제안 | 수락됨 | 수락해서 원고에 반영됐다 |  | 쓴다 |  | accepted | 수용 |  |
| 수정 제안 | 거절됨 | 거절해서 원문 그대로다 |  | 쓴다 |  | rejected | 수용 |  |
| 수정 제안 | 원문 삭제됨 | 가리키던 문장이 지워졌다 |  | P5: 규칙은 지금, 구현은 이후 |  | source_deleted | 수용 |  |
| 의견 | 열림 | 아직 해결되지 않았다 |  | 쓴다 |  | open | 수용 |  |
| 의견 | 해결됨 | 해결로 표시했다 |  | 쓴다 |  | resolved | 수용 |  |

## 3. 예시 JSON

| 이름 | 내용 (혜린 초안 11.18. 정모님이 확인하고, 다르면 고쳐 붙여 주세요) |
| --- | --- |
| 실시간 교정 1개<br>(초안, 정모님 확인 전)<br><br>작가가 para_02를 고치면 데모 모드가 돌려주는 응답 | JSON → [json/data-contract_B41.json](json/data-contract_B41.json) |
| 장 검토 1개<br>(초안, 정모님 확인 전)<br><br>편집자가 장 검토를 누르면 돌려주는 응답. 4·5번 제안은 같은 자리에 겹침(FR-25, Q-16 확인용) | JSON → [json/data-contract_B42.json](json/data-contract_B42.json) |
| 예시 원고 1장<br>(초안, 정모님 확인 전)<br><br>데모의 시작 원고(src/fixtures). 문단 id는 읽기 쉽게 짧게 썼고 실제로는 UUID | JSON → [json/data-contract_B43.json](json/data-contract_B43.json) |

## 4. 필드

| 엔터티 | 필드 | 뜻 | 타입 (정모) | 필수 (정모) | 값의 범위나 예 | 쓰는 화면 | 수용 여부 | 비고 | DB 타입 (정모) | 키·제약 (정모) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| project | id | 책의 ID. 브라우저에서 만든다 | string (UUID) | 필수 | 0b9f6c2e-7d41-4a8e-9c53-1f2e3d4a5b6c | ST-01, WS-01 | 보류 | 브라우저가 UUID로 만들고 서버가 형식과 중복을 확인한다(충돌 방지 규칙 2) | uuid | PK |
| project | title | 책 제목 | string | 필수 | 파리에서 보낸 일주일 | ST-01, HM-04 | 보류 | 비어 있으면 만들 수 없다(FR-01) | text | NOT NULL |
| project | template_id | 고른 템플릿 | string | 필수 | novel · essay · practical | ST-01, WS-04 | 보류 | 템플릿 3종(FR-10). 코드 값 이름은 정모님 확정 | text | NOT NULL |
| project | layout | 조판 설정 값(판형·여백·행간) | object (JSON) | 필수 | {trim, margin, line_height} | WS-04, WS-30 | 보류 | 바꾼 값만 담을지는 '1. 엔터티' project 비고 | jsonb | NOT NULL |
| project | layout_updated_by | 조판을 마지막으로 바꾼 참여자 | string (UUID) | 선택 |  | WS-04 | 보류 | FR-16 ⑤ | uuid | FK participant.id |
| project | layout_updated_at | 조판을 마지막으로 바꾼 시각 | string (ISO 8601) | 선택 |  | WS-04 | 보류 | FR-16 ⑤ | timestamptz |  |
| project | created_at | 책을 만든 시각 | string (ISO 8601) | 필수 |  | HM-04 | 보류 | 시각은 모두 서버가 정한다(db 1번) | timestamptz | NOT NULL, 기본값 now() |
| project | updated_at | 책 안에서 마지막으로 바뀐 시각 | string (ISO 8601) | 필수 |  | HM-04 | 보류 | 새 칸(DB 초안 11.19). 홈 카드의 최근 변경을 이벤트 대신 여기서 읽는다(리뷰 R-5) | timestamptz | NOT NULL |
| chapter | id | 장 ID | string (UUID) | 필수 | 3f1c9a52-6b0e-4d7a-9e21-5c8b7a0d4e11 | WS-01 | 보류 |  | uuid | PK |
| chapter | project_id | 속한 책 | string (UUID) | 필수 |  | WS-20 | 보류 |  | uuid | FK project.id |
| chapter | sort_order | 장 순서 | integer | 필수 | 1 | WS-20, WS-21 | 보류 | 예시 JSON의 order. order는 SQL 예약어라 이름을 바꾸자는 안(DB 초안 11.19) | integer | NOT NULL, (project_id, sort_order) 유일 |
| chapter | title | 장 제목 | string | 필수 | 1장 파리에서 보낸 첫 주 | WS-21 | 보류 |  | text | NOT NULL |
| chapter | status | 장 상태 | string | 필수 | editing · review_requested · reviewed | WS-21, WS-31 | 보류 | 값은 '2. 상태 값'의 장(정모 확정) | text | NOT NULL, 기본값 'editing' |
| chapter | version | 원고 버전. 저장할 때마다 1씩 오른다 | integer | 필수 | 3 | WS-30 | 보류 | 저장 충돌 확인에 쓴다. 내가 본 버전과 다르면 서버가 거절한다(리뷰 R-1) | integer | NOT NULL, 기본값 1 |
| chapter | doc | 원고 본문. 문단 id가 있는 편집기 문서 | object (JSON) | 필수 | 예시 원고 1장('3. 예시 JSON') | WS-30 | 보류 | P1(정모 결정 '이대로') | jsonb | NOT NULL |
| chapter | status_changed_at | 장 상태가 바뀐 시각 | string (ISO 8601) | 선택 |  | HM-04 | 보류 | 새 칸(DB 초안 11.19) | timestamptz |  |
| chapter | updated_at | 마지막으로 저장한 시각 | string (ISO 8601) | 필수 |  | HM-04 | 보류 | 새 칸(DB 초안 11.19) | timestamptz | NOT NULL |
| chapter_revision | id | 원고 버전 행의 ID | string (UUID) | 필수 |  | 없음 (서버 기록) | 보류 | 새 테이블(DB 초안 11.19). 강사님 KPI '원고 버전 ID', 변경 이력(FR-37) | uuid | PK |
| chapter_revision | chapter_id | 어느 장의 버전인지 | string (UUID) | 필수 |  |  | 보류 |  | uuid | FK chapter.id |
| chapter_revision | version | 버전 번호 | integer | 필수 | 3 |  | 보류 | chapter.version과 같은 번호 | integer | NOT NULL, (chapter_id, version) 유일 |
| chapter_revision | doc | 그 버전의 원고 | object (JSON) | 필수 |  |  | 보류 |  | jsonb | NOT NULL |
| chapter_revision | cause | 바뀐 까닭 | string | 필수 | typing · ai_applied · edit_accepted · undo |  | 보류 | 직접 입력, AI 제안 적용, 수정 제안 수락, 실행 취소를 가린다 | text | NOT NULL |
| chapter_revision | created_by | 바꾼 참여자 | string (UUID) | 필수 |  |  | 보류 |  | uuid | FK participant.id |
| chapter_revision | created_at | 남긴 시각 | string (ISO 8601) | 필수 |  |  | 보류 | 언제 남길지는 '정할 것' 19번 | timestamptz | NOT NULL |
| role_link | token | 링크에 들어가는 값 | string (UUID v4) | 필수 |  | WS-02, JN-01 | 수용 | 정모 확정 11.18. 2차부터 서버가 발급한다 | uuid | PK |
| role_link | project_id | 링크의 책 | string (UUID) | 필수 |  | JN-01 | 보류 |  | uuid | FK project.id |
| role_link | role | 링크의 역할 | string | 필수 | author · designer | WS-02 | 보류 | 편집자 링크는 두지 않는다(routes 2. 역할별 진입). viewer는 D8 결정 전 | text | NOT NULL |
| role_link | revoked_at | 다시 발급해서 막은 시각 | string (ISO 8601) | 선택 |  | JN-02 | 보류 | 링크 재발급(FR-08, 2차) | timestamptz |  |
| role_link | created_at | 만든 시각 | string (ISO 8601) | 필수 |  |  | 보류 | 새 칸(DB 초안 11.19) | timestamptz | NOT NULL |
| participant | id | 참여자 ID | string (UUID) | 필수 |  | JN-01, WS-13 | 보류 | 책을 만든 편집자도 참여자를 하나 만든다('정할 것' 13번 잠정값) | uuid | PK |
| participant | project_id | 들어온 책 | string (UUID) | 필수 |  |  | 보류 |  | uuid | FK project.id |
| participant | role | 역할 | string | 필수 | editor · author · designer | WS-12 | 보류 | 받은 링크의 역할로 고정(NFR-01) | text | NOT NULL |
| participant | display_name | 들어올 때 넣은 이름 | string | 필수 | 김작가 | JN-01, WS-13 | 보류 |  | text | NOT NULL |
| participant | anon_id | 브라우저 익명 ID | string (UUID) | 필수 |  |  | 보류 | events 공통 칸의 anon_id와 같은 값 | uuid | NOT NULL |
| participant | token_hash | 서버가 준 비밀 토큰의 해시 | 없음 (서버 전용) | 필수 |  |  | 보류 | 새 칸(DB 초안 11.19). 원문은 브라우저에만 둔다. 로그인 없이 남의 행세를 막는다(리뷰 B-3). 편집자 복구 링크도 같은 방식 | text | NOT NULL, 유일 |
| participant | created_at | 들어온 시각 | string (ISO 8601) | 필수 |  |  | 보류 | 새 칸(DB 초안 11.19) | timestamptz | NOT NULL |
| participant | last_seen_at | 마지막으로 접속한 시각 | string (ISO 8601) | 선택 |  | WS-13 | 보류 | 새 칸(DB 초안 11.19). 접속자 표시(FR-19) | timestamptz |  |
| ai_suggestion | id | AI 제안 ID | string (UUID) | 필수 | 5d0f8c1e-2a3b-4c5d-8e9f-0a1b2c3d4e01 | WS-46 | 보류 | C3. 서버가 만든다 | uuid | PK |
| ai_suggestion | chapter_id | 제안이 걸린 장 | string (UUID) | 필수 |  |  | 보류 |  | uuid | FK chapter.id |
| ai_suggestion | owner_participant_id | 제안을 받는 사람. 보내기 전까지 이 사람만 본다 | string (UUID) | 필수 |  | WS-42 | 보류 | FR-23. 다른 사람의 제안은 서버가 돌려주지 않는다 | uuid | FK participant.id, 색인(db 3번) |
| ai_suggestion | anchor | 원고 위치 | object (JSON) | 필수 | {paragraph_id, start, end} | WS-33 | 보류 | 모양은 아래 anchor 줄(정모 확정 11.18) | jsonb | NOT NULL |
| ai_suggestion | original | 원문 구절 | string | 필수 | 쏟아지는 것이 가능했고 | WS-46 | 보류 | 위치가 어긋나면 이 글자로 다시 찾는다(NFR-05) | text | NOT NULL |
| ai_suggestion | replacement | 수정안 | string | 필수 | 쏟아졌고 | WS-46 | 보류 | 1개(C3). 다른 장과 어긋남 카드에서는 비울 수 있다('정할 것' 22번) | text | NOT NULL |
| ai_suggestion | alternatives | 대안 | array (string) | 선택 | JSON → [json/data-contract_F90.json](json/data-contract_F90.json) | WS-46 | 보류 | 최대 2개(C3) | jsonb | 기본값 '[]' |
| ai_suggestion | kind | 종류 | string | 필수 | spelling · spacing · notation · polish | WS-46 | 보류 | FR-24. 다른 장과 어긋남을 더할지는 '정할 것' 22번 | text | NOT NULL |
| ai_suggestion | reason | 수정 이유 | string | 필수 | 예시 JSON의 reason 글 | WS-46 | 보류 | 모든 제안에 붙인다(A8) | text | NOT NULL |
| ai_suggestion | evidence | 근거. 찾아 쓴 어문 규범 조항이나 같은 책의 다른 장 문단 | object (JSON) | 선택 | {type: norm, label: 한글 맞춤법 제2항, excerpt, chunk_id} | WS-46 | 보류 | 새 칸(11.20 RAG 논의). 근거를 못 찾으면 비우고 화면에 '근거 없음'. 모양은 '정할 것' 21번 | jsonb |  |
| ai_suggestion | source | 어느 분석에서 나왔는지 | string | 필수 | live_check · chapter_review |  | 보류 | A10 | text | NOT NULL |
| ai_suggestion | target_role | 받는 역할 | string | 필수 | author · editor |  | 보류 | C10 | text | NOT NULL |
| ai_suggestion | base_version | 만들 때의 장 버전 | integer | 필수 | 2 |  | 보류 | 이 버전 뒤로 원고가 바뀌면 위치를 다시 확인한다 | integer | NOT NULL |
| ai_suggestion | status | 제안 상태 | string | 필수 | pending · applied · dismissed · sent · merged · stale | WS-46 | 보류 | 값은 '2. 상태 값'(정모 확정) | text | NOT NULL, 기본값 'pending' |
| ai_suggestion | status_reason | 무효가 된 까닭 | string | 선택 | source_changed · kept |  | 보류 | 새 칸(DB 초안 11.19). stale일 때만 | text |  |
| ai_suggestion | model | 제안을 낸 모델 | string | 선택 |  |  | 보류 | 새 칸(DB 초안 11.19). 모델 비교와 응답 시간 확인 | text |  |
| ai_suggestion | created_at | 만든 시각 | string (ISO 8601) | 필수 |  |  | 보류 |  | timestamptz | NOT NULL |
| ai_suggestion | decided_at | 적용·무시·보냄·무효가 된 시각 | string (ISO 8601) | 선택 |  |  | 보류 | 새 칸(DB 초안 11.19). KPI | timestamptz |  |
| suggested_edit | id | 수정 제안 ID | string (UUID) | 필수 |  | WS-48 | 보류 |  | uuid | PK |
| suggested_edit | chapter_id | 걸린 장 | string (UUID) | 필수 |  |  | 보류 |  | uuid | FK chapter.id |
| suggested_edit | author_id | 보낸 참여자 | string (UUID) | 필수 |  | WS-48 | 보류 |  | uuid | FK participant.id |
| suggested_edit | anchor | 원고 위치 | object (JSON) | 필수 | {paragraph_id, start, end} | WS-34 | 보류 |  | jsonb | NOT NULL |
| suggested_edit | original | 원문 구절 | string | 필수 |  | WS-34 | 보류 |  | text | NOT NULL |
| suggested_edit | replacement | 바꿀 글 | string | 필수 |  | WS-34 | 보류 |  | text | NOT NULL |
| suggested_edit | reason | 수정 이유 | string | 선택 |  | WS-48 | 보류 | 새 칸(리뷰 F-4). 보낼 때 의견을 따로 만들지 않고 카드 하나로 | text |  |
| suggested_edit | kind | 종류 | string | 선택 | spelling · spacing · notation · polish | WS-48 | 보류 | 새 칸(리뷰 F-4) | text |  |
| suggested_edit | status | 상태 | string | 필수 | pending · accepted · rejected · source_deleted | WS-48 | 보류 | 값은 '2. 상태 값'(정모 확정) | text | NOT NULL, 기본값 'pending' |
| suggested_edit | ai_origin_id | AI 제안에서 보냈으면 그 제안 | string (UUID) | 선택 |  | WS-48 | 보류 | 카드의 'AI 제안에서 보냄' 표시(A11) | uuid | FK ai_suggestion.id |
| suggested_edit | base_version | 만들 때의 장 버전 | integer | 필수 |  |  | 보류 | 새 칸(DB 초안 11.19) | integer | NOT NULL |
| suggested_edit | created_at | 보낸 시각 | string (ISO 8601) | 필수 |  |  | 보류 | 새 칸(DB 초안 11.19) | timestamptz | NOT NULL |
| suggested_edit | decided_at | 수락·거절한 시각 | string (ISO 8601) | 선택 |  |  | 보류 | 새 칸(DB 초안 11.19). KPI 수정 처리 시간 | timestamptz |  |
| suggested_edit | decided_by | 수락·거절한 참여자 | string (UUID) | 선택 |  |  | 보류 | 새 칸(DB 초안 11.19) | uuid | FK participant.id |
| comment | id | 의견 ID | string (UUID) | 필수 |  | WS-49 | 보류 |  | uuid | PK |
| comment | chapter_id | 걸린 장 | string (UUID) | 필수 |  |  | 보류 |  | uuid | FK chapter.id |
| comment | author_id | 남긴 참여자 | string (UUID) | 필수 |  | WS-49 | 보류 |  | uuid | FK participant.id |
| comment | parent_id | 답글이면 원래 의견 | string (UUID) | 선택 |  | WS-49 | 보류 |  | uuid | FK comment.id |
| comment | anchor | 원고 위치 | object (JSON) | 선택 | {paragraph_id, start, end} | WS-35 | 보류 | 답글은 비운다 | jsonb |  |
| comment | original | 의견을 단 자리의 원문 | string | 선택 |  | WS-35 | 보류 | 위치가 어긋나면 이 글자로 다시 찾는다 | text |  |
| comment | body | 의견 내용 | string | 필수 |  | WS-49 | 보류 | 비어 있으면 보낼 수 없다 | text | NOT NULL |
| comment | status | 상태 | string | 필수 | open · resolved | WS-49 | 보류 | 값은 '2. 상태 값'(정모 확정) | text | NOT NULL, 기본값 'open' |
| comment | ai_origin_id | AI 제안에서 보냈으면 그 제안 | string (UUID) | 선택 |  | WS-49 | 보류 |  | uuid | FK ai_suggestion.id |
| comment | created_at | 남긴 시각 | string (ISO 8601) | 필수 |  |  | 보류 | 새 칸(DB 초안 11.19) | timestamptz | NOT NULL |
| comment | resolved_at | 해결한 시각 | string (ISO 8601) | 선택 |  | WS-49 | 보류 | 새 칸(리뷰 F-3) | timestamptz |  |
| comment | resolved_by | 해결한 참여자 | string (UUID) | 선택 |  |  | 보류 | 새 칸(리뷰 F-3) | uuid | FK participant.id |
| style_rule | id | 책 원칙 한 줄의 ID | string (UUID) | 필수 |  | WS-51 | 보류 |  | uuid | PK |
| style_rule | project_id | 속한 책 | string (UUID) | 필수 |  |  | 보류 |  | uuid | FK project.id |
| style_rule | type | 종류 | string | 필수 | rule · keep | WS-46, WS-51 | 보류 | 통일 규칙(rule)과 유지 표현(keep). 톤 원칙을 어떻게 둘지는 '정할 것' 28번 | text | NOT NULL |
| style_rule | text | 원칙이나 표현 | string | 필수 | 루브르 | WS-51 | 보류 | 임베딩하지 않고 책마다 통째로 프롬프트에 넣는다(db 4번) | text | NOT NULL |
| style_rule | created_by | 더한 참여자 | string (UUID) | 필수 |  |  | 보류 |  | uuid | FK participant.id |
| style_rule | created_at | 더한 시각 | string (ISO 8601) | 필수 |  |  | 보류 | 새 칸(DB 초안 11.19) | timestamptz | NOT NULL |
| snapshot | id | 검토본 ID | string (UUID) | 필수 |  | WS-03 | 보류 |  | uuid | PK |
| snapshot | chapter_id | 어느 장의 검토본인지 | string (UUID) | 필수 |  |  | 보류 |  | uuid | FK chapter.id |
| snapshot | version | 저장한 장 버전 | integer | 필수 |  | WS-03 | 보류 | 새 칸(DB 초안 11.19) | integer | NOT NULL |
| snapshot | doc | 저장한 때의 원고 | object (JSON) | 필수 |  | WS-03 | 보류 | 읽기 전용 | jsonb | NOT NULL |
| snapshot | label | 검토본 이름 | string | 필수 | 1차 검토 | WS-03 | 보류 |  | text | NOT NULL |
| snapshot | created_by | 저장한 참여자 | string (UUID) | 필수 |  |  | 보류 | 저장은 편집자만(routes WS-03) | uuid | FK participant.id |
| snapshot | created_at | 저장한 시각 | string (ISO 8601) | 필수 |  | WS-03 | 보류 |  | timestamptz | NOT NULL |
| first_view | target_type | 처음 본 대상의 종류 | string | 필수 | suggested_edit · comment | HM-04, WS-48, WS-49 | 보류 | 새 테이블(DB 초안 11.19). 받는 사람이 여럿이라 칸이 아니라 테이블. 강사님 KPI 최초 확인 시간 | text | PK 일부 |
| first_view | target_id | 대상 ID | string (UUID) | 필수 |  |  | 보류 |  | uuid | PK 일부 |
| first_view | participant_id | 처음 본 참여자 | string (UUID) | 필수 |  |  | 보류 |  | uuid | PK 일부, FK participant.id |
| first_view | first_viewed_at | 처음 본 시각 | string (ISO 8601) | 필수 |  |  | 보류 |  | timestamptz | NOT NULL |
| rag_chunk | id | 조각 ID | string (UUID) | 필수 |  | 없음 (서버 전용) | 보류 | 새 테이블(11.20 RAG 논의). 화면에는 evidence.chunk_id로만 나간다 | uuid | PK |
| rag_chunk | source | 자료 종류 | 없음 (서버 전용) | 필수 | norm · chapter |  | 보류 | norm은 어문 규범, chapter는 같은 책의 다른 장. 책 원칙(style_rule)은 넣지 않는다 | text | NOT NULL |
| rag_chunk | project_id | 원고 조각이 속한 책 | 없음 (서버 전용) | 선택 |  |  | 보류 | 규범은 비운다. 검색할 때 이 값으로 같은 책만 거른다. 다른 책 원고가 섞이지 않게 꼭 거른다 | uuid | FK project.id |
| rag_chunk | chapter_id | 원고 조각의 장 | 없음 (서버 전용) | 선택 |  |  | 보류 | 검토 중인 장은 검색에서 뺀다 | uuid | FK chapter.id |
| rag_chunk | chapter_version | 임베딩한 때의 장 버전 | 없음 (서버 전용) | 선택 |  |  | 보류 | 그 뒤로 장이 바뀌었으면 다시 임베딩한다('정할 것' 23번) | integer |  |
| rag_chunk | paragraph_id | 원고 조각의 문단 | 없음 (서버 전용) | 선택 | para_02 |  | 보류 | 근거 표시(3장 2문단)에 쓴다 | text |  |
| rag_chunk | label | 근거로 보여 줄 이름 | 없음 (서버 전용) | 필수 | 한글 맞춤법 제35항 붙임 2 | WS-46 | 보류 | ai_suggestion.evidence.label로 나간다 | text | NOT NULL |
| rag_chunk | content | 조각 본문 | 없음 (서버 전용) | 필수 |  |  | 보류 | 규범은 조항 본문과 예시만. 해설은 이용 조건 확인 뒤('정할 것' 25번) | text | NOT NULL |
| rag_chunk | embedding | 벡터 | 없음 (서버 전용) | 필수 |  |  | 보류 | 차원은 임베딩 모델을 따른다('정할 것' 26번). 규범, 원고, 검색 질의는 같은 모델로 | vector(N) | NOT NULL, 벡터 색인(db 3번) |
| rag_chunk | created_at | 넣은 시각 | 없음 (서버 전용) | 필수 |  |  | 보류 |  | timestamptz | NOT NULL |
| event | (events 탭) | 행동 기록 |  |  |  | DV-01 | 보류 | 필드는 events 탭 '1. 공통 칸'이 원본이에요. server_ts 등 2차에 더한 칸도 거기에 있어요. DB에서는 FK 없이 id만 남긴다(db 2번) |  |  |
| anchor | paragraph_id | 문단 ID | string | 필수 | para_02 | WS-33, WS-34 | 수용 | 정모 확정 11.18. 실제로는 UUID | (jsonb 안) |  |
| anchor | start | 시작 글자 위치 | integer | 필수 | 57 | WS-33, WS-34 | 수용 | 서식 제외 텍스트 기준, 0부터, 이 글자 포함. JS 문자열 인덱스 | (jsonb 안) |  |
| anchor | end | 끝 글자 위치 | integer | 필수 | 69 | WS-33, WS-34 | 수용 | 이 글자는 포함하지 않는다 | (jsonb 안) |  |
