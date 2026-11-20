"""AI 층. LLM SDK·LangChain은 이 폴더에서만 import 해요(불변 규칙 R5).

- F5: 제공자 인터페이스와 데모 제공자(1차 예시 JSON)
- F6: 실제 LLM 제공자(LangChain), 검색은 `BaseRetriever`로 감싸고 SQL은 app/db의 함수를 불러요(D-26).
  langchain_postgres(PGVector 등)는 쓰지 않아요(불변 규칙 R15).
"""
