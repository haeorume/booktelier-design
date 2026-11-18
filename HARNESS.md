# 하네스 쓰는 법 (정모님용, Windows 기준)

코드는 **Claude Code**가 쓰고, 검수는 **Codex**가 해요. 둘 다 PyCharm 아래쪽 터미널 하나에서 써요.
Codex는 Claude Code 안에 플러그인으로 넣어 `/codex:review`로 불러요. 터미널을 따로 열 필요가 없어요.

## 이 묶음은 '지도 + 막는 장치'예요

| 파일 | 하는 일 |
| --- | --- |
| `AGENTS.md` | **지도**. 두 AI가 같이 읽어요. 무엇을 어디서 찾는지만 가리켜요 |
| `CLAUDE.md` | 지도를 불러오고(`@AGENTS.md`), Claude의 작업 루프만 적어요 |
| `docs/README.md` | 기준 문서 안내. 질문별로 볼 탭, 읽지 않아도 되는 탭 |
| `docs/PLAN.md` | 작업 묶음 W0~W6과 완료 기준 |
| `docs/DECISIONS.md` | 시트끼리 어긋난 곳의 임시 교정표. 시트가 고쳐지면 줄을 지워요 |
| `scripts/check-invariants.mjs` | **불변 규칙 R1~R10**을 기계가 검사하고 고치는 법을 알려 줘요 |
| `.claude/settings.json`, `.claude/hooks/` | 훅 2개와 권한. 커밋·push는 매번 정모님 승인. `.env`와 하네스 파일은 Claude가 못 고쳐요 |
| `docs/sheets/` | 시트 세 개를 탭마다 .md로 옮긴 것(11.18 17시). 예시 JSON은 `docs/sheets/dev/json/` |
| `docs/design/` | FigJam 그림 4장(11.18 17시). 화면 흐름도는 AI가 글자를 읽게 줄별 조각으로도 넣음. 배치 참고용 |
| `scripts/sheets_to_md.py`, `docs/source/` | 시트를 고친 뒤 .xlsx를 받아 `docs/sheets/`를 다시 만들 때 써요 |
| `api/README.md` | 목요일부터 쓸 서버 자리. 1차에는 비워 둬요 |

## 처음 한 번

PyCharm 아래쪽 터미널은 Windows에서 보통 **PowerShell**이에요. 아래 명령은 PowerShell 기준이에요.

### 0. 준비물

```powershell
node -v            # v20 이상
git --version
py --version       # Python 3
claude --version
```

- Codex 로그인에 쓸 ChatGPT 계정(무료도 돼요). 쓴 만큼 그 계정의 Codex 사용량에서 빠져요.
- 훅은 셸 없이 `node`로 바로 돌게 해 둬서 PowerShell에서도 돌아요.

### 1. 새 폴더에서 시작

지금까지 하던 폴더는 지우지 말고 참고용으로 두고, 새 폴더에서 시작해요.

```powershell
git clone <우리 GitHub 저장소 주소> booktelier
cd booktelier
```

저장소가 아직 없으면 GitHub에서 **비공개** 저장소를 새로 만들고 clone해요.

### 2. 이 묶음 넣기

```powershell
Expand-Archive -Path "$HOME\Downloads\booktelier-harness.zip" -DestinationPath . -Force
Get-ChildItem -Force     # .claude, AGENTS.md, CLAUDE.md, docs, scripts, api 가 보이면 됨
```

점으로 시작하는 `.claude` 폴더가 꼭 들어가야 해요.

### 3. 문서 확인

`docs/sheets/`는 11.18 17시 시트로 이미 만들어 넣어 뒀어요. 확인만 해요.

```powershell
node scripts/check-invariants.mjs     # '불변 규칙: 통과'가 나오면 됨
```

