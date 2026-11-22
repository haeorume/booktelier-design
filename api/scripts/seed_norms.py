"""어문 규범 조항을 rag_chunk에 넣어요(F6 RAG, db 탭 4번 '어문 규범').

규범 파일(app/ai/norms/norms.json)이 바뀌면 다시 돌려요. 돌릴 때마다 규범 조각을 통째로 바꿔요.
임베딩 주소·키(EMBEDDING_*)와 DB 주소(DATABASE_URL)는 api/.env(배포는 Railway 환경 변수)에서 읽어요.
마이그레이션 0005가 먼저 올라가 있어야 해요.

    cd api && uv run python scripts/seed_norms.py              # 통째로 다시 넣기
    cd api && uv run python scripts/seed_norms.py --if-empty   # 비어 있을 때만(배포 Pre-deploy에서, F8)

--if-empty는 배포를 막지 않으려고 실패해도 0으로 끝나요. 임베딩 설정이 없거나 호출이 실패하면 경고만 남기고,
장 검토는 근거 없이 돌아요(NFR-03). 다음 배포 때 다시 시도해요.
"""

import json
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
NORMS = API_DIR / "app" / "ai" / "norms" / "norms.json"


def main() -> int:
    sys.path.insert(0, str(API_DIR))
    from app.ai.embeddings import make_embeddings  # 경로를 넣은 뒤에 불러요(dump_openapi.py와 같음)
    from app.config import get_settings
    from app.db import rag as rag_db
    from app.db.session import get_sessionmaker

    if_empty = "--if-empty" in sys.argv
    if if_empty:
        with get_sessionmaker()() as db:
            existing = rag_db.count_norms(db)
        if existing:
            print(f"어문 규범 {existing}조항이 이미 있어요. 넣지 않아요.")
            return 0
    try:
        norms = json.loads(NORMS.read_text(encoding="utf-8"))["norms"]
        embeddings = make_embeddings(get_settings())
        # 라벨을 함께 임베딩해 '제42항' 같은 질의에도 걸리게 해요.
        vectors = embeddings.embed_documents([f"{n['label']}\n{n['content']}" for n in norms])
    except Exception as e:
        if not if_empty:
            raise
        print(
            f"경고: 어문 규범을 넣지 못했어요({type(e).__name__}). 장 검토는 근거 없이 돌아요. 다음 배포 때 다시 해요."
        )
        return 0
    chunks = [
        rag_db.NewChunk(label=n["label"], content=n["content"], embedding=v)
        for n, v in zip(norms, vectors, strict=True)
    ]
    with get_sessionmaker()() as db:
        count = rag_db.replace_norms(db, chunks)
    print(f"어문 규범 {count}조항을 넣었어요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
