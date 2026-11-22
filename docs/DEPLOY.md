# 배포와 환경 (최종 MVP)

결정: `docs/DECISIONS.md` D-23. 저장소가 **공개**라서 키·DB 주소는 저장소에 절대 올리지 않아요(R9가 막아요). 저장소에는 `api/.env.example`만 있어요.

```
브라우저 ──▶ Vercel (web/, Next.js)
               │ NEXT_PUBLIC_API_URL
               ▼
           Railway (api/, FastAPI, 싱가포르) ──▶ LLM API (F6)
               │ DATABASE_URL
               ▼
           Neon (Postgres 17 + pgvector, 싱가포르 aws-ap-southeast-1)
```

서버를 DB와 같은 싱가포르에 두는 이유: 요청 하나에 DB를 여러 번 오가서, 서버와 DB 사이 거리가 가장 중요해요.

## 1. Neon (정모님, F0)

1. 프로젝트를 **둘** 만들어요. 둘 다 지역 **AWS Asia Pacific 1 (Singapore)**, Postgres **17**(CI 컨테이너 `pgvector/pgvector:pg17`과 맞춤). 지역은 만든 뒤 바꿀 수 없어요.
   - `booktelier-dev`: 개발과 자동 테스트
   - `booktelier-prod`: 발표·배포. 무료 한도(월 100 CU-hours)는 프로젝트마다 따로라, 개발 브랜치가 쓴 양 때문에 발표 DB가 멈추지 않아요(D-23, 11.20 확정)
2. 브랜치 만들기(프로젝트마다 무료 10개 안).

   | 프로젝트 | 브랜치 | 누가 | 어디에 넣나 |
   | --- | --- | --- | --- |
   | `booktelier-prod` | `main` | 배포 | Railway `DATABASE_URL` |
   | `booktelier-dev` | `dev-jeongmo`, `dev-hyerin` | 각자 개발 | 각자 `api/.env`의 `DATABASE_URL` |
   | `booktelier-dev` | `test-jeongmo`, `test-hyerin` | 각자 자동 테스트 | 각자 `api/.env`의 `TEST_DATABASE_URL` |

3. 주소는 Connect 창에서 **pooled 끈 주소(직접 연결)**를 써요. Alembic과 상시 서버에는 직접 연결이 맞아요. 서버가 늘 떠 있고 자기 연결 풀(5+5)을 가져서 pooled 주소를 따로 두지 않아요(주소 하나, D-24, 11.20 확정). `postgresql://`로 시작해도 서버가 psycopg 3 주소로 바꿔 써요.
4. 각 개발 브랜치에 마이그레이션 올리기: `cd api && uv run alembic upgrade head` (사람이 승인). 테스트 브랜치는 pytest가 스스로 올려요.

## 2. Railway (정모님, F1 첫 배포)

**체험으로 시작하고, 아래 기준에 걸리면 Hobby($5)로 올려요.** 'Limited Trial'이 뜨면 먼저 railway.com/verify에서 GitHub 인증을 다시 시도하거나 결제 카드를 등록해 봐요. Railway 지원 답변에는 둘 중 하나로 체험을 풀 수 있다고 나와요(station.railway.com 'Free Trial not working issue', 11.20 확인). 그래도 안 풀리면 Hobby로 올려요.

| 언제 | 무엇을 보면 | Hobby로 올리는 기준 |
| --- | --- | --- |
| 가입 직후 | 화면에 'Limited Trial'이 뜨는지 | 뜨면 바로(바깥 연결 제한 → Neon·LLM에 못 붙음) |
| F1 첫 배포 | 서버에서 Neon 연결, (F6) LLM 호출 | 연결이 안 되면 |
| 매일 저녁 | Usage의 남은 크레딧 | 11.26까지 하루 약 $0.8 안쪽이 아니거나, $2 아래로 내려가면 |
| **11.24(화) 저녁** | 최종 점검 | 남은 크레딧이 애매하면 이때. 체험이 끝나면 한국 시간 9~21시에 싱가포르 배포가 막혀요(출처 확인 필요. 찾으면 링크를 여기에) |

Hobby로 올리면 Usage에서 **지출 한도**를 꼭 걸어요.

서비스 설정:

