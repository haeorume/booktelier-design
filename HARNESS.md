# 하네스 쓰는 법 v3 (최종 MVP, Windows 기준)

코드는 **Claude Code**가 쓰고, 검수는 **Codex**가 해요(Claude Code 안 플러그인 `/codex:review`). 커밋은 사람이 '커밋해'라고 할 때만, push와 PR은 사람이 직접 해요.
1차 하네스(W0~W6)에서 틀은 그대로이고, 서버(`api/`)·계약·디자인·CI가 더해졌어요.

## 이 묶음은 '지도 + 막는 장치 + 루프'예요

| 파일 | 하는 일 |
| --- | --- |
| `AGENTS.md`, `api/AGENTS.md` | **지도**. 두 AI가 같이 읽어요. 무엇을 어디서 찾는지만 가리켜요 |
| `CLAUDE.md`, `api/CLAUDE.md` | 지도를 불러오고(`@AGENTS.md`), Claude의 작업 루프를 적어요 |
| `docs/PLAN.md` | 작업 묶음 F0~F8, 완료 기준, 서버 점검 S-01~S-09 |
| `docs/DECISIONS.md` | 시트끼리 어긋난 곳과 새로 정한 것(D-xx) |
| `docs/DEPLOY.md` | Neon·Railway·Vercel, 환경 변수, Railway 체험 → Hobby 기준 |
| `docs/README.md` | 기준 문서 안내. 질문별로 볼 탭 |
| `docs/design/DESIGN.md`, `web/src/styles/tokens.css` | 화면이 어떻게 보이나. 견본은 `docs/design/specimen.html` |
| `docs/HANDOFF.md` | 1차를 만들며 문서와 다르게 한 것. 시트에 옮기면 지워요 |
| `scripts/check-invariants.mjs` | **불변 규칙 R1~R15**를 기계가 검사하고 고치는 법을 알려 줘요 |
| `scripts/check-contract.mjs` | **R13** 계약 파일(`api/openapi.json`, `web/src/types/api.ts`)이 서버 코드와 맞는지 |
| `scripts/check-all.mjs` | 위 둘 + web·api 검사 전부를 한 번에 |
| `scripts/progress.mjs` | 지금 F에서 서버에 아직 없는 API, 확인할 QA·서버 점검. `docs/PLAN.md` 맨 위 '지금 할 F:' 줄은 사람이 고쳐요 |
| `.claude/commands/` | `/next`(계획), `/report`(보고), `/review-fix`(Codex 지적 정리) |
| `.github/pull_request_template.md` | PR 양식 |
| `.claude/settings.json`, `.claude/hooks/` | 훅 2개와 권한 |
| `.github/workflows/check.yml` | PR마다 같은 검사 + DB 테스트(pgvector 컨테이너) |
| `docs/sheets/` | 시트 v0.4(11.20) 사본. 다시 만들 때 `scripts/sheets_to_md.py` |

## 처음 한 번 (F0)

PyCharm 아래쪽 터미널(PowerShell)에서 저장소 맨 위 폴더(`C:\Booktlie`) 기준이에요.

### 1. 도구

