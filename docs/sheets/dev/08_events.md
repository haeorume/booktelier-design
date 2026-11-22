# 개발 문서 · events

> 원본은 Google 시트 '개발 문서'의 'events' 탭이에요. `scripts/sheets_to_md.py`가 만든 파일이라 직접 고치지 않아요.

사용자의 행동을 어떤 이름과 칸으로 남기는지예요. 정의는 혜린, 저장은 정모님이 맡아요(M7). 지금은 틀이에요. 공통 칸과 퍼널 이벤트 이름은 회의록의 초안을 옮겼고, AI 제안 이벤트는 회의록 C11에 한글 이름만 있어서 코드 이름을 비워 둬어요. 노란 칸은 정모님이 채우거나 확정하는 칸이에요. 이벤트는 처음부터 최종 형식으로 기록하고, 1차에는 브라우저에 저장했어요. 2차부터는 서버가 받아 event 테이블에 저장하고, 강사님 KPI에 맞춰 공통 칸 5개(server_ts 등)를 더했어요(db 탭 5번).

## 1. 공통 칸

| 칸 | 타입 (정모) | 필수 (정모) | 뜻 | 수용 여부 | 근거 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| event_id | string(UUID) | 필수 | 이벤트 하나의 ID | 보류 | 회의록 '관측 설계' | 이벤트 하나를 구분 |
| name | string | 필수 | 이벤트 이름. '2. 이벤트'의 이름 | 보류 | 회의록 '관측 설계' | 확정한 19개 이름 중 하나 |
| ts | integer | 필수 | 일어난 시각. ms 단위 | 보류 | 회의록 '관측 설계', FR-39 | 북엔드 제공 로그는 시각이 시간 단위라 순서와 체류를 볼 수 없었다 |
| anon_id | string(UUID) | 필수 | 브라우저에 저장하는 익명 id. 로그인이 없어 이것으로 사람을 구분한다 | 보류 | 회의록 '관측 설계', NFR-13 | 기기를 바꾸면 다른 사람으로 센다 |
| session_id | string(UUID) | 필수 | 한 번의 방문 | 보류 | 회의록 '관측 설계' | 방문을 끊는 기준은 회의록에 없다. '정할 것' 12번 |
| participant_id | string(UUID) | 선택 | 역할 링크로 들어와 이름을 넣으면 붙는 참여자 id | 보류 | 회의록 '관측 설계' | 책을 만든 편집자에게도 붙는지는 회의록에 없다. '정할 것' 13번 |
| project_id | string(UUID) | 선택 | 책 | 보류 | 회의록 '관측 설계' | 책을 만들기 전(ST-01)에는 없음 |
| chapter_id | string(UUID) | 선택 | 장 | 보류 | 회의록 '관측 설계' | 장과 무관한 이벤트가 많음 (project_created, role_link_copied 등) |
| role | string(editor, author, designer) | 선택 | 그때의 역할 (editor · author · designer) | 보류 | 회의록 '관측 설계' | 책을 만들기 전 화면에는 역할이 없음 |
| path | string | 필수 | 화면 경로 | 보류 | 회의록 '관측 설계' | routes 탭의 주소 |
| props | object(JSON) | 선택 | 이벤트마다 다른 추가 정보 | 보류 | 회의록 '관측 설계', M2 | DB는 추가 정보를 JSON으로 담을 수 있는 것으로 고른다(M2) |
| server_ts | string(ISO 8601) | 필수 | 서버가 이벤트를 받은 시각 | 보류 | FR-39 ③, DB 설계 초안(11.19) | 2차에 더한 칸. ts는 브라우저 시각이라 기기 시계가 틀리면 순서가 어긋난다. KPI는 이 시각으로 센다 |
| chapter_version | integer | 선택 | 그때의 원고 버전 | 보류 | 강사님 KPI '원고 버전 ID' | 2차에 더한 칸. 지면 영향 확인 시간(db 5번)에 쓴다 |
| target_type | string | 선택 | 이벤트가 가리키는 대상의 종류 (ai_suggestion · suggested_edit · comment) | 보류 | 강사님 KPI '수정 요청 ID' | 2차에 더한 칸. 지금은 props에 제안 id를 넣는데 칸으로 꺼낸다 |
| target_id | string(UUID) | 선택 | 대상의 id | 보류 | 강사님 KPI '수정 요청 ID' | 2차에 더한 칸 |
| status_after | string | 선택 | 그 일 뒤 대상의 상태 | 보류 | 강사님 KPI '상태' | 2차에 더한 칸. 값은 data-contract '2. 상태 값' |

## 2. 이벤트