| 항목 | 값 |
| --- | --- |
| 소스 | GitHub 저장소, 브랜치 `master` |
| Root Directory | `api` |
| Region | Southeast Asia (Singapore) |
| Start Command | `uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Pre-deploy Command | `uv run --no-sync alembic upgrade head && uv run --no-sync python scripts/seed_norms.py --if-empty` (사람이 리뷰해 merge한 커밋만 배포되므로, 배포 DB 변경은 여기서만 일어나요. 어문 규범은 비어 있을 때만 넣고, 넣지 못해도 배포는 막지 않아요, F8) |
| Healthcheck Path | `/health` |
| PR 미리보기 환경 | **끔**. 켜면 미리보기가 배포 DB 주소를 물려받아 마이그레이션을 돌릴 수 있어요. 쓰려면 Neon 브랜치를 따로 연결한 뒤에 |

첫 배포 뒤 확인: `https://<서비스>.up.railway.app/health/db`가 `{"connected":true,"pgvector":true}`이면 Neon까지 붙은 거예요(체험이 제한되면 여기서 연결 오류). `/health`가 `{"status":"ok"}`이고 응답이 빠른지(싱가포르·기본 도메인에서 첫 요청이 늦다는 글이 있어 직접 재 봐요), 로그에 DB 연결 오류가 없는지.

## 3. Vercel (혜린 님)

1차 프로젝트를 그대로 써요. Root Directory `web`, 빌드는 Next.js 기본값.
환경 변수 `NEXT_PUBLIC_API_URL`에 Railway 주소를 넣어요. `NEXT_PUBLIC_DEV_BAR`는 넣지 않아요(최종 배포에는 개발용 막대 없음, D-33).
Vercel 주소가 정해지면 Railway의 `CORS_ORIGINS`에 넣어요.

## 4. 환경 변수

| 이름 | 어디 | 값 | 뜻 |
| --- | --- | --- | --- |
| `APP_ENV` | api | `local` / `test` / `production` | 실행 환경 |
| `DATABASE_URL` | api | Neon 직접 연결 주소 하나 | 개발은 `booktelier-dev`의 `dev-이름`, 배포는 `booktelier-prod`의 `main`. Alembic도 같은 주소 |
| `TEST_DATABASE_URL` | api(로컬만) | `booktelier-dev`의 `test-이름` 주소 | pytest DB 테스트. `DATABASE_URL`과 같으면 테스트가 시작하지 않아요. CI는 컨테이너 주소를 스스로 넣어요 |
| `CORS_ORIGINS` | api | `http://localhost:3000,https://<vercel 주소>` | 웹 주소만, 쉼표로 |
| `WEB_URL` | api | `http://localhost:3000` (배포는 `https://<vercel 주소>`) | 웹 주소 하나. 편집자 링크(`/e/…`)·초대 링크(`/j/…`)를 이 주소로 만들어요 |
| `AI_PROVIDER` | api | `demo` / `llm` | 배포는 `llm`(실제 AI). e2e·CI·pytest는 늘 `demo` |
| `LLM_BASE_URL` | api | 엘리스 플랫폼 LLM 주소 + `/v1` | OpenAI 호환 API(F6) |
| `LLM_MODEL` | api | `openai/gpt-6.2-sol` | 바꾸면 다른 모델로 |
| `LLM_API_KEY` | api(배포처·로컬 `.env`만) | 엘리스 플랫폼 발급 키 | 브라우저로 절대 보내지 않아요(D-21) |
| `EMBEDDING_BASE_URL` | api | 엘리스 플랫폼 임베딩 주소 + `/v1` | RAG(F6). 없으면 장 검토가 근거 없이 돌아요 |
| `EMBEDDING_MODEL` | api | `openai/text-embedding-3-small` | 1536차원(rag_chunk) |
| `EMBEDDING_API_KEY` | api(배포처·로컬 `.env`만) | 엘리스 플랫폼 발급 키 | 브라우저로 절대 보내지 않아요 |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:8000` / Railway 주소 | 서버 주소 |
| `NEXT_PUBLIC_DEV_BAR` | web | 비움 / `1` / `0` | 배포에서 개발용 막대를 보이게 하려면 `1`. 개발 서버에서 숨기려면 `0` |

로컬은 `api/.env`(`api/.env.example`을 복사)와 `web/.env.local`에 넣어요. 둘 다 git에 안 올라가요.

## 5. 키가 새었을 때

공개 저장소에 키나 DB 주소가 올라갔으면 커밋을 지우는 것만으로는 부족해요. **바로 새 키를 발급**하고(LLM 키, Neon 비밀번호 재설정) 배포처 값을 바꿔요.
