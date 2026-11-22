# api/ (Booktelier 서버)

FastAPI + PostgreSQL(pgvector). 지도는 `api/AGENTS.md`, 배포와 환경 변수는 `docs/DEPLOY.md`.

## 처음 한 번 (Windows PowerShell)

```powershell
cd api
uv sync                              # Python 3.12와 패키지를 설치해요(.venv)
Copy-Item .env.example .env          # 값 채우기: DATABASE_URL, TEST_DATABASE_URL (Neon 내 브랜치)
uv run alembic upgrade head          # 내 dev 브랜치에 테이블 올리기
uv run uvicorn app.main:app --reload # http://localhost:8000/docs
```

## 검사

```powershell
uv run ruff check . ; uv run ruff format --check . ; uv run mypy app tests ; uv run pytest -q
```

저장소 맨 위에서 `node scripts/check-all.mjs --api`로 한 번에 돌려도 돼요(계약 검사 포함).
