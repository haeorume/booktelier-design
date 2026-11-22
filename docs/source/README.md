# docs/source/

구글 시트 세 개를 .xlsx로 내려받아 이 폴더에 넣어요. 파일 이름이 문서 폴더 이름이 돼요.

| 시트 | 저장할 파일 이름 |
| --- | --- |
| [요구사항 정의서](https://docs.google.com/spreadsheets/d/1UOQLNPNgKTWjcNXtr5qc3z2a28FaMaNSo1EIjFBpXqU) | `requirements.xlsx` |
| [개발 문서](https://docs.google.com/spreadsheets/d/1QKioN32slvjctnkNTbQsO1GYTpYi5BB_qnBbifjhD6k) | `dev.xlsx` |
| [UX 설계서](https://docs.google.com/spreadsheets/d/1SXDiRolcVkRwV0mcVEU54Q5xR-pwEK0LFid4ivxtBnU) | `ux.xlsx` |

이름을 이대로 맞춰야 지도가 가리키는 폴더(`docs/sheets/requirements/`, `dev/`, `ux/`)와 맞아요. 폴더·파일 이름은 영어로 만들어져요.

내려받는 법: 시트를 열고 **파일 → 다운로드 → Microsoft Excel(.xlsx)**.

그다음 저장소 맨 위 폴더에서:

```bash
python scripts/sheets_to_md.py      # Windows는 py scripts/sheets_to_md.py
```

`docs/sheets/` 아래에 탭마다 .md가 생기고, 예시 JSON은 `docs/sheets/dev/json/`에 따로 꺼내져요.
.xlsx는 저장소에 올리지 않고(.gitignore), 만들어진 `docs/sheets/`만 올려요.
시트를 고친 뒤에는 다시 내려받아 스크립트를 다시 돌려요.
