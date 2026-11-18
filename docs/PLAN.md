# 1차 MVP 작업 계획 (W0 ~ W6)

한 번에 **W 하나**만 해요. W마다 CLAUDE.md의 '작업 루프'를 한 바퀴 돌고, 사람이 확인해야 다음 W로 넘어가요.
데모 단계 번호는 개발 문서 demo-flow, QA 번호는 개발 문서 '1차 점검' 탭이에요.

## 모든 W에 공통인 완료 기준

- `cd web && npm run check`(lint + 타입 검사 + 단위 테스트)가 통과해요.
- 그 W까지 만든 데모 단계를 이어서 누르는 e2e가 `web/e2e/demo-flow.spec.ts`에 있고 `npm run test:e2e`가 통과해요. 아직 만들지 않은 단계는 테스트에 넣지 않아요.
- 그 W의 '확인할 QA'를 스스로 눌러 보고(또는 테스트로) 결과를 보고에 적어요.
- 새로 남기는 이벤트가 있으면 events 문서의 이름과 공통 칸을 따르고, 보고에 적어요.

---

## W0. 저장소와 도구

**만들 것** (11.18 17시에 1~3을 직접 돌려 확인한 명령이에요. 그대로 써요)
1. `web/`에 Next.js 앱: TypeScript, ESLint, App Router, `src/` 폴더, Tailwind 없음(템플릿이 CSS 변수 묶음이라 CSS 변수 + CSS Modules로 해요), import 별칭 `@/*`, npm. 저장소 맨 위에서
   `npx --yes create-next-app@latest web --ts --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-npm --yes --disable-git` (2분 안팎)
   - Next.js가 `web/AGENTS.md`를 만들어요. Next.js 16은 학습 데이터와 다른 곳이 있으니 `node_modules/next/dist/docs/`를 먼저 보라는 안내예요. 지우지 말고 같이 커밋해요(`next dev`가 다시 만들어요).
2. 단위 테스트 Vitest, e2e Playwright(chromium만, 창 1440×900, `webServer`로 개발 서버를 띄움). `web/`에서
   `npm i -D @types/node@^22 vitest @playwright/test` 그다음 `npx playwright install chromium`
   - `@types/node@^22`를 같이 올려야 해요. create-next-app이 `^20`을 넣는데 Vitest 5는 22 이상을 요구해서, 빼면 설치가 ERESOLVE로 실패해요.
3. `web/package.json` scripts를 이 이름으로 맞춰요. 훅이 이 이름을 불러요.
   - `dev`, `build`, `start`
   - `lint`: `eslint . --max-warnings 0`
   - `typecheck`: `tsc --noEmit`
   - `test`: `vitest run --passWithNoTests`
   - `test:e2e`: `playwright test`
   - `check`: `npm run lint && npm run typecheck && npm run test && node ../scripts/check-invariants.mjs`
4. `web/e2e/smoke.spec.ts`: 첫 화면(/)이 열리고 'Booktelier'가 보이며 로그인·회원가입 화면이 나오지 않아요.
5. `docs/sheets/INDEX.md`가 있는지 확인해요. 없으면 멈추고 사람에게 `python scripts/sheets_to_md.py`를 돌려 달라고 해요.
6. 예시 데이터: `docs/sheets/dev/json/` 아래 data-contract에서 꺼낸 JSON 세 개를 `web/src/fixtures/`에 복사해요. 이름은 `live_check.json`, `chapter_review.json`, `manuscript.json`. **내용은 바꾸지 않아요**(D-19).
7. 검사 장치가 도는지 확인해요: 저장소 맨 위에서 `node scripts/check-invariants.mjs`가 통과하고, `.claude/hooks/stop-check.mjs`에 빈 입력 `{}`을 넣어 실행하면 종료 코드 0이 나와요.

**확인할 QA**: QA-01, QA-03, QA-05

---

## W1. 데이터 층 (화면 없이)

**만들 것**
- `web/src/types/`: data-contract 엔터티와 확정 상태 값의 타입. kind는 D-04의 넷만.
- `web/src/data/`: 저장소 인터페이스 + localStorage 구현. 화면은 이것만 써요(나중에 HTTP 구현으로 바꿀 자리).
- `web/src/domain/`: 화면과 상관없는 순수 함수
  - 상태 전이: AI 제안(pending → applied · dismissed · sent · stale, applied → pending은 실행 취소 1회, sent → merged), 장(editing → review_requested → reviewed), 수정 제안(pending → accepted · rejected)
  - 권한: `can(role, action)` 한 곳에서. D-14, D-15를 따라요
  - 위치: anchor로 글자를 찾고, 어긋나면 original로 다시 찾기(NFR-05)
- `web/src/ai/`: AI 제공자 인터페이스 + 데모 제공자(fixtures를 돌려주고 짧게 기다리는 흉내). 실제 LLM 호출 없음(D-06).
- `web/src/events/`: `track(name, props)`. 공통 칸(event_id, name, ts(ms), anon_id, session_id(30분), participant_id, project_id, chapter_id, role, path, props)을 채우고 props에 `panel_layout`을 늘 넣어요(D-10).
- 단위 테스트: 상태 전이, 권한표, **fixtures의 제안 7개 위치가 예시 원고 글자와 맞는지**, 이벤트 공통 칸.

