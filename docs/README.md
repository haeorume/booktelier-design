# 기준 문서 안내

`docs/sheets/`는 구글 시트(v0.4, 11.20)를 그대로 옮긴 것이라 양이 많고, 회의 때 값이 남은 곳도 있어요. 질문에 맞는 파일만 열어요.
경로는 모두 `docs/sheets/` 아래예요. 탭 전체 목록은 `docs/sheets/INDEX.md`.

## 질문별로 볼 곳

| 질문 | 파일 | 믿을 만한 정도 |
| --- | --- | --- |
| 이 기능이 무엇을 해야 하나, 언제 끝났다고 보나 | `requirements/02_functional.md`(FR), `requirements/03_non-functional.md`(NFR) | 높음. '보류'·'미검토'도 잠정값대로 만듦. 릴리스 '2차'가 최종 MVP에 새로 넣는 것 |
| 이번에 하지 않는 것 | `requirements/05_out-of-scope.md` | 높음 |
| 아직 안 정한 것과 잠정값 | `requirements/06_open-questions.md`(Q), `requirements/07_doc-conflicts.md`, `dev/10_to-decide.md` | 잠정값대로 만듦 |
| 서버 API: 경로, 보내는 것·받는 것, 누가, 공통 약속(C-1~C-9) | `dev/09_api-needs.md` | 중간. '확정 경로' 칸이 채워지면 그 경로. 서버의 `api/openapi.json`이 최종 원본 |
| 테이블, 키·색인, RAG 자료, KPI가 쓰는 칸 | `dev/07_db.md` | 중간. 코드가 생기면 SQLAlchemy 모델이 원본 |
| 엔터티, 필드, 상태 값 | `dev/06_data-contract.md` | 높음. 확정 이름·확정 값 칸만 씀 |
| 예시 데이터(실시간 교정, 장 검토, 예시 원고) | `dev/json/data-contract_B41~B43.json` | 높음. 그대로 씀(`F90`은 표 칸을 잘못 꺼낸 것이라 무시) |
| 남길 이벤트와 공통 칸 | `dev/08_events.md` | 높음 |
| 화면 주소, 들어오는 조건, 토큰 규칙 | `dev/02_routes.md` | 중간 |
| 화면에 무엇이 있나 | `ux/04_2-ia.md`, `ux/05_3-navigation.md` | 중간 |
| 버튼·안내 문구 | `ux/08_6-labeling.md` | 중간 |
| 상태별 모양, 상태가 바뀌는 조건 | `ux/12_9-state-object.md`, `ux/13_10-state-component.md`, `ux/14_11-state-transition.md` | 중간 |
| 화면이 어떻게 보이나(색·글자·간격·배치) | `docs/design/DESIGN.md`, `web/src/styles/tokens.css`, 견본 `docs/design/specimen.html` | 높음. UX 설계서와 다르면 UX를 따름 |
| 오름님 프로토타입에서 가져온 것과 뺀 것 | `ux/16_prototype-review.md`, `DESIGN.md` 6·7장 | 높음 |
| 끝났는지 눌러 볼 순서 | `dev/12_qa-final-front.md`(QA-F), `docs/PLAN.md` '서버 점검'(S) | F마다 확인할 때만 |
| 1차를 만들며 문서와 다르게 한 것, 잠정값 | `docs/HANDOFF.md` | 높음. 시트에 반영될 때까지 1차 코드가 기준 |
| 데모 13단계 순서 | `dev/03_demo-flow.md` | 높음 |

## 읽지 않아도 되는 곳

- `dev/04_boundary.md`: 11.16 회의 기록이에요. '추천안' 칸에 옛 값이 남아 있어요. 맨 아래 '충돌 방지 규칙'만 참고해요.
- `dev/05_spec-p0.md`, `dev/11_qa-checklist.md`: 1차 기준이에요.
- `ux/15_figjam.md`, `ux/06_4-search.md`(검색 없음), `ux/02_scenarios.md`, `ux/09_goals-tasks.md`: 설계 배경이에요.
- 각 문서의 `01_overview.md`, `requirements/04_traceability.md`.
- `docs/archive/`: 1차의 PLAN·DECISIONS.

## 고칠 때

- `docs/sheets/` 아래 파일은 고치지 않아요. 시트를 고친 뒤 `python scripts/sheets_to_md.py`로 다시 만들어요(`docs/source/README.md`).
- `docs/DECISIONS.md`는 시트끼리 어긋난 곳과 새로 정한 것을 모은 교정표예요. 시트가 고쳐지면 그 줄을 지워요(사람이).
