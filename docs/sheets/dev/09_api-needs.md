# 개발 문서 · api-needs

> 원본은 Google 시트 '개발 문서'의 'api-needs' 탭이에요. `scripts/sheets_to_md.py`가 만든 파일이라 직접 고치지 않아요.

화면이 서버에 바라는 읽기·쓰기를 화면 순서로 적은 목록이에요(혜린 초안 11.20). 경로와 모양은 잠정이고, 정모님 API 문서와 맞춘 뒤 '확정 경로'를 채워요. '1차 data/ 함수'는 web/src/data/repository.ts의 함수예요. HTTP 어댑터를 만들 때 이 함수를 이 API로 바꾸면 화면은 고치지 않아도 돼요(NFR-15 ①). 필드 이름은 data-contract, 권한은 요구사항 정의서와 UX 설계서 '2 IA'를 따라요.

## 1. 공통 약속

| 번호 | 항목 | 잠정값 | 근거 | 확정 (정모) |
| --- | --- | --- | --- | --- |
| C-1 | 인증 | 편집자 토큰이나 참여자 토큰을 Authorization: Bearer 헤더로 보낸다. 서버는 토큰 해시로 사람을 찾는다 | NFR-13, 리뷰 B-2, db 3번 participant.token_hash |  |
| C-2 | 권한 | 권한이 없으면 403, 토큰이 없거나 틀리면 401. 화면은 버튼을 숨기지만 서버가 다시 막는다 | NFR-01 ③ |  |
| C-3 | 오류 모양 | { code, message } 한 가지. code로 화면이 안내 문구를 고른다 | NFR-06 |  |
| C-4 | 원고 충돌 | 원고를 바꾸는 요청에는 base_version을 보낸다. 다르면 409와 최신 버전을 돌려준다 | NFR-04, NFR-08 |  |
| C-5 | id | 책·장·의견·수정 제안 id는 화면이 UUID로 만들어 보낸다. 토큰은 서버가 만든다 | routes 규칙 1, db 1번 |  |
| C-6 | 시각 | 서버가 정한다. 화면은 보여 주기만 한다 | FR-39 ③, db 1번 |  |
| C-7 | 실시간 | 몇 초 간격으로 A-31을 부른다(잠정). SSE로 바꾸면 A-31만 바뀐다 | Q-25, FR-18 |  |
| C-8 | 타입 | FastAPI의 OpenAPI에서 openapi-typescript로 웹 타입을 만든다 | db 1번 |  |
| C-9 | AI 요청 | 화면은 원문을 보내지 않고 장 id와 base_version만 보낸다. 서버가 저장본을 읽는다 | db 4번, 리뷰 안건 5 |  |
| C-10 | 서버 주소·CORS | 웹은 서버 주소를 NEXT_PUBLIC_API_URL에서 읽는다(코드에 주소를 쓰지 않음). 서버는 CORS에 웹 주소만 허용한다(환경 변수 CORS_ORIGINS, 주소를 하나씩 적고 *는 쓰지 않음. 개발은 http://localhost:3000). 토큰은 C-1처럼 헤더로 보내므로 쿠키는 쓰지 않는다. (11.20: 변수 이름을 코드에 맞춰 CORS_ALLOW_ORIGINS → CORS_ORIGINS) | 11.20 배포 논의(서버 Railway, DB Neon 모두 싱가포르), 하네스 R12 | 확정 11.20 |

## 2. 화면별 API

| 번호 | 화면 | 하는 일 | 읽기·쓰기 | 잠정 경로 (혜린) | 보내는 것 | 받는 것 | 누가 | 관련 요구사항 | 1차 data/ 함수 | 확정 경로 (정모) | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-01 | 모든 화면 | 나 확인 | 읽기 | GET /me | (헤더의 토큰) | 종류(편집자·참여자), participant_id, 역할, 이름, 책 id | 토큰을 가진 사람 | NFR-01, FR-06 ④ | getParticipant |  | 화면이 처음 열릴 때 부른다. 같은 브라우저 재방문 때 이름을 묻지 않는 것도 이것으로 |
| A-02 | ST-01 | 책 만들기 | 쓰기 | POST /projects | id, title, template_id, 첫 장 id | project, 첫 chapter, editor_token(이때만), 편집자 링크 주소 | 누구나 | FR-01, FR-10, FR-46 | createProject, createChapter |  | 편집자 토큰은 이 응답에서만 받는다. 서버는 해시만 저장 |
| A-03 | HM-01 | 내 책 목록 | 읽기 | GET /projects |  | 책 카드(제목, 템플릿, 진행 단계, 참여자, 확인할 일 수, 최근 변경 시각) | 편집자 | FR-02, FR-03, FR-13 | listProjects |  | 확인할 일 수는 서버가 first_view로 센다(FR-02 ②) |
| A-04 | JN-03 | 편집자 링크로 들어오기 | 읽기 | GET /me (주소의 토큰으로) | token | A-01과 같음 | 링크를 가진 사람 | FR-46 | (1차 없음) |  | 맞으면 화면이 토큰을 저장하고 /home으로 |
| A-05 | JN-01 | 초대 링크 확인 | 읽기 | GET /invites/{token} |  | 책 제목, 역할, 할 수 있는 일, 상태(유효·쓸 수 없음) | 누구나 | FR-06, FR-08 | findRoleLink, getProject |  | 쓸 수 없으면 JN-02 |
| A-06 | JN-01 | 참여하기 | 쓰기 | POST /invites/{token}/join | display_name, anon_id | participant, participant_token(이때만) | 링크를 가진 사람 | FR-06, FR-07 | createParticipant |  |  |
| A-07 | WS-02 | 초대 링크 목록 | 읽기 | GET /projects/{id}/invites |  | 역할별 링크(주소, 만든 시각, 상태) | 편집자 | FR-05 | listRoleLinks |  |  |
| A-08 | WS-02 | 초대 링크 만들기 | 쓰기 | POST /projects/{id}/invites | role | 초대 링크 | 편집자 | FR-05 | createRoleLink |  |  |
| A-09 | WS-02 | 새로 바꾸기·취소 | 쓰기 | POST /invites/{id}/rotate, POST /invites/{id}/revoke |  | 새 링크 또는 바뀐 상태 | 편집자 | FR-08 | (1차 없음) |  |  |
| A-10 | WS-01 | 책 열기 | 읽기 | GET /projects/{id} |  | 책(제목, 템플릿, 조판 값, 쪽 공통 설정, 마지막으로 바꾼 사람·시각), 장 목록(id, 순서, 제목, 상태, version), 참여자 | 참여자 | FR-10, FR-11, FR-16, FR-44 | getProject, listChapters, listParticipants |  | 미리보기(PV-01)도 이것과 A-11을 쓴다 |
| A-11 | WS-30 | 장 읽기 | 읽기 | GET /chapters/{id} |  | 장(doc, version, status, updated_at) | 참여자 | FR-09, FR-17 | getChapter |  |  |
| A-12 | WS-32 | 원고 저장 | 쓰기 | PUT /chapters/{id}/doc | doc, base_version | 새 version, 저장 시각 | 작가 | FR-09, NFR-04, NFR-06, NFR-08 | updateChapter |  | 입력이 멈추면 저장(간격은 화면). 409면 최신 원고를 받아 다시 그린다 |
| A-13 | WS-22 | 장 추가 | 쓰기 | POST /projects/{id}/chapters | id, title | chapter | 편집자, 작가(Q-20) | FR-15 | createChapter |  |  |
| A-14 | WS-31 | 장 상태 바꾸기 | 쓰기 | POST /chapters/{id}/status | to(review_requested · reviewed · editing) | chapter | 작가(검토 요청), 편집자(검토 완료·다시 열기) | FR-12, FR-13, FR-14 | updateChapter |  | 검토 완료 때 대기 수정 제안이 남아 있으면 화면이 먼저 확인한다(X-22) |
| A-15 | WS-04 | 조판 값 바꾸기 | 쓰기 | PATCH /projects/{id}/layout | 바꾼 값(템플릿, 판형, 여백 4개, 제본 여백, 행간, 글꼴, 크기, 쪽 공통 설정) | layout, 바꾼 사람, 시각 | 편집자, 디자이너 | FR-16, FR-44, FR-45 | updateProject |  | 슬라이더는 놓을 때 한 번 보낸다('정할 것' 15번) |
| A-16 | WS-42 | 실시간 교정 | 쓰기 (AI) | POST /chapters/{id}/live-check | paragraph_ids, base_version | 대기 AI 제안 목록 | 작가 | FR-20, NFR-03, NFR-09 | 데모 제공자 + saveAiSuggestions |  | 저장(A-12)이 끝난 버전으로 부른다. 실패해도 입력은 막지 않는다 |
| A-17 | WS-43 | 장 검토 실행 | 쓰기 (AI) | POST /chapters/{id}/review | base_version | 작업 id 또는 결과 | 편집자 | FR-21, FR-22 | 데모 제공자 + saveAiSuggestions |  | 오래 걸리면 A-18로 진행을 읽는다 |
| A-18 | WS-41 | AI 진행 상태 | 읽기 | GET /ai-jobs/{id} |  | 분석 중·실패·한도, 결과 | 실행한 사람 | NFR-03, NFR-09, NFR-10 | (1차 없음) |  | 응답을 기다려도 되면 빼도 된다(정모) |
| A-19 | WS-42 | 내 AI 제안 목록 | 읽기 | GET /chapters/{id}/ai-suggestions |  | 내 대기 제안. 다른 사람 것은 오지 않는다 | 작가, 편집자 | FR-23, FR-24 | listAiSuggestions |  |  |
| A-20 | WS-46 | AI 제안 처리 | 쓰기 | POST /ai-suggestions/{id}/apply · undo · dismiss · keep | 고른 수정안(apply), base_version | 제안, apply면 새 원고 version | 본인(apply·undo는 작가) | FR-27, FR-28, FR-30 | updateAiSuggestion (+ updateChapter, createStyleRule) |  | apply를 서버가 반영(결정 11.20 혜린). 화면은 base_version을 보내고 새 원고 version을 받아 다시 그린다. 그사이 원고가 바뀌었으면 409(C-4). undo도 서버가 되돌린다(바로 앞 동작일 때만, X-04) |
| A-21 | WS-05 | 보내기 | 쓰기 | POST /ai-suggestions/{id}/send | as(comment · suggested_edit), 다듬은 문구, 이유, 종류 | 만든 의견 또는 수정 제안 | 편집자(작가는 의견으로만) | FR-29 | updateAiSuggestion + createComment · createSuggestedEdit |  | 수정 제안이면 카드 하나(설명용 의견 없음, FR-29 ⑤) |
| A-22 | WS-47 | 함께 봄 목록 | 읽기 | GET /chapters/{id}/shared?type=&status= | type(comment · suggested_edit), status(open · all) | 의견(답글 포함), 수정 제안 | 참여자 | FR-32~FR-36, NFR-11 | listComments, listSuggestedEdits |  |  |
| A-23 | WS-35 | 의견 남기기·답글 | 쓰기 | POST /chapters/{id}/comments | id, anchor, original, body, parent_id | comment | 모두 | FR-32 | createComment |  |  |
| A-24 | WS-49 | 의견 해결·다시 열기 | 쓰기 | POST /comments/{id}/resolve, /reopen |  | comment(해결한 사람·시각) | 쓴 사람, 편집자(Q-21) | FR-36 | updateComment |  |  |
| A-25 | WS-35 | 수정 제안 남기기 | 쓰기 | POST /chapters/{id}/suggested-edits | id, anchor, original, replacement, reason, kind | suggested_edit | 편집자 | FR-33 | createSuggestedEdit |  | 이유는 비워도 된다(Q-22) |
| A-26 | WS-48 | 수락·거절 | 쓰기 | POST /suggested-edits/{id}/accept, /reject | base_version | suggested_edit, accept면 새 원고 version | 받은 사람(작가) | FR-34, FR-35 | updateSuggestedEdit, updateChapter, mergeAiSuggestion |  | 수락은 서버가 원고에 반영하고 원래 AI 제안을 반영됨으로 바꾼다(결정 11.20 혜린, X-07·X-13). 그사이 원고가 바뀌었으면 409(C-4) |
| A-27 | 카드 공통 | 처음 본 기록 | 쓰기 | POST /views | target_type, target_id | 없음 | 받는 사람 | FR-02 ②, KPI 최초 확인 시간 | (1차 없음) |  | 카드를 화면에 연 때. 서버가 first_view에 처음 한 번만 남긴다 |
| A-28 | WS-51 | 표기 원칙 | 읽기·쓰기 | GET · POST /projects/{id}/style-rules | type, text | 원칙 목록 | 추가는 누구나, 수정·삭제는 편집자 | FR-31(Could), FR-30 | listStyleRules, createStyleRule |  |  |
| A-29 | WS-03 | 검토본 | 읽기·쓰기 | GET · POST /chapters/{id}/snapshots, GET /snapshots/{id} | label | 검토본 목록, 검토본 하나 | 저장은 편집자, 보기는 모두 | FR-38 | listSnapshots, createSnapshot |  |  |
| A-30 | WS-13 | 접속자와 작업 위치 | 쓰기 | POST /projects/{id}/presence | chapter_id, paragraph_id | 지금 접속한 사람과 각자 위치 | 참여자 | FR-19, FR-47 | (1차 없음) |  | 몇 초마다. 내 위치 알리기 전용, 접속자 목록은 A-31로 받는다. 이벤트로 쌓지 않는다 |
| A-31 | WS-01 | 바뀐 것 받기 | 읽기 | GET /projects/{id}/changes?since= (또는 SSE /projects/{id}/stream) | since(커서) | 바뀐 장(version), 새 의견·수정 제안·상태, 조판 값, 접속자, 다음 커서 | 참여자 | FR-18, FR-19 | (1차 없음) |  | Q-25. 화면은 받은 목록으로 A-11·A-22를 다시 읽는다. 입력 중인 문단은 덮어쓰지 않는다(FR-18 ④) |
| A-32 | WS-52 | AI 대화 | 쓰기 (AI) | POST /chapters/{id}/ai-chat | 요청(자유 또는 빠른 요청 종류), 대상(anchor 또는 장), base_version | 답 글, 만든 AI 제안 목록 | 작가, 편집자 | FR-50(Could) | (1차 없음) |  | 대화 내용은 저장하지 않는다 |
| A-33 | 모든 화면 | 이벤트 보내기 | 쓰기 | POST /events | 이벤트 목록(공통 칸) | 없음 | 모두 | FR-39 | appendEvent |  | 묶어서 보낸다. 화면을 떠날 때는 sendBeacon |
| A-34 | DV-01 | 퍼널과 작업 지표 | 읽기 | GET /dev/metrics | 기간 | 퍼널 단계별 수, KPI 값과 건수 | 팀 | FR-40, FR-49 | listEvents |  | 개발용. 막을 방법은 정모 |
| A-35 | PV-01 | 미리보기 | 읽기 | (새 API 없음) A-10, A-11 |  |  | 모두 | FR-43 |  |  | 화면이 같은 CSS(Paged.js)로 그린다. 원고를 고치는 API를 부르지 않는다 |