```powershell
node -v            # v22 이상
git --version
claude --version
uv --version       # 없으면 아래 한 줄로 설치하고 터미널을 새로 열어요
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Python 3.12는 `uv sync`가 알아서 받아요. 따로 설치하지 않아도 돼요.

### 2. 받은 변경 확인과 설치

```powershell
git status                     # 하네스 v3 파일들이 바뀜·새 파일로 보여요
cd web; npm install; cd ..     # openapi-typescript가 더해졌어요
cd api; uv sync; cd ..         # 서버 패키지(.venv)
```

### 3. Neon과 .env

`docs/DEPLOY.md` 1장대로 Neon 프로젝트 둘(`booktelier-dev`, `booktelier-prod`. 싱가포르, Postgres 17)과 브랜치(`dev-jeongmo`, `test-jeongmo` …)를 만들고:

```powershell
Copy-Item api\.env.example api\.env    # DATABASE_URL, TEST_DATABASE_URL 채우기 (서로 다른 브랜치!)
cd api; uv run alembic upgrade head; cd ..
```

### 4. 검사가 도는지 확인

```powershell
node scripts/check-all.mjs                 # '전체 검사: 통과'. R11 경고 43건은 F7까지 정상
cd web; npm run test:e2e; cd ..            # 1차 e2e가 그대로 통과
```

DB 테스트까지 돌았는지는 `api 테스트` 줄 아래에 'DB 테스트 n개를 돌리지 않았어요'가 **없는지**로 봐요.

### 5. 1차 보존과 첫 커밋

```powershell
git tag mvp1 c031565
git push origin mvp1
git rm -r --cached .idea          # PyCharm 설정은 PC에 남고 저장소에서만 빠져요(R10)
git add -A
git commit -m "F0: 하네스 v3"
git push
```

`docs/HANDOFF.md`도 같이 커밋해요(지금까지 커밋 안 된 채 있었어요). `.idea/`와 `Claude outputs/`는 `.gitignore`에 넣어 올라가지 않아요.

### 6. Claude Code에서 장치 확인

저장소 맨 위에서 `claude`를 실행해요.
- `/hooks`: **PostToolUse**와 **Stop**에 하나씩 보이면 돼요.
- `/memory`: `CLAUDE.md`가 보이면 돼요.
- Codex 플러그인은 1차 때 넣은 그대로 써요. 없으면 `/plugin marketplace add openai/codex-plugin-cc` → `/plugin install codex@openai-codex` → `/reload-plugins` → `/codex:setup`. 자동 검수(review gate)는 켜지 않아요.
- 첫 질문: `/next` → F1 계획이 나오면 지도가 제대로 읽힌 거예요(그 전에 `docs/PLAN.md`의 '지금 할 F:'를 F1로).

### 7. 첫 지시

```
docs/PLAN.md의 F1을 시작해. 먼저 계획만 보여 주고 멈춰.
```

---

## F 하나 = 루프 한 바퀴

1. **계획 확인**: `/next`. Claude가 계획과 바꿀 계약을 보여 주고 멈춰요. 괜찮으면 `진행해`.
2. **구현**: 계약 먼저 → 구현 → 테스트. 훅이 알아서 ESLint·ruff, 끝낼 때 불변 규칙·타입·테스트·pytest·계약을 걸어요.
3. **직접 눌러 보기**: 보고의 '확인하는 방법'대로. 서버는 `cd api; uv run uvicorn app.main:app --reload`, 화면은 `cd web; npm run dev`.
4. **Codex 검수**: `/codex:review` (커밋하지 않은 변경을 읽기만 해요). 세게 보려면 `/codex:adversarial-review 권한 검사와 409 처리를 봐 줘`.
5. **고치기**: Codex 결과를 붙여 `/review-fix` → 표를 보고 `진행해`
6. **마이그레이션이 있으면**: Claude가 적어 준 `uv run alembic upgrade head`를 내 dev 브랜치에 직접 실행(승인 창).
7. **커밋**: 검사 통과를 확인하고 `커밋해` → 승인 창에서 허용
8. **push·PR**: 직접. CI가 초록이면 상대가 보고 merge해요.
9. **다음 F**: `F2 시작해. 계획만 먼저.`

## 막혔을 때

- **진행이 안 보이면**: `Esc` → `지금까지 한 것, 남은 것, 막힌 것 요약해 줘`
- **멈춰 있는 것 같으면**: 승인 질문(허용할까요?)에서 기다리는지 먼저 봐요.
- **훅이 같은 오류로 막으면**: 한 번 다시 고친 뒤에도 실패하면 Claude가 보고하고 멈춰요. 보고를 읽고 정해요.
- **R13(계약)이 실패하면**: `cd api; uv run python scripts/dump_openapi.py; cd ../web; npm run gen:api` 뒤 두 파일을 같이 커밋.
- **DB 테스트가 'TEST_DATABASE_URL이 DATABASE_URL과 같아요'로 멈추면**: `api/.env`의 두 주소를 서로 다른 Neon 브랜치로.
- **불변 규칙이 맞지 않는 상황이면**: 규칙 예외는 사람이 `scripts/check-invariants.mjs`를 고쳐서 둬요(Claude는 못 고쳐요). F7에서 `R11_STRICT = true`로 바꾸는 것도 사람이에요.
- **Claude가 문서와 다르게 하자고 하면**: 팀에 공유하고 `docs/DECISIONS.md`를 고칠지 같이 정해요.
- **시트를 고쳤으면**: 시트 셋을 .xlsx로 받아 `docs/source/`에 넣고 `py scripts/sheets_to_md.py` → 커밋.
- **Railway가 이상하면**: `docs/DEPLOY.md` 2장의 Hobby 기준을 봐요.
- **시간이 밀리면**: `docs/PLAN.md` 끝의 '빼는 순서'대로 빼요.