시트를 고친 뒤에만 `docs/source/README.md`대로 .xlsx를 내려받아 `py scripts/sheets_to_md.py`로 다시 만들어요.
FigJam 그림도 `docs/design/`에 들어 있어요. 그림을 고치면 같은 이름으로 다시 내보내 바꿔 넣어요(화면 흐름도 조각은 혜린님께 부탁해 다시 잘라요).

### 4. 첫 커밋

```powershell
git add -A
git commit -m "하네스 세팅"
git push
```

### 5. Claude Code 켜기

저장소 맨 위 폴더에서 `claude`를 실행해요.
(선택) PyCharm의 Settings → Plugins에서 Anthropic 공식 'Claude Code' 플러그인을 깔면 바뀐 내용을 IDE 화면에서 보기 편해요. 없어도 돼요.

### 6. Codex 플러그인 넣기

Claude Code 입력창에 한 줄씩 쳐요.

```
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

- Codex CLI가 없으면 `/codex:setup`이 설치를 제안해요. 로그인하라고 나오면 `!codex login`.
- 자동 검수(review gate)는 켜지 않아요. `--enable-review-gate`를 붙이지 마세요.

### 7. 장치가 들어갔는지 확인

- `/hooks`: **PostToolUse**와 **Stop**에 하나씩 보이면 돼요. 안 보이면 `.claude` 폴더가 빠진 거예요.
- `/memory`: 프로젝트 메모리에 `CLAUDE.md`가 보이면 돼요(지도 `AGENTS.md`는 그 안에서 불러와요).

### 8. 첫 지시

```
docs/PLAN.md의 W0을 시작해. 먼저 계획만 보여 주고 멈춰.
```

---

## W 하나 = 루프 한 바퀴

1. **계획 확인**: Claude가 계획을 보여 주고 멈춰요. 괜찮으면 `진행해`, 이상하면 고쳐 달라고 해요.
2. **구현**: Claude가 만들고 검사를 돌려요. 훅이 알아서 린트, 불변 규칙, 타입 검사, 단위 테스트를 걸어요. 끝나면 보고하고 멈춰요.
3. **직접 눌러 보기**: 보고의 '확인하는 방법'대로 눌러 봐요. 터미널 탭을 하나 더 열어 `cd web; npm run dev` → http://localhost:3000
4. **Codex 검수**: `/codex:review` (커밋하지 않은 변경을 읽기만 해요)
5. **고치기**: `Codex 지적 정리해서 고칠 것만 고쳐 줘`
6. **커밋**: 검사 통과를 확인하고 `커밋해` → 승인 창이 뜨면 허용
7. **push**: `git push` (직접)
8. **다음 W**: `W1 시작해. 계획만 먼저.`

문서 기준으로 세게 보고 싶을 때는 4번에서 `/codex:adversarial-review` 뒤에 초점을 적어요.
예: `/codex:adversarial-review docs/DECISIONS.md와 data-contract 이름을 따르는지 봐 줘`

## 막혔을 때

- **진행이 안 보이면**: `Esc` → `지금까지 한 것, 남은 것, 막힌 것 요약해 줘`
- **멈춰 있는 것 같으면**: 터미널이 승인 질문(허용할까요?)에서 기다리고 있는지 먼저 봐요.
- **훅이 같은 오류로 막으면**: 한 번 다시 고쳐 본 뒤에도 실패하면 Claude가 실패를 보고하고 멈춰요. 보고를 읽고 정해요.
- **불변 규칙이 맞지 않는 상황이면**: 규칙 예외는 사람이 `scripts/check-invariants.mjs`를 고쳐서 둬요(Claude는 못 고쳐요). 혜린님과 같이 정해요.
- **Claude가 문서와 다르게 하자고 하면**: 혜린님께 공유해 주세요. `docs/DECISIONS.md`를 고칠지 같이 정해요.
- **시트를 고쳤으면**: .xlsx를 다시 내려받아 `py scripts/sheets_to_md.py`를 다시 돌리고 커밋해요.
- **시간이 밀리면**: `docs/PLAN.md` 끝의 '빼는 순서'대로 빼요.
