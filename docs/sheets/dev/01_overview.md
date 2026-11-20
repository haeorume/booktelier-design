# 개발 문서 · 개요

> 원본은 Google 시트 '개발 문서'의 '개요' 탭이에요. `scripts/sheets_to_md.py`가 만든 파일이라 직접 고치지 않아요.

## 북틀리에 개발 문서

| 버전 | v0.4 (2026.11.20 낮). 프론트 부분을 최종 MVP로: routes(편집자 링크, 미리보기, 토큰 규칙), events(프론트 이벤트 13개, ai_suggestion_dismissed 바로잡음), api-needs 탭과 최종 점검(프론트) 탭 새로. 11.20 15시 DB·배포 결정을 더함: db 1번(Neon 싱가포르, 사람별 브랜치, 발표용 프로젝트 분리, CI pgvector 컨테이너, SQLAlchemy 2 + Alembic, psycopg 3, rag_chunk 관리), data-contract 머리말, api-needs C-10(서버 주소·CORS), 정할 것 29번(서버 Railway). v0.3은 11.20 오전(2차 서버·DB 준비: db 탭, data-contract '4. 필드', events 공통 칸 5개, '정할 것' 19~28번), v0.2는 11.18, v0.1은 11.17 |
| --- | --- |
| 작성 | 구혜린. data-contract, events, db는 정모님이 확정 |
| 범위 | 1차 MVP(11.18)를 만들 때 저장소 docs/에 넣은 기준 문서에, 최종 MVP(11.26)의 화면·서버·DB 문서를 더하고 있어요. 프론트 부분(routes, events의 화면 이벤트, api-needs, 최종 점검(프론트))은 혜린, AI·API·DB·백엔드는 정모님 문서와 합칩니다. 탭 하나가 md 파일 하나예요. |
| 기준 문서 | 경계 합의 및 MVP 준비 회의(11.16), 요구사항 정의서 v0.4, UX 설계서 v0.4, 최종 MVP 간극 논의판(11.20, rev 7), 최종 MVP 범위(프로젝트 문서 11.20) |
| 요구사항 정의서 | https://docs.google.com/spreadsheets/d/1UOQLNPNgKTWjcNXtr5qc3z2a28FaMaNSo1EIjFBpXqU |
| UX 설계서 | https://docs.google.com/spreadsheets/d/1SXDiRolcVkRwV0mcVEU54Q5xR-pwEK0LFid4ivxtBnU |
| FigJam 그림 | https://www.figma.com/board/Kj3agAXAFEFFpN1GsYIJPk |
| 회의록 | https://app.notion.com/p/41aab1969cf581cd863de826d8dcfa19 |
| 읽는 법 | 11.16 회의 결과가 대부분 보류라서 추천안을 잠정값으로 쓰고 줄마다 수용 여부를 붙였어요. 화면 ID(ST, HM, JN, WS, DV), 요구사항 ID(FR, NFR), 미결 사항(Q), 과업(TK), 회의 항목(A, B, C, P, M, D, T)은 다른 문서의 번호를 그대로 써요. 노란 칸은 정하는 사람이 채우는 칸이에요. |
| 저장소로 옮길 때 | 시트가 원본이에요. 탭을 md 표로 내보내 docs/에 탭 이름과 같은 파일로 넣어요(routes 탭은 docs/routes.md). 저장소의 md를 직접 고치지 않고, 시트를 고친 뒤 다시 내보내요. '정할 것' 탭은 내보내지 않아요. |

## 탭 안내

| 탭 | docs 파일 | 담은 것 | 초안 | 확정 | 상태 | 먼저 필요한 것 |
| --- | --- | --- | --- | --- | --- | --- |
| routes | docs/routes.md | 화면, 주소, 역할별 진입 | 혜린 | 혜린 | 초안 | 정할 것' 1~5번 |
| demo-flow | docs/demo-flow.md | 데모 플로우 13단계. 퍼널 단계이자 끝까지 눌러 보는 테스트의 순서 | 혜린 | 혜린 | 초안 | 정할 것' 4, 6~9번 |
| boundary | docs/boundary.md | 11.16 경계 합의 회의의 결과. 누가 무엇을 정하는지 | 혜린 | 혜린, 정모 | 초안 | 회의록에서 비어 있는 상태 칸(B1, C, P2, P4~P6, M) |
| spec-p0 | docs/spec-p0.md | 1차 기능마다 권한, 상태, 이벤트, 완료 기준 | 혜린 | 혜린 (정모 확인) | 작성 중 | 요구사항 정의서 '문서 간 차이' 3·4·5·8·9·10번, Q-02, Q-07, Q-12 |
| data-contract | docs/data-contract.md | 엔터티, 필드, 상태 값, 예시 JSON | 혜린 (틀과 화면에 필요한 것) | 정모 | 작성 중 | C3 예시 JSON 확인(11.18 혜린 초안 있음), '문서 간 차이' 10번 |
| db | docs/db.md | 저장소, 테이블 목록, 키와 색인, RAG 자료, KPI가 쓰는 칸 | 혜린 (잠정값) | 정모 | 작성 중 | 정할 것' 19~28번 |
| events | docs/events.md | 공통 칸, 퍼널 이벤트, AI 제안 이벤트, 지표 | 혜린 (퍼널 단계와 이벤트 이름) | 정모 | 작성 중 | 문서 간 차이' 10번, '정할 것' 6, 8, 10번 |
| api-needs | docs/api-needs.md | 화면별로 프론트가 백엔드에 바라는 읽기·쓰기 API와 공통 약속. 1차 data/ 함수와 짝지음 | 혜린 | 정모 (확정 경로) | 초안 |  |
| 최종 점검(프론트) | 내보내지 않음 | 최종 MVP를 화면에서 눌러 보는 점검표 QA-F01~30 | 혜린 | 혜린 | 초안 |  |
| 정할 것 | 내보내지 않음 | 이 문서를 쓰다 나온 질문과 잠정값 | 혜린 | 줄마다 다름 | 작성 중 |  |

## 표기

| 항목 | 뜻 |
| --- | --- |
| 수용 여부 | 수용 = 11.16 회의에서 합의로 기록 / 보류 = 정모님 검토 대기, 추천안을 잠정값으로 씀 / 미검토 = 회의에서 다루지 않아 이어 가려고 둔 값. 요구사항 정의서, UX 설계서와 같은 표기예요. |
| 릴리스 | 1차 = 11.18(수) 1차 MVP / 2차 = 목요일 이후 최종 MVP |
| 역할 | 편집자, 작가, 디자이너, 보기 전용. ○ 쓸 수 있음, △ 보기만, × 없음, ? D8 결정 전(보기 전용) |
| 퍼널 단계 | 데모 플로우의 1~13단계. 다른 문서의 ①~⑬과 같아요. |
| 노란 칸 | 정하는 사람이 채우는 칸. data-contract와 events에서는 정모님, '정할 것'에서는 '정하는 사람' 칸에 적힌 사람이에요. |

정하는 사람이 채우는 칸. data-contract, events, db에서는 정모님, '정할 것'에서는 '정하는 사람' 칸에 적힌 사람이에요.
