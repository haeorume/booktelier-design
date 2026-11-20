# api/ 지도 (서버)

FastAPI + SQLAlchemy 2(동기, psycopg 3) + Alembic + PostgreSQL(pgvector). Python 3.12, 패키지는 uv.
결정 근거는 `docs/DECISIONS.md` D-21~D-31, 경로·모양은 `docs/sheets/dev/09_api-needs.md`, 테이블은 `dev/07_db.md`·`dev/06_data-contract.md`.

## 폴더

| 폴더 | 하는 일 | 지킬 것 |
| --- | --- | --- |
| `app/main.py` | 앱 만들기, CORS, 오류 처리, 라우터 붙이기 | |
| `app/errors.py` | 오류 모양 `{ code, message }`와 `AppError` | 오류는 늘 이 모양(C-3, D-35) |
| `app/config.py` | 설정(환경 변수). 이름은 `.env.example` | 값을 코드에 적지 않음 |
| `app/routers/` | HTTP 경로. 요청 → 권한 확인 → db·ai 함수 호출 → Pydantic 응답 | SQL·sqlalchemy import 금지(R6). 세션은 `DbSession`으로 받아 넘김. summary는 `A-xx …`로 시작(D-36) |
| `app/schemas/` (F1) | API 모델(Pydantic). **계약의 원본** | DB 칸(`token_hash` 등)을 넣지 않음 |
| `app/auth/` (F1) | 토큰 → 참여자 찾기, `can(role, action)` 권한 검사 한 곳 | 토큰은 해시만 비교 |
| `app/db/` | 모델(`models.py`), 세션, 읽기·쓰기 함수 | SQLAlchemy·psycopg는 여기서만. 커밋도 여기서 |
| `app/ai/` (F5·F6) | AI 제공자 인터페이스, 데모 제공자, LLM 제공자, Retriever | LLM SDK·LangChain은 여기서만(R5). langchain-postgres 금지(R15) |
| `alembic/` | 마이그레이션 | 자동 생성 결과를 꼭 읽고 고쳐요. 확장·벡터 색인은 직접 적어요 |
| `tests/` | pytest. DB가 필요한 테스트는 `@pytest.mark.db` | 테스트 하나 = 트랜잭션 하나(`db` 픽스처) |
| `scripts/dump_openapi.py` | 계약을 `openapi.json`으로 | 라우터·스키마를 바꾸면 꼭 돌림(R13) |

## 명령 (api/ 에서)

```bash
uv sync                                       # 설치
uv run uvicorn app.main:app --reload          # http://localhost:8000/docs
uv run ruff check . && uv run ruff format .   # 린트·포맷
uv run mypy app tests                         # 타입
uv run pytest -q                              # 테스트 (TEST_DATABASE_URL이 있으면 DB 테스트도)
uv run alembic revision --autogenerate -m "무엇"   # 마이그레이션 만들기 → 파일을 읽고 고침
uv run alembic upgrade head                   # 내 dev 브랜치에 올리기 (사람 승인)
uv run python scripts/dump_openapi.py && cd ../web && npm run gen:api   # 계약 다시 만들기
```

## 규칙

- **계약 먼저**: 새 엔드포인트는 Pydantic 모델과 가짜 응답부터 만들고 계약을 다시 만들어 먼저 올려요(D-25).
- **권한은 서버가 다시**: 모든 엔드포인트는 토큰 확인(401)과 책 범위·역할 확인(403)을 거쳐요. 권한 표 테스트에 줄을 더해요(PLAN S-05).
- **원고**: 바꾸는 요청은 `base_version`을 받고, 다르면 409와 최신 버전(D-30). 원고 글자는 이벤트·로그에 넣지 않아요.
- **시각**: 서버가 정해요(timestamptz).
- **AI**: `AI_PROVIDER=demo`가 기본. 테스트·CI·e2e는 늘 demo. 실제 LLM 호출이 실패해도 원고 저장은 막지 않아요(NFR-03).
- **DB 테스트**: `TEST_DATABASE_URL`은 내 Neon `test-이름` 브랜치. 개발 DB와 같으면 테스트가 시작하지 않아요.
