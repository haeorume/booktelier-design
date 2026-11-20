"""글자 위치(UTF-16) 단위 테스트. 웹과 같은 자리를 가리켜야 해요(D-19)."""

from app.docops import Anchor, locate, paragraph_text, replace, u16_find_all, u16_len, u16_slice

DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "attrs": {"id": "p1"},
            "content": [{"type": "text", "text": "가나다라"}],
        },
        {
            "type": "paragraph",
            "attrs": {"id": "p2"},
            "content": [
                {"type": "text", "text": "😀 한참동안 "},
                {"type": "text", "text": "한참동안"},
            ],
        },
    ],
}


def test_utf16_units_match_js() -> None:
    # JS: "😀".length === 2
    assert u16_len("😀") == 2
    text = paragraph_text(DOC, "p2")
    assert text == "😀 한참동안 한참동안"
    assert u16_slice(text, 3, 7) == "한참동안"
    assert u16_find_all(text, "한참동안") == [3, 8]


def test_locate_keeps_or_relocates_to_nearest() -> None:
    assert locate(DOC, Anchor("p2", 3, 7), "한참동안") == Anchor("p2", 3, 7)
    assert locate(DOC, Anchor("p2", 9, 13), "한참동안") == Anchor("p2", 8, 12)
    assert locate(DOC, Anchor("p2", 0, 2), "없는 글") is None
    assert locate(DOC, Anchor("zz", 0, 2), "가나") is None


def test_replace_merges_paragraph_into_one_text() -> None:
    out = replace(DOC, Anchor("p2", 3, 7), "한참 동안")
    assert paragraph_text(out, "p2") == "😀 한참 동안 한참동안"
    assert out["content"][1]["content"] == [{"type": "text", "text": "😀 한참 동안 한참동안"}]
    assert out["content"][0] == DOC["content"][0]  # 다른 문단은 그대로
    emptied = replace(DOC, Anchor("p1", 0, 4), "")
    assert "content" not in emptied["content"][0]
