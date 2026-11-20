"""계약 약속. 파일 비교(R13)는 scripts/check-contract.mjs가 해요."""

from app.main import create_app


def test_every_endpoint_summary_starts_with_need_number() -> None:
    # summary는 api-needs 번호(A-xx)나 health로 시작해요(D-36). scripts/progress.mjs가 이것으로 진행을 세요.
    spec = create_app().openapi()
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            summary = op.get("summary", "")
            assert summary.startswith(("A-", "health")), (
                f"{method.upper()} {path}의 summary가 'A-xx …'로 시작하지 않아요"
            )
