# Booktelier(북틀리에) 저장소 지도

이 파일은 **지도**예요. 내용을 여기 다 쓰지 않고 어디에 있는지만 가리켜요. 지금 일에 필요한 곳만 열어 보세요.
Claude Code와 Codex가 같이 읽어요. 코드는 Claude Code가 쓰고, Codex는 검수만 해요(코드를 고치지 않아요).

## 지금 만드는 것

최종 MVP(11.26 발표): 편집자·작가·디자이너가 **서로 다른 브라우저에서** 같은 책 지면을 함께 고쳐요.
`web/`(Next.js)는 `api/`(FastAPI + PostgreSQL·pgvector)에 저장하고, AI 제안은 서버가 만들어요(데모 제공자 → F6에서 실제 LLM).
지금 할 일은 `docs/PLAN.md`의 F 하나예요. 1차(한 브라우저, localStorage, 예시 데이터)는 태그 `mvp1`과 `docs/archive/`에 있어요.

## 어디를 보면 되나

| 알고 싶은 것 | 볼 곳 |
| --- | --- |
| 지금 할 일과 끝났다는 기준 | `docs/PLAN.md` (지금 F 부분만), `node scripts/progress.mjs` |
| 문서끼리 어긋날 때 무엇을 따르나, 새로 정한 것(D-xx) | `docs/DECISIONS.md` |
| 기준 문서 중 어디가 무엇에 답하나, 읽지 않아도 되는 곳 | `docs/README.md` |
| 기능이 해야 하는 일과 수용 기준(FR·NFR) | `requirements/02_functional.md`, `requirements/03_non-functional.md` |
| 화면이 서버에 바라는 API(A-xx)와 공통 약속(C-x) | `dev/09_api-needs.md` |
| 엔터티·필드·상태 값·예시 JSON | `dev/06_data-contract.md`, `dev/json/` |
| 테이블, 키·색인, RAG 자료, KPI 칸 | `dev/07_db.md` |
| 남길 이벤트와 공통 칸 | `dev/08_events.md` |
| 화면 주소와 누가 들어오나, 토큰 규칙 | `dev/02_routes.md` |
| 화면 구성·문구·상태별 모양 | UX `ux/04_2-ia.md`, `ux/08_6-labeling.md`, `ux/13_10-state-component.md` |
| 화면이 어떻게 보이나(색·글자·배치) | `docs/design/DESIGN.md`, 값은 `web/src/styles/tokens.css` |
| 다 됐는지 확인(QA-F, S) | `dev/12_qa-final-front.md`, `docs/PLAN.md` '서버 점검' |
| 1차를 만들며 문서와 다르게 한 것 | `docs/HANDOFF.md` |
| 배포·환경 변수·DB 브랜치 | `docs/DEPLOY.md` |

`requirements/`, `dev/`, `ux/` 경로는 `docs/sheets/` 아래예요. 탭 목록은 `docs/sheets/INDEX.md`.

## 코드 지도

| 폴더 | 하는 일 |
| --- | --- |
| `api/` | 서버. 자세한 지도는 `api/AGENTS.md` |
| `api/openapi.json` | 서버 계약(생성 파일). 웹 타입의 원본 |
| `web/src/app/` | 화면. 주소는 routes 탭과 같아요 |
| `web/src/data/` | 저장 어댑터. 화면은 여기만 거쳐 읽고 써요. 서버를 부르는 코드(fetch 등)도 여기에만 |
| `web/src/types/api.ts` | 계약에서 만든 타입(생성 파일, 손으로 고치지 않음) |
| `web/src/domain/` | 상태 전이, 권한 `can(role, action)`, 위치(anchor) 계산. 화면과 무관한 순수 함수 |
| `web/src/ai/` | 1차의 데모 제공자(테스트용). 최종 MVP의 AI는 서버(`api/app/ai/`) |
| `web/src/events/` | 행동 기록 `track()` |
| `web/src/styles/tokens.css` | 디자인 토큰. 컴포넌트 CSS는 이 변수만 써요 |
| `web/src/fixtures/` | 예시 데이터(data-contract에서 그대로 복사, 고치지 않음) |
| `web/e2e/` | 핵심 흐름 e2e, 두 브라우저 e2e |
| `web/AGENTS.md` | Next.js가 만드는 안내. Next.js 16 API는 `web/node_modules/next/dist/docs/`를 먼저 봐요 |

