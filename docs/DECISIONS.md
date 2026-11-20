# 최종 MVP 교정표 (v2, 11.20)

시트 문서(v0.4, 11.20)끼리 어긋나거나 시트에 아직 없는 것을 최종 MVP 동안 정해 둔 표예요. 어긋나면 **이 표가 이겨요**. 시트가 고쳐지면 그 줄을 지워요(사람이).
'기계 검사' 칸에 R 번호가 있는 줄은 `scripts/check-invariants.mjs`(R13은 `scripts/check-contract.mjs`)가 막아요.
1차 교정표(D-01~D-19 원본)는 `docs/archive/DECISIONS-mvp1.md`에 있어요.

어긋남이 표에 없으면: 요구사항 정의서 → 개발 문서(data-contract·db·api-needs → routes·events → 정할 것) → UX 설계서 → `docs/design/DESIGN.md` → boundary '추천안' 순으로 따라요. 그래도 안 정해지면 만들지 말고 물어요.

시트 머리말의 옛 방침은 이렇게 읽어요.
- '정할 것' 탭의 "저장소로 내보내지 않아요" → 최종 MVP도 이 탭의 **잠정값을 기준으로** 만들어요. 결정 칸이 비어 있어도 잠정값대로 해요.
- '1차 점검' 탭은 1차 기준이에요. 최종 MVP는 **'최종 점검(프론트)' QA-F01~30**과 PLAN의 서버 점검으로 확인해요.
- `docs/HANDOFF.md`(1차 인계 메모)의 '문서와 다르게 만든 것'은 시트에 반영될 때까지 **1차 코드가 기준**이에요. 시트에 반영되면 그 줄을 HANDOFF에서 지워요.

## 1차에서 이어지는 결정

| 번호 | 결정 | 근거 | 기계 검사 |
| --- | --- | --- | --- |
| D-01 | 제품 이름은 **Booktelier(북틀리에)**. 화면·서버 코드에 '북엔드'를 쓰지 않아요. 북엔드는 협력 기업 이름이에요. | 혜린 결정 11.18, QA-F02 | R4 |
| D-02 | 역할은 **편집자(editor)·작가(author)·디자이너(designer)** 셋. 보기 전용(viewer)은 없어요. | FR-42, Q-09 |  |
| D-03 | 데모 플로우와 퍼널은 **13단계**. | FR-39, FR-40, demo-flow |  |
| D-04 | AI 제안 종류(kind)는 **spelling · spacing · notation · polish** 넷. 제안 하나에 종류 하나. boundary A7과 옛 제작 안내의 이름(correction·copyedit·layout)은 쓰지 않아요. 다른 장과 어긋남(consistency, '정할 것' 22번)은 정모님이 확정하면 사람이 R3에 더해요. | FR-24, data-contract | R3 |
| D-05 | 상태 값과 이름은 data-contract '2. 상태 값'의 **확정 값(정모)**만 써요. 서버 Pydantic 모델이 생기면 그것이 원본이에요(D-25). | data-contract, db 1번 |  |
| D-10 | 오른쪽 패널은 **하나씩(기본) / 나란히** 두 배치. 모든 이벤트 props에 `panel_layout`(single · split). | UX N-15, 정할 것 18 |  |
| D-11 | 템플릿은 **3종(소설·에세이·실용서)**. 값은 오름님 값이 오기 전까지 `docs/design/DESIGN.md` 4장 잠정값. | 정할 것 7, Q-24 |  |
| D-12 | 겹친 제안은 **밑줄 하나, 카드는 모두**. 밑줄은 종류마다 색과 선 모양을 함께 달리해요. | FR-25, Q-16 |  |
| D-14 | 원고를 직접 고치는 것과 AI 제안 '적용'은 **작가만**. 편집자는 AI 제안을 **보내기**(의견·수정 제안). 수정 제안을 직접 남기는 것도 편집자만. 의견은 세 역할 모두. | Q-02 잠정, FR-27·29·32·33 |  |
| D-15 | 권한이 없는 버튼은 **숨겨요**. 작가가 조판 설정을 열면 값만 글자로 보여요. 서버도 다시 막아요(D-22). | NFR-01 ②③, 정할 것 16 |  |
| D-17 | 장 상태 화면 이름은 **수정 중 · 검토 요청 · 검토 완료**. | FR-12, Q-17(결정) |  |
| D-18 | 실시간 교정은 작가가 입력을 멈추고 **1.5초** 뒤 **바뀐 문단만**. 장 검토는 편집자가 눌러야만 돌고, 결과는 실행한 사람에게만 보여요. | FR-20, FR-21 |  |
| D-19 | 1차 예시 JSON 세 개(`web/src/fixtures/`)는 **글자 하나 바꾸지 않고** 써요. 서버 데모 제공자(F5)도 같은 JSON을 써요. 위치(anchor)는 문단 id + 글자 위치(0부터, end 미포함). | data-contract, NFR-05 | R2 |