| 이벤트 이름 (초안) | 묶음 | 퍼널 단계 | 언제 남기나 | 누가 | 화면 | 추가 정보(props)에 담을 것 | 이름의 출처 | 확정 이름 (정모) | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| project_created | 퍼널 | 1 | 만들기를 눌러 책이 만들어졌을 때 | 편집자 | ST-01 |  | 회의록 초안 | project_created | 정할 것' 6번 |
| template_selected | 퍼널 | 2 | 1단계와 같은 때, 이어서 | 편집자 | ST-01 | 고른 템플릿 | 회의록 초안 | template_selected | 정할 것' 6·7번 |
| role_link_copied | 퍼널 | 3 | 링크 복사를 눌렀을 때 | 편집자 | WS-02 | 링크의 역할 | 회의록 초안 | role_link_copied | 3단계에서 작가 링크와 디자이너 링크로 두 번 남는다 |
| role_link_opened | 퍼널 | 4 | 링크로 들어오기 화면이 열렸을 때 | 작가, 디자이너 | JN-01 | 링크의 역할 | 회의록 초안 | role_link_opened | 퍼널 4단계는 작가로 열었을 때만 센다 |
| participant_joined | 퍼널 | 46154 | 들어가기를 눌러 참여자가 만들어졌을 때 | 작가, 디자이너 | JN-01 | 역할 | 회의록 초안 | participant_joined | 역할로 나눠 5단계(작가)와 12단계(디자이너)로 센다. '정할 것' 14번 |
| first_edit | 퍼널 | 6 | 작가가 이 책의 원고를 처음 바꿨을 때 한 번 | 작가 | WS-01 | 직접 고쳤는지, 카드를 적용했는지 | 회의록 초안 | first_edit | 정할 것' 8번 |
| review_requested | 퍼널 | 7 | 검토 요청을 눌렀을 때 | 작가 | WS-31 |  | 회의록 초안 | review_requested |  |
| chapter_review_run | 퍼널, AI 제안 | 8 | 장 검토를 눌렀을 때 | 편집자 | WS-43 |  | 회의록 초안 | chapter_review_run | C11의 '장 검토 실행'과 같은 이벤트. '정할 것' 10번 |
| ai_suggestion_sent | 퍼널, AI 제안 | 9 | 보내기 창에서 보내기를 눌렀을 때 | 편집자, 작가(의견으로만) | WS-05 | 제안 id, 종류, 보낸 방식(의견, 수정 제안) | 회의록 초안 | ai_suggestion_sent | C11의 '보냄'과 같은 이벤트 |
| suggested_edit_accepted | 퍼널 | 10 | 수락을 눌렀을 때 | 받은 사람(데모에서는 작가) | WS-48 | 수정 제안 id, AI 제안에서 왔는지 | 회의록 초안 | suggested_edit_accepted | 정할 것' 10번 |
| snapshot_saved | 퍼널 | 11 | 검토본 저장을 눌렀을 때 | 편집자 | WS-03 |  | 회의록 초안 | snapshot_saved |  |
| layout_changed | 퍼널 | 13 | 조판 값을 바꿔 저장됐을 때 | 디자이너, 편집자 | WS-04 | 바꾼 항목(템플릿, 판형, 여백, 행간), 바꾸기 전과 뒤의 값, 템플릿을 바꿔 기본값으로 돌아갔는지 | 혜린 초안 (11.18) | layout_changed | 마지막 단계. 슬라이더를 끄는 동안 여러 번 남지 않게 하는 방법은 '정할 것' 15번 |
| ai_suggestion_shown | AI 제안 |  | 밑줄과 카드가 화면에 떴을 때 | 작가, 편집자 | WS-33, WS-46 | 제안 id, 역할, 종류, 나온 곳(live_check · chapter_review · chat) | C11 (한글 이름만 있음) | ai_suggestion_shown |  |
| ai_suggestion_applied | AI 제안 |  | 카드에서 적용을 눌렀을 때 | 작가 | WS-46 | 제안 id, 역할, 종류 | C11 (한글 이름만 있음) | ai_suggestion_applied | 편집자도 적용할 수 있는지는 Q-02 |
| ai_suggestion_dismissed | AI 제안 |  | 카드에서 무시를 눌렀을 때 | 작가, 편집자 | WS-46 | 제안 id, 역할, 종류 | C11 (한글 이름만 있음) | ai_suggestion_dismissed | 1차 코드 이름(web/src/events/names.ts)으로 바로잡음(11.20). 사람의 수정 제안 거절은 아래 suggested_edit_rejected |
| ai_suggestion_merged | AI 제안 |  | 보낸 수정 제안이 수락돼 원래 AI 제안이 반영됨이 됐을 때 | 시스템 | WS-48 | 제안 id, 종류 | C11 (한글 이름만 있음) | ai_suggestion_merged | 10단계 이벤트와 같은 때에 남는다. 따로 둘지는 '정할 것' 11번. '문서 간 차이' 3번 |
| ai_suggestion_kept | AI 제안 |  | 카드에서 이 표현 유지를 눌렀을 때 | 작가, 편집자 | WS-46 | 제안 id, 역할, 종류 | C11 보완 (한글 이름만 있음) | ai_suggestion_kept | AI가 틀렸다는 신호라 정모님 쪽에 가장 쓸모 있다(C11 보완). '문서 간 차이' 5번 |
| screen_entered | 체류 |  | 화면에 들어왔을 때 | 모두 | 모든 화면 |  | 회의록 '관측 설계' (이름 없음) | screen_entered |  |
| screen_left | 체류 |  | 탭을 숨기거나 닫을 때 | 모두 | 모든 화면 |  | 회의록 '관측 설계' (이름 없음) | screen_left |  |
| suggested_edit_rejected | 수정 제안 |  | 받은 수정 제안에서 거절을 눌렀을 때 | 받은 사람(작가) | WS-48 | 수정 제안 id, AI 제안에서 왔는지 | 1차 코드 W4 (잠정) | suggested_edit_rejected | 수정 처리 시간 KPI(거절은 따로 셈) |
| review_completed | 검토 |  | 검토 완료를 눌렀을 때 | 편집자 | WS-31 | 대기로 남은 수정 제안 수 | 혜린 초안 (11.20) | review_completed | 승인 소요 시간·수정 누락률 KPI. '정할 것' 27번 |
| chapter_added | 원고 |  | 장 추가로 새 장이 생겼을 때 | 편집자, 작가 | WS-22 | 장 순서 | 혜린 초안 (11.20) | chapter_added | FR-15 |
| invite_link_created | 참여 |  | 초대 창에서 초대 링크를 만들었을 때 | 편집자 | WS-02 | 링크의 역할 | 혜린 초안 (11.20) | invite_link_created | FR-05. 3단계 복사(role_link_copied)는 그대로 |
| invite_link_rotated | 참여 |  | 초대 링크를 새로 바꿨을 때 | 편집자 | WS-02 | 링크의 역할 | 혜린 초안 (11.20) | invite_link_revoked | FR-08 |
| invite_link_revoked | 참여 |  | 초대 링크를 취소했을 때 | 편집자 | WS-02 | 링크의 역할 | 혜린 초안 (11.20) | invite_link_revoked | FR-08 |
| editor_link_opened | 참여 |  | 편집자 링크로 들어왔을 때 | 편집자 | JN-03 | 이 브라우저에 이미 토큰이 있었는지 | 혜린 초안 (11.20) | editor_link_opened | FR-46. 다른 브라우저에서 다시 온 것을 셈(리텐션 보조) |
| comment_resolved | 의견 |  | 의견을 해결로 바꿨을 때 | 쓴 사람, 편집자 | WS-49 | 의견 id | 혜린 초안 (11.20) | comment_resolved | FR-36 |
| comment_reopened | 의견 |  | 해결한 의견을 다시 열었을 때 | 쓴 사람, 편집자 | WS-49 | 의견 id | 혜린 초안 (11.20) | comment_reopened | FR-36 |
| preview_opened | 지면 |  | 미리보기를 열었을 때 | 모두 | PV-01 | 연 곳(상단 바, 주소 직접) | 혜린 초안 (11.20) | preview_opened | 공통 칸 chapter_version으로 지면 영향 확인 시간 KPI에 쓴다. 열린 뒤 다시 그린 것은 남기지 않는다 |
| presence_jumped | 함께 작업 |  | 아바타를 눌러 그 사람의 작업 위치로 갔을 때 | 모두 | WS-13 | 간 사람의 역할 | 혜린 초안 (11.20) | presence_jumped | FR-47. 위치 자체는 이벤트로 쌓지 않는다 |
| ai_chat_sent | AI 제안 |  | AI 대화에서 요청을 보냈을 때 | 작가, 편집자 | WS-52 | 빠른 요청 종류 또는 자유 요청, 대상(문장·장). 요청 글자는 담지 않는다 | 혜린 초안 (11.20) | ai_chat_sent | FR-50(Could). 답에서 만든 카드는 ai_suggestion_shown의 나온 곳 = chat |
| save_failed | 시스템 |  | 원고 저장이 실패하거나 연결이 끊겼을 때 | 시스템 | WS-14 | 실패 종류(서버 오류, 연결 끊김, 버전 충돌) | 혜린 초안 (11.20) | save_failed | NFR-06. 다시 시도해 성공해도 실패한 기록은 남긴다 |

## 3. 지표

| 지표 | 계산 | 쓰는 이벤트 | 한계와 비고 |
| --- | --- | --- | --- |
| 퍼널 | 단계별 도달 수와 이탈 수. /dev/events에서 본다 | 퍼널 1~13단계의 이벤트 (5·12단계는 역할로 나눔) | 한 브라우저 데모에서는 anon_id가 하나다 |
| 리텐션 | 같은 anon_id가 다른 날 다시 오는지 | 모든 이벤트의 anon_id와 ts | 기기를 바꾸면 다른 사람으로 센다. 발표 때 밝힌다 |
| 체류 시간 | 화면에 들어올 때와 나갈 때의 시각 차이 | 화면 들어옴, 화면 나감 | 나가는 이벤트는 탭을 숨기거나 닫을 때 보낸다 |
| 수정 재반영 | 작가가 수정한 뒤 편집자가 지면에서 확인하기까지의 단계 수와 시간 | 어느 이벤트로 잴지는 미검토 | 해결한 문제를 보여 줄 지표. 기획서 H2(수정 1건당 처리 단계 수)와 이어진다 |
