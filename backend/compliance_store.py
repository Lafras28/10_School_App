from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
COMPLIANCE_DATA_DIR = BASE_DIR / 'data' / 'compliance'


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_data_dir() -> None:
    COMPLIANCE_DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_json_file(file_path: Path, default: Any) -> Any:
    ensure_data_dir()

    if not file_path.exists():
        return deepcopy(default)

    try:
        with file_path.open('r', encoding='utf-8') as handle:
            return json.load(handle)
    except (json.JSONDecodeError, OSError):
        return deepcopy(default)


def save_json_file(file_path: Path, payload: Any) -> None:
    ensure_data_dir()

    with file_path.open('w', encoding='utf-8') as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
