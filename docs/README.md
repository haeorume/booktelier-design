# 기준 문서 안내

`docs/sheets/`는 구글 시트를 그대로 옮긴 것이라 양이 많고, 회의 때 값이 남은 곳도 있어요. 질문에 맞는 파일만 열어요.
경로는 모두 `docs/sheets/` 아래예요. 탭 전체 목록은 `docs/sheets/INDEX.md`.

## 질문별로 볼 곳

| 질문 | 파일 | 믿을 만한 정도 |
| --- | --- | --- |
| 이 기능이 무엇을 해야 하나, 언제 끝났다고 보나 | `requirements/02_functional.md`(FR), `requirements/03_non-functional.md`(NFR) | 높음. '수용' 줄이 확정, '보류'·'미검토'도 1차에는 그대로 만듦 |
| 1차에 하지 않는 것 | `requirements/05_out-of-scope.md` | 높음 |
| 아직 안 정한 것과 잠정값 | `requirements/06_open-questions.md`(Q), `requirements/07_doc-conflicts.md`, `dev/08_to-decide.md` | 잠정값대로 만듦 |
| 엔터티, 필드, 상태 값 | `dev/06_data-contract.md` | 높음. 확정 이름·확정 값 칸만 씀 |
| 예시 데이터(실시간 교정, 장 검토, 예시 원고) | `dev/json/` | 높음. 그대로 복사해 씀 |
| 데모 13단계 순서와 단계마다 남길 이벤트 | `dev/03_demo-flow.md`, `dev/07_events.md` | 높음 |
| 기능마다 화면, 데모 단계, 이벤트 | `dev/05_spec-p0.md` | 중간. 틀만 있고 일부 칸이 비어 있음 |
| 화면 주소와 들어오는 조건 | `dev/02_routes.md` | 중간. 비고의 '미검토'는 DECISIONS 확인 |
| 화면에 무엇이 있나 | `ux/04_2-ia.md`, `ux/05_3-navigation.md` | 중간 |
| 버튼·안내 문구 | `ux/08_6-labeling.md` | 중간 |
| 상태별 모양, 상태가 바뀌는 조건 | `ux/12_9-state-object.md`, `ux/13_10-state-component.md`, `ux/14_11-state-transition.md` | 중간 |
| 제스처, 선택 | `ux/10_7-gesture.md`, `ux/11_8-selection.md` | 중간 |
| 오름님 프로토타입에서 가져온 것과 뺀 것 | `ux/16_prototype-review.md` | 높음 |
| 끝났는지 눌러 볼 순서 | `dev/09_qa-checklist.md`(QA) | W마다 확인할 때만 |
| 화면 배치를 그림으로 | `docs/design/README.md` (FigJam 그림 4장, 화면 흐름도는 줄별 조각) | 참고용. 그림이 다른 곳은 그 README에 적어 둠 |

## 읽지 않아도 되는 곳

- `dev/04_boundary.md`: 11.16 회의 기록이에요. '추천안' 칸에 옛 값(11단계, 옛 종류 이름, FastAPI)이 남아 있어요. 1차 기준은 `docs/DECISIONS.md`예요. 맨 아래 '충돌 방지 규칙'만 참고해요.
- `ux/15_figjam.md`(그림 링크 목록, 메모가 그림보다 옛날), `ux/06_4-search.md`(1차에 검색 없음), `ux/02_scenarios.md`, `ux/09_goals-tasks.md`: 설계 배경이에요.
- 각 문서의 `01_overview.md`, `requirements/04_traceability.md`.

## 고칠 때

- `docs/sheets/` 아래 파일은 고치지 않아요. 시트를 고친 뒤 `python scripts/sheets_to_md.py`로 다시 만들어요(`docs/source/README.md`).
- `docs/DECISIONS.md`는 시트끼리 어긋난 곳을 1차 동안 임시로 정해 둔 교정표예요. 시트가 고쳐지면 그 줄을 지워요(사람이).