**확인할 QA**: QA-46, QA-47, QA-48

---

## W2. 책 만들기 · 공유 · 링크로 들어오기 (데모 1~5)

**만들 것**
- ST-01 새 책 만들기(제목, 템플릿 3종), HM-01 편집자 홈(책 카드, 확인할 일), WS-02 공유 창(작가 링크·디자이너 링크 복사), JN-01 링크로 들어오기(책 제목, 역할, 이름), 작업 공간의 빈 틀(상단 바, 역할 배지)
- DV-02 개발용 막대: 역할 전환(편집자·작가·디자이너), 패널 배치 전환(하나씩·나란히), 설정으로 끌 수 있음. 주소는 바꾸지 않아요(정할 것 4)
- 이벤트: project_created, template_selected, role_link_copied, role_link_opened, participant_joined

**확인할 QA**: QA-05~QA-10, QA-24

---

## W3. 지면과 실시간 교정 (데모 6)

**만들 것**
- WS-01 작업 공간: 장 목록과 장 상태 배지, 책 모양 지면(편집기는 Tiptap, 문단마다 `attrs.id`, 템플릿 CSS 변수 적용), 오른쪽 검토 패널(탭)
- 작가가 문단을 고치고 1.5초 멈추면 데모 제공자의 실시간 교정 결과로 밑줄과 카드(원문, 수정안 1개, 대안 최대 2개, 종류, 이유)를 보여 줘요. 보내기 전 AI 제안은 본인만 봐요
- 카드 동작: 적용(작가만, 실행 취소 1회), 무시, 이 표현 유지(Should). 겹친 밑줄은 D-12
- 이벤트: first_edit, AI 제안 노출·적용·무시·유지(이름은 events 탭 '확정 이름')

**확인할 QA**: QA-11, QA-19~QA-23, QA-27~QA-36, QA-38

---

## W4. 검토 요청 · 장 검토 · 보내기 · 수락 (데모 7~10)

**만들 것**
- 검토 요청(작가)과 검토 완료(편집자), 편집자 홈 책 카드의 확인할 일 늘고 줄기
- 장 검토(편집자): 진행 표시 동안 버튼 막힘 → 결과 카드 목록. 종류별 개수 한 줄은 Could
- 보내기 창: 의견 / 수정 제안 고르기, 수정안이나 대안 고르기, 문구 다듬기. 받은 카드에 'AI 제안에서 보냄'
- 수정 제안: 지면에 지운 글자와 더한 글자, 수락 · 거절. 의견은 세 역할 모두. 답글과 반영 구분은 Should
- 이벤트: review_requested, chapter_review_run, ai_suggestion_sent, suggested_edit_accepted, AI 제안 반영

**확인할 QA**: QA-12~QA-15, QA-39~QA-42

---

## W5. 검토본 · 디자이너 · 조판 설정 · 패널 두 배치 (데모 11~13)

**만들 것**
- 검토본 저장(편집자)과 목록 보기(모두, 읽기 전용)
- 디자이너 화면: 원고 수정·수정 제안·AI 탭 없음, 의견은 가능, 역할 배지 '디자이너'
- 조판 설정 패널(편집자·디자이너): 템플릿, 판형, 여백, 행간. 템플릿을 바꾸면 확인 뒤 그 템플릿 기본값으로. 마지막에 바꾼 사람과 시각이 보임. 작가는 값만 글자로(D-15)
- 오른쪽 패널 A안·B안(D-10)
- 이벤트: snapshot_saved, participant_joined(designer), layout_changed(손을 뗄 때 한 번)

**확인할 QA**: QA-16~QA-18, QA-25, QA-43, QA-44. QA-26(1440px에서 나란히 열었을 때 지면이 읽을 만한지)은 사람이 판단하도록 화면을 캡처해 보고에 붙여요

---

## W6. 마무리

**만들 것**
- `web/e2e/demo-flow.spec.ts`가 1~13단계를 한 번에 통과(QA-04)
- /dev/events 퍼널 화면: 13단계 도달 수와 이탈 수(QA-45)
- 1280px·1440px에서 겹치거나 잘리지 않음(QA-49), 콘솔 빨간 오류 없음(QA-51), 키보드로 1~5단계(QA-50, Should)
- `README.md`에 실행 방법
- 배포(Vercel)는 사람이 해요. Claude는 `npm run build` 통과와 필요한 환경 변수가 없다는 것까지 확인해요

---

## 시간이 밀리면 빼는 순서

1. Could: FR-04 책 거르기, FR-22 장 검토 요약 한 줄, FR-31 표기 원칙 목록
2. Should 중 데모 13단계에 없는 것: FR-26 정렬·거르기, FR-36 답글과 반영 구분, FR-19 접속자 표시, QA-50 키보드
3. 그래도 밀리면 사람과 상의해요. 데모 13단계에 들어가는 기능은 빼지 않아요.
