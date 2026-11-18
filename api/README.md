# api/

목요일부터 FastAPI 서버를 둘 자리예요. 1차 MVP(수요일)에는 비워 둬요.

- 1차는 `web/`의 브라우저 저장과 예시 데이터로 돌아요(`docs/DECISIONS.md` D-06, D-07).
- 서버를 붙일 때는 data-contract 모양을 그대로 따르고(boundary M5), 웹은 `web/src/data/` 어댑터만 HTTP 구현으로 바꿔요.
