# 개발 문서 · data-contract

> 원본은 Google 시트 '개발 문서'의 'data-contract' 탭이에요. `scripts/sheets_to_md.py`가 만든 파일이라 직접 고치지 않아요.

화면과 서버가 같이 쓰는 데이터의 모양이에요. 수요일까지는 이 문서와 웹 타입이 원본이고, 목요일의 FastAPI 모델이 같은 모양을 따라요(M5). 지금은 틀이에요. 엔터티와 필드는 회의록의 논리 ERD 초안을, 상태 값은 A6과 UX 설계서 '9 상태(대상)' 탭을 옮겼어요. 정모님이 C3 예시 JSON과 용어집에 맞춰 이름과 필드를 확정해요. 노란 칸이 정모님 칸이고, 용어집의 이름 칸은 혜린이 아는 것만 적었어요.

## 1. 엔터티

| 엔터티 (회의록 초안) | 뜻 | 주요 필드 (회의록 초안) | 쓰는 화면 | 1차에 필요한가 | 용어집의 이름 | 확정 이름 (정모) | 수용 여부 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| project | 책 한 권을 만드는 작업 단위 (A1) | id, title, template_id, layout(판형·여백·행간), layout_updated_by·layout_updated_at(가칭), created_at | ST-01, HM-04, WS-01 | 필요 |  | project | 보류 | layout은 조판 설정 값(FR-16, UX 설계서 I-25, 11.18). 템플릿 기본값에서 바꾼 값만 담을지는 정모님이 정함. 템플릿을 바꾸면 layout을 그 템플릿 기본값으로 되돌린다. 마지막으로 바꾼 사람과 시각을 패널에 보여 주려고 두 칸이 필요(FR-16 ④⑤, 11.18 혜린) |
| chapter | 장. 원고 본문을 담는다 | id, project_id, order, title, status, doc(문단 id 포함), version | WS-20, WS-21, WS-30 | 필요 |  | chapter | 수용 | doc은 P1의 편집기 문서. status는 '2. 상태 값'의 장 |
| role_link | 역할마다 다른 초대 링크 | token, project_id, role, revoked_at | WS-02, JN-01 | 필요 |  | role_link | 수용 | revoked_at은 링크 재발급(2차)에 쓴다. token은 무작위 UUID(v4). 책과 역할은 token으로 찾는다. 발급은 원칙적으로 서버. 수요일 1차는 서버가 없어 브라우저(crypto.randomUUID)로 임시 발급하고, 목요일에 서버 발급으로 바꾼다(모양은 그대로). 정모 확정 11.18 |
| participant | 책에 들어온 사람 | id, project_id, anon_id, role, display_name | JN-01, WS-12, WS-13 | 필요 | member | participant | 수용 | 요구사항 정의서 '문서 간 차이' 10번. role 값은 editor · author · designer · viewer (viewer는 D8 결정 전, 1차에 없음) |
| ai_suggestion | AI가 낸 고칠 거리. 보내기 전까지 본인만 본다 (A3) | C3 필드(id, 위치, 원문, 수정안, 종류, 이유, 출처, 대상 역할, 기준 원고 버전, 생성 시각) + status, owner_participant_id | WS-33, WS-46 | 필요 |  | ai_suggestion | 보류 | C3 예시 JSON이 원본. Q-06. 초안은 '3. 예시 JSON'(11.18 혜린). anchor의 start·end는 문단 글자 위치(0부터, end는 포함하지 않음). 위치가 어긋나면 original 문구로 다시 찾는다(NFR-05). 수정안은 replacement 1개 + alternatives 최대 2개(C3) |
| suggested_edit | 수정 제안. 수락하면 원고에 반영된다 (A4) | id, chapter_id, anchor, original, replacement, author_id, status, ai_origin_id | WS-34, WS-48 | 필요 | suggestion | suggested_edit | 수용 | 문서 간 차이' 10번 |
| comment | 의견. 원고를 바꾸지 않는 말 (A4) | id, chapter_id, anchor, body, author_id, status, parent_id, ai_origin_id | WS-35, WS-49 | 필요 |  | comment | 수용 | parent_id는 답글에 쓴다 |
| style_rule | 표기 원칙의 한 줄. 통일 규칙이거나 유지 표현 (A9) | id, project_id, type(rule · keep), text, created_by | WS-46, WS-51 | 유지 표현만 필요 |  | style_rule | 수용 | 이 표현 유지'(FR-30)가 쓴다. 목록 화면(FR-31)은 Could |
| snapshot | 검토본. 저장한 때의 장 원고 | id, chapter_id, doc, label, created_by, created_at | WS-03 | 필요 |  | snapshot | 수용 |  |
| event | 행동 기록 | event_id, name, ts, anon_id, session_id, participant_id, project_id, chapter_id, role, path, props | DV-01 | 필요 |  | event | 수용 | events 탭 |
| anchor | 원고 위치. 의견, 수정 제안, AI 제안이 가리키는 자리 (A2) | paragraph_id, start, end | WS-33, WS-34 | 필요 | range | anchor | 수용 | 엔터티가 아니라 다른 엔터티 안에 드는 값 묶음. 문단 id + 글자 위치(P5). start/end는 그 문단의 서식 제외 텍스트 기준, 0부터 시작, start 포함·end 제외, JS 문자열 인덱스 단위. 문단을 나누거나 합칠 때의 처리는 P6(목요일 이후). '문서 간 차이' 10번. 정모 확정 11.18 |

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
| 실시간 교정 1개<br>(초안, 정모님 확인 전)<br><br>작가가 para_02를 고치면 데모 모드가 돌려주는 응답 | JSON → [json/data-contract_B38.json](json/data-contract_B38.json) |
| 장 검토 1개<br>(초안, 정모님 확인 전)<br><br>편집자가 장 검토를 누르면 돌려주는 응답. 4·5번 제안은 같은 자리에 겹침(FR-25, Q-16 확인용) | JSON → [json/data-contract_B39.json](json/data-contract_B39.json) |
| 예시 원고 1장<br>(초안, 정모님 확인 전)<br><br>데모의 시작 원고(src/fixtures). 문단 id는 읽기 쉽게 짧게 썼고 실제로는 UUID | JSON → [json/data-contract_B40.json](json/data-contract_B40.json) |

## 4. 필드

| 엔터티 | 필드 | 뜻 | 타입 | 필수 | 값의 범위나 예 | 쓰는 화면 | 수용 여부 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| project | id | 책의 ID. 브라우저에서 만든다 | string (UUID) | 필수 | 0b9f6c2e-7d41-4a8e-9c53-1f2e3d4a5b6c | ST-01, WS-01 | 보류 | 예시 줄이에요. 이 아래로 엔터티마다 필드를 한 줄씩 더해 주세요. ID는 브라우저에서 UUID로 만든다(충돌 방지 규칙 2) |
