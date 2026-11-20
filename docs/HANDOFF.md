# 1차 MVP 인계 메모 (11.19, W0~W6 끝)

1차를 만들면서 **대화에서 정했거나 문서와 다르게 만든 것**을 한곳에 모았어요. 2차 문서(시트, `docs/DECISIONS.md`, `docs/PLAN.md`)를 고칠 때 체크리스트로 쓰고, 모두 문서에 옮긴 뒤에는 이 파일을 지워요.
커밋: W0 `5bf3872` · W1 `27d0a48` · W2 `30da367` · W3 `44dc373` · W4 `0ba14bf` · W5 `05d8b20` · W6 `c031565`.

## 1. 문서와 다르게 만든 것 (2차 문서에 반영하거나 코드를 되돌릴지 정할 것)

| 무엇 | 문서 | 1차 코드 | 정한 때 | 코드 위치 |
| --- | --- | --- | --- | --- |
| 새 책의 첫 장 | FR-01 비고: 빈 첫 장 | 데모 모드라 **예시 원고 1장**으로 채움. 장 id는 새 UUID, 문단 id·글자는 예시 그대로 | W2 | `data/books.ts` `createBook` |
| 개발용 막대로 작가·디자이너를 처음 고를 때 | 정할 것 4·QA-24: 링크로 한 번 들어온 뒤부터 | FR-41 ②를 따라 **처음 고를 때 이름을 물음** | W2 | `components/DevBar.tsx` |
| AI 제안 보내기 | events 탭: 작가(의견으로만)도 | FR-29 ④를 따라 **편집자만** | W1 | `domain/permissions.ts` |
| 수정 제안의 설명 문구 | FR-29: 문구를 편집해 보냄. data-contract `suggested_edit`에 글 칸 없음 | 수정 제안으로 보내면 **수정 제안 + 문구를 담은 의견**을 함께 만듦(둘 다 `ai_origin_id`) | W4 | `data/review.ts` `sendAiSuggestion` |
| 보낸 카드 표시 | 레이블링 L-46 'AI 제안 기반'(보류) | FR-29·QA-14의 **'AI 제안에서 보냄'** | W4 | `domain/labels.ts` `AI_ORIGIN_LABEL` |
| 분석 중 문구 | FR-20: "검토 중" | 레이블링 L-41 **'분석 중 / 분석 실패'** | W3 | `components/review/ReviewPanel.tsx` |
| AI 제안 종류 이름 | 레이블링 L-44: 교정·교열·윤문 | D-04 **맞춤법·띄어쓰기·표기 통일·윤문** | W3 | `domain/labels.ts` `KIND_LABEL` |
| 실행 취소 이벤트 | FR-27 비고: 적용·취소를 기록 | 확정 이름이 없어 **남기지 않음** | W3 | — |
| 거절·검토 완료·답글 이벤트 | 이름 없음 | 거절만 잠정 이름으로 남김(아래 3번). 검토 완료·답글은 남기지 않음 | W4 | `app/p/.../useShared.ts` |
| 확인할 일에 의견 세기 | FR-02 ②: 의견은 카드를 열면 줄어듦. data-contract에 '열어 봤는지' 칸 없음 | 편집자가 연 의견 id를 **브라우저에만** 저장(`seen_comments`). 서버가 생기면 서버로 옮길 것 | W4 | `data/session.ts`, `data/review.ts` |
| 접속자 표시(FR-19, Should) | 어느 W에도 없음 | 정할 것 17 잠정대로 **참여자 아바타 + 지금 역할 강조**(실시간 아님) | W4 | `components/Participants.tsx` |
| 책 카드의 '최근 변경' | data-contract에 `updated_at` 없음 | 그 책의 **마지막 이벤트 시각**(없으면 만든 시각) | W2 | `data/books.ts` `lastActivityTs` |
| 데모 제공자가 돌려주는 값 | D-19: 예시 JSON 글자 그대로 | 파일은 그대로. 돌려줄 때 **id(새 UUID)·chapter_id·base_version·owner_participant_id만** 요청에 맞춤 | W1 | `ai/demo-provider.ts` |
| 좁은 창의 패널 폭 | 기준 없음 | 1500px·1360px 이하에서 원고 구조·검토 패널·조판 설정 폭을 줄임(1280px '나란히'에서 실용서 지면이 들어감) | W6 | 각 `*.module.css` |

## 2. 잠정값 (정해지면 이 파일만 바꾸면 됨)

| 무엇 | 1차 잠정값 | 정할 사람(문서 기준) | 코드 위치 |
| --- | --- | --- | --- |
| 템플릿 코드 값 | `novel` · `essay` · `practical` | 정모 | `types/status.ts` `TEMPLATE_IDS` |
| 템플릿 기본값 | 소설 128×188mm·명조·여백 20·행간 1.8 / 에세이 130×200·명조·22·1.7 / 실용서 152×225·고딕·18·1.6 | 디자인(오름), 정모 | `domain/templates.ts` |
| project 조판 필드 이름 | `layout: { trim, margin, line_height }`, `layout_updated_by`, `layout_updated_at` | 정모(data-contract '보류') | `types/entities.ts` |
| 조판 값 범위 | 판형 5개(128×188, 130×200, 140×210, 148×210, 152×225), 여백 12~30mm·1씩, 행간 1.3~2.2·0.05씩 | 오름, 정모(CS-15) | `domain/layout.ts` |
| 밑줄 모양 | 맞춤법 빨간 물결선 · 띄어쓰기 주황 이중선 · 표기 통일 파란 점선 · 윤문 청록 띠. 사람이 보낸 수정 제안 보라 파선 | 오름(CS-11은 옛 종류 3개뿐) | `components/editor/ManuscriptEditor.module.css` |

