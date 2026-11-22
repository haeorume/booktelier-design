"""DB 층. SQLAlchemy·psycopg를 쓰는 코드는 이 폴더에만 둬요(불변 규칙 R6).

- base.py: 모든 테이블 모델의 부모(Base). Alembic 자동 생성이 이 메타데이터를 봐요.
- session.py: 엔진과 세션. 라우터는 `get_db`로 세션을 받아 이 폴더의 함수에 넘겨요.
- status.py: DB 연결과 pgvector 확인(/health/db).
"""
