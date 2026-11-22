## F? <이름> — <조각>

<!-- 브랜치 하나 = F의 조각 하나. 계약을 바꾸는 PR은 따로, 먼저 merge해요(D-25). -->

- 만든 것:
- 확인하는 방법(띄울 명령, 브라우저 몇 개로, 누르는 순서):
- 계약 변경: 없음 / 있음(A-xx. `api/openapi.json`과 `web/src/types/api.ts`를 같이 바꿈)
- 마이그레이션: 없음 / 있음(파일 이름, 읽어서 고친 것)
- 확인한 QA·서버 점검: QA-F.., S-..
- 문서와 다르게 한 것: 없음 / 있음(DECISIONS에 넣을지 물어봄)

### 검사

- [ ] `node scripts/check-all.mjs` 통과(DB 테스트까지 돈 결과를 아래에 붙임)
- [ ] 화면을 바꿨으면 `cd web && npm run test:e2e` 통과
- [ ] Codex 검수(`/codex:review`)를 받고 '고칠 것'을 고침
- [ ] 상대가 읽고 승인함

```
(check-all 결과)
```