## 명령

```bash
node scripts/check-all.mjs           # 전부: 불변 규칙 + web(lint·타입·단위) + api(ruff·mypy·pytest) + 계약
node scripts/check-all.mjs --web     # 웹만
node scripts/check-all.mjs --api     # 서버만
node scripts/progress.mjs            # 지금 F에서 서버에 아직 없는 API, 확인할 QA·서버 점검 (--all이면 전체)
cd web && npm run test:e2e           # Playwright (개발 서버를 스스로 띄움)
cd api && uv run uvicorn app.main:app --reload   # 서버 (http://localhost:8000/docs)
cd api && uv run python scripts/dump_openapi.py && cd ../web && npm run gen:api   # 계약 다시 만들기
python scripts/sheets_to_md.py       # 시트(.xlsx) → docs/sheets (Windows는 py)
```

## 기계가 지키는 것

글로 부탁하지 않고 기계가 막아요. 걸리면 메시지에 고치는 법이 나오니 그대로 고쳐요.
- `scripts/check-invariants.mjs`: 불변 규칙 R1~R15. 목록과 이유는 그 파일 맨 위(R11은 F7까지 경고).
- `scripts/check-contract.mjs`: R13. `openapi.json`과 `web/src/types/api.ts`가 서버 코드와 맞는지.
- 훅(`.claude/`): 파일을 고치면 ESLint(web)·ruff(api), 턴을 끝내려 하면 불변 규칙·타입·단위 테스트·pytest·계약.
- 권한: 커밋·push·태그·`alembic upgrade`·배포 명령은 사람이 승인. `.env` 읽기와 하네스 파일·생성 파일 고치기는 막혀 있어요.
- CI(`.github/workflows/check.yml`): PR마다 같은 검사 + DB 테스트.

## 작업 방식

`docs/PLAN.md`의 F를 하나씩: `/next`(계획) → 구현 → 검사 → `/report`(보고하고 멈춤) → Codex 검수 → `/review-fix` → 사람이 확인하면 커밋 → PR(`.github/pull_request_template.md`). 계약을 바꾸는 일은 먼저(D-25).

## Code Review Rules

기계 검사(lint, 타입, 테스트, 불변 규칙, 계약)가 잡는 것은 반복하지 말고, 사람이 읽어야 보이는 것을 봐요. 지적마다 심각도(막음 / 고침 권장 / 참고), 파일과 줄, 근거(FR-xx, NFR-xx, QA-Fxx, S-xx, D-xx, A-xx)를 한국어로 적어요.
- 요구사항 수용 기준, `docs/DECISIONS.md`, data-contract·api-needs의 이름·상태 값·경로와 다르게 동작하는 것.
- **서버 권한**: 역할·책 범위 검사가 빠진 엔드포인트, 다른 사람의 보내기 전 AI 제안이 응답에 섞이는 것(D-29), 응답에 `token_hash`나 토큰이 다시 나가는 것(D-27).
- **원고 안전**: `base_version` 확인 없이 원고를 바꾸는 것(D-30), 원고 글자가 이벤트·로그에 들어가는 것.
- 화면: 역할에 없는 버튼이 보이거나(D-15), 편집자·디자이너가 원고를 직접 고칠 수 있는 것(D-14), 남겨야 할 이벤트가 빠지거나 props에 `panel_layout`이 없는 것(D-10).
- 마이그레이션: 자동 생성된 것을 그대로 두어 데이터를 지우는 변경, 되돌리기(downgrade)가 빠진 것.
- 지금 F 범위를 넘는 변경, 테스트가 동작이 아니라 구현 세부를 붙잡고 있는 것.
- 색만으로 구분하거나 글자 대비가 낮은 것은 '참고'(DESIGN.md 1장).
