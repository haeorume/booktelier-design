# Booktelier(북틀리에) 저장소 지도

이 파일은 **지도**예요. 내용을 여기 다 쓰지 않고 어디에 있는지만 가리켜요. 지금 일에 필요한 곳만 열어 보세요.
Claude Code와 Codex가 같이 읽어요. 코드는 Claude Code가 쓰고, Codex는 검수만 해요(코드를 고치지 않아요).

## 지금 만드는 것

1차 MVP: `web/`(Next.js) 화면이 예시 데이터로 돌면서, 한 브라우저에서 역할(편집자·작가·디자이너)을 바꿔 데모 플로우 13단계를 끝까지 보여 줘요.
서버(`api/`), DB, 실제 AI 호출, 로그인은 아직 없어요.

## 어디를 보면 되나

| 알고 싶은 것 | 볼 곳 |
| --- | --- |
| 지금 할 일과 끝났다는 기준 | `docs/PLAN.md` (지금 W 부분만) |
| 문서끼리 어긋날 때 무엇을 따르나 | `docs/DECISIONS.md` |
| 기준 문서 중 어디가 무엇에 답하나, 읽지 않아도 되는 곳 | `docs/README.md` |
| 기능이 해야 하는 일과 수용 기준(FR-xx) | 요구사항 정의서 '기능 요구사항' `requirements/02_functional.md` |
| 데이터 이름·필드·상태 값, 예시 JSON | 개발 문서 'data-contract' `dev/06_data-contract.md`, `dev/json/` |
| 데모 13단계 순서, 남길 이벤트 | 개발 문서 'demo-flow', 'events' `dev/03_demo-flow.md`, `dev/07_events.md` |
| 화면 주소와 누가 들어오나 | 개발 문서 'routes' `dev/02_routes.md` |
| 화면 구성, 문구, 상태별 모양 | UX 설계서 `ux/04_2-ia.md`, `ux/08_6-labeling.md`, `ux/13_10-state-component.md` |
| 화면 배치 그림(어디에 무엇이 놓이나) | `docs/design/README.md` (참고용. 글과 다르면 글을 따름) |
| 다 됐는지 확인(QA-xx) | 개발 문서 '1차 점검' `dev/09_qa-checklist.md` |

위 표의 `requirements/`, `dev/`, `ux/` 경로는 `docs/sheets/` 아래예요. 탭 목록은 `docs/sheets/INDEX.md`.

## 코드 지도 (W0·W1에서 생겨요)

| 폴더 | 하는 일 |
| --- | --- |
| `web/src/app/` | 화면. 주소는 routes 탭과 같아요 |
| `web/src/data/` | 저장 어댑터. 화면은 여기만 거쳐 읽고 써요 |
| `web/src/domain/` | 상태 전이, 권한 `can(role, action)`, 위치(anchor) 계산. 화면과 무관한 순수 함수 |
| `web/src/ai/` | AI 제공자. 1차는 예시 JSON을 돌려주는 데모 제공자 |
| `web/src/events/` | 행동 기록 `track()` |
| `web/src/fixtures/` | 예시 데이터(data-contract에서 그대로 복사, 고치지 않음) |
| `web/e2e/` | 데모 플로우 e2e |
| `web/AGENTS.md` | Next.js가 만드는 안내. Next.js 16 API는 `web/node_modules/next/dist/docs/`를 먼저 봐요 |

## 명령

```bash
cd web && npm run check          # lint + 타입 + 단위 테스트 + 불변 규칙
cd web && npm run test:e2e       # Playwright
node scripts/check-invariants.mjs   # 불변 규칙만 (저장소 맨 위에서)
python scripts/sheets_to_md.py      # 시트(.xlsx) → docs/sheets (Windows는 py)
```

## 기계가 지키는 것

글로 부탁하지 않고 기계가 막아요. 걸리면 메시지에 고치는 법이 나오니 그대로 고쳐요.
- `scripts/check-invariants.mjs`: 불변 규칙 R1~R10(화면의 저장소 직접 접근, 옛 종류 이름, '북엔드' 표기, 실제 LLM 호출, api/ 구현, 테스트 건너뛰기, 검사 끄기, 비밀값, 제공 데이터). 목록은 그 파일 맨 위.
- 훅(`.claude/`): 파일을 고치면 ESLint, 턴을 끝내려 하면 불변 규칙·타입 검사·단위 테스트.
- 권한: 커밋과 push는 사람이 승인. `.env` 읽기와 하네스 파일(`.claude/`, 이 파일, `CLAUDE.md`, `docs/DECISIONS.md`, `docs/sheets/`, 불변 규칙 스크립트) 고치기는 막혀 있어요.

## 작업 방식

`docs/PLAN.md`의 W를 하나씩: 계획 → 구현 → 검사 → 보고하고 멈춤 → Codex 검수 → 고침 → 사람이 확인하면 커밋.

## Code Review Rules

기계 검사(lint, 타입, 단위 테스트, 불변 규칙)가 잡는 것은 반복하지 말고, 사람이 읽어야 보이는 것을 봐요. 지적마다 심각도(막음 / 고침 권장 / 참고), 파일과 줄, 근거(FR-xx, QA-xx, D-xx)를 한국어로 적어요.
- 요구사항 수용 기준, `docs/DECISIONS.md`, data-contract의 확정 이름·상태 값과 다르게 동작하는 것.
- 역할 권한: 역할에 없는 버튼이 보이거나, 보내기 전 AI 제안이 다른 역할에 보이거나, 편집자·디자이너가 원고를 직접 고칠 수 있는 것(D-14, D-15, FR-23).
- 데모 단계나 AI 제안 처리에서 남겨야 할 이벤트가 빠지거나, props에 `panel_layout`이 없는 것(D-10).
- 지금 W 범위를 넘는 변경, 테스트가 동작이 아니라 구현 세부를 붙잡고 있는 것.
- 밑줄을 색으로만 구분하거나 글자 대비가 낮은 것은 '참고'(FR-25).
