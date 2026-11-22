# Booktelier(북틀리에)

편집자·작가·디자이너가 같은 책 모양 지면에서 함께 책을 만드는 작업 공간이에요.
최종 MVP(11.26)는 `web/`(Next.js)와 `api/`(FastAPI + PostgreSQL·pgvector)로, **서로 다른 브라우저에서** 같은 책을 함께 고쳐요.
지금은 1차 화면 위에 서버를 붙이는 중이에요(`docs/PLAN.md`의 F0~F8). 1차 MVP는 태그 `mvp1`에 남아 있어요.

저장소 안내는 `AGENTS.md`, 작업 계획은 `docs/PLAN.md`, 배포와 환경 변수는 `docs/DEPLOY.md`, 하네스 쓰는 법은 `HARNESS.md`.

> 이 저장소는 **공개**예요. API 키·DB 주소는 `.env`와 배포처 환경 변수에만 두고 커밋하지 않아요(불변 규칙 R9).

## 실행

Node.js 22 이상, [uv](https://docs.astral.sh/uv/)가 필요해요(Python 3.12는 uv가 깔아 줘요).

```bash
# 서버 (터미널 1)
cd api
uv sync
cp .env.example .env        # Windows: Copy-Item .env.example .env  → DATABASE_URL 등 채우기
uv run alembic upgrade head
uv run uvicorn app.main:app --reload     # http://localhost:8000/docs

# 화면 (터미널 2)
cd web
npm install
npm run dev                              # http://localhost:3000
```

웹이 서버를 부르는 주소는 `web/.env.local`의 `NEXT_PUBLIC_API_URL=http://localhost:8000`(F2부터 씀). 환경 변수 전체는 `docs/DEPLOY.md` 4장.

## 검사와 테스트

```bash
node scripts/check-all.mjs        # 불변 규칙 + web(lint·타입·단위) + api(ruff·mypy·pytest) + 계약
npx playwright install chromium   # e2e를 처음 돌릴 때 한 번 (web/ 에서)
cd web && npm run test:e2e        # Playwright. 개발 서버를 스스로 띄워요
```

- 핵심 흐름 1~13단계를 한 번에 누르는 테스트는 `web/e2e/demo-flow.spec.ts`예요.
- 실패한 e2e 결과(trace)는 시스템 임시 폴더의 `booktelier-playwright`에 남아요.
- PR마다 GitHub Actions(`.github/workflows/check.yml`)가 같은 검사와 DB 테스트를 돌려요.

## 데모 13단계 보는 법 (1차 화면 기준)

빈 브라우저(시크릿 창이 편해요)에서 http://localhost:3000 을 열어요. 화면 위 노란 **개발용 막대**로 역할을 바꿔요. 역할을 바꿔도 주소는 그대로예요.

| 단계 | 역할 | 할 일 |
| --- | --- | --- |
| 1·2 | 편집자 | 책 제목을 넣고 템플릿을 골라 '만들기' |
| 3 | 편집자 | 상단 바 '공유'에서 작가 링크와 디자이너 링크를 각각 '링크 복사' |
| 4·5 | 작가 | 복사한 작가 링크를 같은 브라우저 주소창에 붙여 열고, 이름을 넣어 '들어가기' |
| 6 | 작가 | 지면 둘째 문단 끝에 글을 더하고 잠시 멈춤 → 밑줄과 카드가 뜨면 '적용' |
| 7 | 작가 | 장 머리의 '검토 요청' |
| 8 | 편집자 | 막대에서 '편집자' → 경로의 '편집자 홈' → 책 카드 → '장 검토' |
| 9 | 편집자 | '몇일' 카드에서 '보내기' → '수정 제안'으로 문구를 다듬어 보내기 |
| 10 | 작가 | 막대에서 '작가' → '함께 봄' 탭의 수정 제안 '수락' |
| 11 | 편집자 | 막대에서 '편집자' → 상단 바 '검토본'에 이름을 넣어 '검토본 저장' |
| 12 | 디자이너 | 복사한 디자이너 링크를 열고 이름을 넣어 '들어가기' |
| 13 | 디자이너 | 상단 바 '조판 설정'에서 행간이나 여백을 바꿈 |

끝난 뒤 http://localhost:3000/dev/events 를 열면 13단계마다 도달 수와 이탈 수가 표로 보여요. 사용자 화면에는 이 주소로 가는 링크가 없어요.

개발용 막대의 '패널: 하나씩 / 나란히'는 검토 패널과 조판 설정을 번갈아 열지, 함께 열지를 바꿔요(D-10).

## 1차(mvp1)의 한계

- 저장은 그 브라우저 안(localStorage)에만 됐어요. 최종 MVP에서 서버 저장으로 바꿔요(F2·F3).
- AI 제안은 예시 데이터예요. 최종 MVP는 서버의 데모 제공자(F5) → 실제 LLM(F6).
- 새 책은 늘 예시 원고 1장으로 시작해요. 최종 MVP는 빈 첫 장(QA-F03).
- 실시간 공동 작업은 없어요(F4).
- 처음부터 다시 보려면 브라우저 저장소를 지우거나 시크릿 창을 새로 열어요.