## 3. 잠정으로 더한 칸과 이름 (시트 반영 대기)

| 무엇 | 넣을 시트 | 내용 | 코드 위치 |
| --- | --- | --- | --- |
| `comment.original` | data-contract `comment` 필드 | 의견을 단 자리의 원문(문자열, 필수). 원고가 바뀌면 이 글자로 자리를 다시 찾음(NFR-05) | `types/entities.ts` |
| `suggested_edit_rejected` | events '2. 이벤트' | 받은 사람이 수정 제안을 거절했을 때. props: `suggested_edit_id`, `from_ai` | `events/names.ts` |

이벤트 props에 문서에 없는 칸도 더했어요: `participant_joined.via`(role_link·dev_bar), `first_edit.via`(direct·apply·accept), `role_link_copied.clipboard`(ok·failed), AI 제안 이벤트의 `source`, `ai_suggestion_applied.choice`, `ai_suggestion_sent.method`, `layout_changed`의 `field`·`before`·`after`·`reset_to_default`.

시트를 고친 뒤 `python scripts/sheets_to_md.py`(Windows는 `py`)로 `docs/sheets/`를 다시 만들고, 코드의 '잠정' 주석을 지워요.

## 4. 1차에서 만들지 않은 것

- 체류 이벤트 `screen_entered` · `screen_left`(확정 이름에는 있음, 어느 W에도 없었음)
- 의견 '해결 / 다시 열기'(L-30), 지면 여백의 의견 아바타(CS-16), 밑줄 팝오버(CS-17, 밑줄을 누르면 카드를 고르는 것으로 대신)
- '반영 중' 표시(L-43), 표기 원칙 목록(FR-31, Could), 링크 재발급(FR-08, 2차)
- 의견·수정 제안의 '원문 삭제됨'(source_deleted) 처리: 원문을 못 찾으면 지면에 붙이지 않기만 함

## 5. 1차의 한계 (데모할 때 말해 둘 것)

- 저장이 그 브라우저(localStorage)에만 있어, 공유 링크를 다른 기기·브라우저에서 열면 '링크를 쓸 수 없어요'가 나와요.
- AI 제안은 예시 데이터예요. 실시간 교정은 둘째 문단(para_02)에서만, 장 검토는 늘 같은 5개.
- 실시간 공동 작업 없음. 이벤트 시각은 브라우저 시각(D-08).

## 6. 남은 일 (사람)

- [ ] `git push`(W0~W6 커밋이 로컬에만 있음)
- [ ] Vercel 배포: Root Directory `web`, 환경 변수 없음(`README.md` '배포')
- [ ] 3번 두 가지를 시트에 반영
- [ ] 2번 잠정값 확정
- [ ] 맨 위 `HARNESS.md`: 한 줄이 지워진 채 커밋되지 않고 남아 있음. 의도한 것인지 보고 커밋하거나 되돌리기
- [ ] QA-26(1440px '나란히'에서 지면이 읽을 만한지) 판단. W5 보고에 캡처 있음

## 7. 2차 순서 제안

0. 위 2·3번을 시트에서 확정(서버 모델을 만들기 전에)
1. 서버(FastAPI)와 DB: data-contract 모양 그대로. 화면은 `data/`의 저장소 인터페이스만 써서, HTTP 저장소를 만들어 바꿔 끼우면 됨
2. 브라우저가 하던 일을 서버로: 역할 링크 토큰 발급(NFR-15 ②), 역할별 AI 제안 걸러 주기(D-09), 권한 검사, 이벤트 서버 시각(D-08), 1번 표의 `seen_comments`
3. 사람 구분: 다른 기기에서도 같은 참여자로 이어지게. 로그인을 둘지 결정(NFR-13은 로그인 없음)
4. LLM: `ai/provider.ts` 뒤에 실제 제공자를 더함. 키는 서버에만. 데모 제공자는 테스트용으로 남김(FR-20 비고)
5. 실시간 공동 작업(FR-18): CRDT와 실시간 연결, 문단 나누기·합치기의 위치 처리(P6). 가장 커서 따로 계획

## 8. 2차 전에 사람이 고칠 하네스

- `scripts/check-invariants.mjs`: R5(실제 LLM 호출 금지)와 R6(`api/` 구현 금지)가 2차 작업을 막아요
- `docs/DECISIONS.md` D-06(1차는 데모 모드), D-07(localStorage), D-08(브라우저 시각)
- `docs/PLAN.md`: 2차 W 묶음
- 이 파일들은 Claude가 고칠 수 없게 막혀 있어요(`.claude/settings.json`)

## 9. 다음 세션에서 알아 둘 것

- e2e 결과는 `web/` 밖(시스템 임시 폴더의 `booktelier-playwright`)에 써요. `web/` 안에 쓰면 개발 서버가 다시 빌드해서 테스트가 흔들려요(W4에서 찾은 원인).
- 데모 플로우 e2e는 13단계를 한 테스트로 눌러 오래 걸려서, 테스트 한 개 시간 한도를 120초로 뒀어요(`playwright.config.ts`).
- `next.config.ts`는 `cacheComponents: true`예요. 주소 값(params)을 기다리는 부분은 Suspense 안에 둬야 하고, 다른 화면에 다녀와도 화면 상태가 남는 점을 생각해야 해요(W2 Codex 지적).