1차의 D-06(서버·LLM 없음), D-07(localStorage), D-08(브라우저 시각), D-09(어댑터가 거름)는 아래 D-21·D-27·D-28·D-29로 바뀌었어요. D-13(Edit·Layout 전환 없음), D-16(이름 다시 묻기)은 시트 v0.4에 반영돼 지웠어요.

## 최종 MVP에서 새로 정한 것

| 번호 | 결정 | 근거 | 기계 검사 |
| --- | --- | --- | --- |
| D-20 | **1차 보존**: `c031565`에 태그 `mvp1`. 1차 배포 주소는 그대로 둬요. 1차의 localStorage 저장소 구현은 **단위 테스트용으로 남겨요**. 서버 없이 시연하는 데모 모드로도 쓸지는 아직 열려 있어요(하네스 v3 7장). | 하네스 v3 2장 |  |
| D-21 | **AI는 서버에서만.** LLM SDK·LangChain·LLM 주소는 `api/app/ai/` 안에만 둬요. 웹은 서버 API만 불러요. 제공자는 인터페이스 뒤에 두고 `AI_PROVIDER=demo`(예시 JSON) / `llm`(실제, F6)로 바꿔요. **e2e와 CI는 늘 demo**. | FR-20 비고, Q-18, HANDOFF 7-4 | R5 |
| D-22 | **서버 층.** 라우터(`app/routers`) → 신원·권한(`app/auth`) → DB 함수(`app/db`) / AI(`app/ai`). SQLAlchemy·psycopg는 `app/db/` 안에서만 쓰고, 라우터는 `DbSession`만 받아 넘겨요. **권한 검사는 서버가 다시 해요**(토큰 없음 401, 권한 없음 403). | NFR-01 ③, 리뷰 B-2, api-needs C-2 | R6 |
| D-23 | **인프라.** DB는 Neon(싱가포르, Postgres 17) + pgvector. 프로젝트 둘: `booktelier-dev`에 사람마다 `dev-이름`(개발)·`test-이름`(자동 테스트) 브랜치, 배포는 다른 프로젝트 `booktelier-prod`의 `main`(무료 한도가 프로젝트마다라 개발이 발표 DB를 멈추지 않게, 11.20 확정). CI는 비밀값 없이 pgvector 컨테이너. 서버는 Railway(싱가포르, 체험으로 시작 → `docs/DEPLOY.md` 기준에 걸리면 Hobby). 웹은 Vercel(Root `web`). | 11.20 정모 결정 |  |
| D-24 | **DB 도구.** SQLAlchemy 2 + Alembic, 드라이버 psycopg 3, **동기 세션**. 주소는 Neon **직접 연결 주소 하나**를 앱과 Alembic이 같이 써요(pooled 안 씀, 11.20 확정). `postgresql+psycopg://`로 맞춰요(`app/config.py`가 바꿔 줌). 엔진은 `pool_pre_ping=True`(Neon이 5분 쉬면 꺼짐). DB 모델(`app/db`)과 API 모델(Pydantic)은 따로 둬요. `token_hash` 같은 칸이 API 모델에 섞이지 않게요. | 11.20 정모 결정, db 1번 빈칸 |  |
| D-25 | **계약 먼저.** 데이터 모양의 원본은 FastAPI의 Pydantic 모델. `api/openapi.json` → `npm run gen:api` → `web/src/types/api.ts`. 생성 파일은 손으로 고치지 않아요. 화면은 `web/src/data/`의 HTTP 어댑터로만 서버를 불러요. F마다 정모님이 Pydantic 모델과 가짜 응답 엔드포인트를 먼저 merge하고, 웹은 그 계약으로 만들어요. api-needs '확정 경로' 칸은 이때 채워요. | db 1번, api-needs C-8, NFR-15 ① | R12, R13 |
| D-26 | **RAG.** `rag_chunk`는 우리 테이블로 Alembic이 관리해요(F6에서 임베딩 모델과 차원을 정한 뒤 마이그레이션). pgvector 확장은 첫 마이그레이션에서 직접 켜요. 검색은 `app/db`의 함수를 LangChain `BaseRetriever`로 감싸요. **langchain-postgres(PGVector 등)는 쓰지 않아요.** Alembic 자동 생성은 우리 모델에 없는 테이블을 지우자고 제안하지 않게 막아 뒀어요. 실시간 교정에는 RAG를 쓰지 않아요(정할 것 24 잠정). | 11.20 정모 결정, db 4번 | R15 |
| D-27 | **ID·토큰.** 책·장·의견·수정 제안 id는 화면이 UUID로 만들어 보내고 서버가 형식·중복을 확인해요. 편집자 토큰·참여자 토큰·초대 링크 token은 **서버가 발급**하고 해시만 저장해요. 요청은 `Authorization: Bearer`. 주소에 실린 토큰은 받은 뒤 주소에서 지워요. | NFR-15 ②, api-needs C-1·C-5, routes 규칙 6 |  |
| D-28 | **시각.** 저장 시각은 서버가 정해요(timestamptz). 이벤트의 브라우저 시각 `ts`는 따로 남겨요. | FR-39 ③, db 1번, api-needs C-6 |  |
| D-29 | **보내기 전 AI 제안은 서버가 걸러요.** 다른 사람의 AI 제안은 응답에 오지 않아요(A-19). | FR-23, NFR-01 |  |
| D-30 | **원고 충돌.** 원고를 바꾸는 요청은 `base_version`을 보내고, 다르면 409와 최신 버전을 받아요. AI 제안 적용(A-20)과 수정 제안 수락(A-26)은 **서버가 원고에 반영**해요. | NFR-04·08, api-needs C-4, 혜린 결정 11.20 |  |
| D-31 | **실시간은 몇 초 간격 새로 읽기**(A-31). A-30은 내 위치 알리기만, 접속자 목록은 A-31 응답으로 받아요. 입력 중인 문단은 덮어쓰지 않아요. | Q-25 잠정, FR-18 ④ |  |
| D-32 | **화면 모양은 `docs/design/DESIGN.md`와 `web/src/styles/tokens.css`.** 컴포넌트 CSS는 `var(--bt-…)`만 써요. UX 설계서와 다르면 UX 설계서를 따르고 DESIGN.md를 고쳐요. R11은 **F7까지 경고**, F7에서 사람이 `R11_STRICT`를 켜요. | DESIGN.md 2장, 11.20 정모 결정 | R11 |
| D-33 | **개발용 막대**는 개발 서버(`npm run dev`, e2e)에서만 보이고, 배포 빌드에서는 `NEXT_PUBLIC_DEV_BAR=1`일 때만 보여요. 최종 배포에는 넣지 않아요. | FR-41, QA-F01, 11.20 확정 | R14 |
| D-34 | **미리보기**는 Paged.js(CSS Paged Media)로 작업 지면과 같은 CSS를 써요. 새 API 없이 A-10·A-11만 읽어요. | DESIGN.md 4장, api-needs A-35 |  |
| D-35 | **오류 모양**은 `{ code, message }` 한 가지예요. 서버는 `app/errors.py`의 `AppError`로 오류를 내고, 404·405·422도 같은 모양으로 바꿔 보내요. 화면은 `code`로 안내 문구를 골라요. | api-needs C-3, NFR-06 |  |
| D-36 | **진행 세기**: 엔드포인트 summary는 api-needs 번호로 시작해요(`A-12 원고 저장`, 헬스 체크는 `health …`). `node scripts/progress.mjs`가 이것으로 지금 F의 남은 API를 세요. | 하네스 v3 교차검토 | 계약 테스트 |
| D-37 | **초대 링크 token은 원문도 저장해요**(D-27의 예외). 편집자가 초대 창(A-07)에서 언제든 다시 복사할 수 있게요. 원문은 편집자만 받는 A-07·A-08·A-09 응답에만 싣고, 들어올 때(A-05·A-06) 찾기는 해시로 해요. 참여자·편집자 토큰은 그대로 해시만 저장해요. 링크가 새면 A-09로 바꾸거나 취소해요. | FR-05, FR-08, 11.21 정모 결정(F1 계약) |  |
| D-38 | **내 책 목록(A-03)은 `POST /projects/list`**에 브라우저가 가진 편집자 토큰들을 `editor_tokens`로 보내요. 토큰 하나가 책 하나의 참여자라서 헤더 하나로는 책 여러 권을 묶을 수 없어요. 맞지 않는 토큰은 응답에서 빠지고 401을 내지 않아요. api-needs의 `GET /projects`와 달라요. | FR-02, api-needs A-03, 11.21 정모 결정(F1 계약) |  |

## 아직 시트끼리 어긋나는 곳 (읽지 않아도 됨)

- boundary A6·A7 추천안: 옛 상태 이름(open…)과 옛 종류 이름. D-04·D-05를 따라요.
- `docs/design/`의 FigJam 그림 4장: 1차 기준(옛 종류 이름, 패널 A안만). 배치는 DESIGN.md와 UX 2 IA를 따라요.

## 아직 안 정해진 것을 만났을 때

- 요구사항 정의서 '미결 사항'(Q-xx)과 개발 문서 '정할 것'에 **잠정값이 있으면 그대로** 만들어요.
- 잠정값도 없으면 만들지 말고 멈춰서 물어요. 무엇이 어긋나는지와 고를 수 있는 안 두세 개를 같이 적어요.
