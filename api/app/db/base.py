from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """테이블 모델의 부모. 테이블 이름과 칸은 개발 문서 db·data-contract를 따라요."""


# 테이블 모델은 app/db/models.py 에 두고, alembic/env.py 가 그 모듈을 import 해서 메타데이터를 채워요(F1).
