"""역할 권한 표(D-14, D-15). 화면의 web/src/domain/permissions.ts와 같은 이름·같은 값이에요.

서버가 다시 막아요(D-22). 표를 바꾸면 두 파일을 같이 바꾸고, tests/test_permissions.py가 같은지 확인해요.
"""

from typing import Final, Literal, get_args

Role = Literal["editor", "author", "designer"]
Action = Literal[
    "edit_manuscript",
    "apply_ai_suggestion",
    "undo_ai_suggestion",
    "request_review",
    "accept_suggested_edit",
    "reject_suggested_edit",
    "run_chapter_review",
    "send_ai_suggestion",
    "create_suggested_edit",
    "complete_review",
    "save_snapshot",
    "share_role_links",
    "open_editor_home",
    "view_ai_suggestions",
    "dismiss_ai_suggestion",
    "keep_ai_suggestion",
    "change_layout",
    "create_comment",
    "view_snapshots",
    "add_chapter",
]

_AUTHOR: Final = ("author",)
_EDITOR: Final = ("editor",)
_AUTHOR_EDITOR: Final = ("author", "editor")
_EDITOR_DESIGNER: Final = ("editor", "designer")
_ALL: Final = ("editor", "author", "designer")

PERMISSIONS: Final[dict[Action, tuple[Role, ...]]] = {
    "edit_manuscript": _AUTHOR,
    "apply_ai_suggestion": _AUTHOR,
    "undo_ai_suggestion": _AUTHOR,
    "request_review": _AUTHOR,
    "accept_suggested_edit": _AUTHOR,
    "reject_suggested_edit": _AUTHOR,
    "run_chapter_review": _EDITOR,
    "send_ai_suggestion": _EDITOR,
    "create_suggested_edit": _EDITOR,
    "complete_review": _EDITOR,
    "save_snapshot": _EDITOR,
    "share_role_links": _EDITOR,
    "open_editor_home": _EDITOR,
    "view_ai_suggestions": _AUTHOR_EDITOR,
    "dismiss_ai_suggestion": _AUTHOR_EDITOR,
    "keep_ai_suggestion": _AUTHOR_EDITOR,
    "change_layout": _EDITOR_DESIGNER,
    "create_comment": _ALL,
    "view_snapshots": _ALL,
    "add_chapter": _AUTHOR_EDITOR,  # Q-20, A-13
}

ALL_ACTIONS: Final[tuple[Action, ...]] = get_args(Action)


def can(role: str, action: Action) -> bool:
    return role in PERMISSIONS[action]


def actions_for(role: str) -> list[str]:
    """그 역할이 할 수 있는 일(A-05의 can)."""
    return [a for a in ALL_ACTIONS if can(role, a)]
