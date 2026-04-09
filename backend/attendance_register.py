from __future__ import annotations

from copy import deepcopy
from typing import Iterable

from compliance_store import COMPLIANCE_DATA_DIR, load_json_file, save_json_file, utc_now_iso

ATTENDANCE_FILE = COMPLIANCE_DATA_DIR / 'attendance.json'
VALID_ATTENDANCE_STATUSES = {'Present', 'Absent', 'Late'}


def _student_name(student: dict) -> str:
    first_name = str(student.get('firstName') or '').strip()
    last_name = str(student.get('lastName') or '').strip()
    return f'{first_name} {last_name}'.strip() or str(student.get('id') or 'Unknown Student')


def _default_entry(register_date: str, student: dict) -> dict:
    return {
        'date': register_date,
        'studentId': str(student.get('id') or '').strip(),
        'studentName': _student_name(student),
        'className': str(student.get('className') or '').strip(),
        'status': 'Present',
        'reason': '',
        'createdAt': utc_now_iso(),
    }


def _load_store() -> dict:
    store = load_json_file(ATTENDANCE_FILE, {})
    return store if isinstance(store, dict) else {}


def _save_store(store: dict) -> None:
    save_json_file(ATTENDANCE_FILE, store)


def get_daily_register(register_date: str, students: Iterable[dict]) -> list[dict]:
    store = _load_store()
    day_records = store.get(register_date, {})
    if not isinstance(day_records, dict):
        day_records = {}

    changed = False
    for student in students:
        student_id = str(student.get('id') or '').strip()
        if not student_id:
            continue

        if student_id not in day_records or not isinstance(day_records.get(student_id), dict):
            day_records[student_id] = _default_entry(register_date, student)
            changed = True
            continue

        entry = day_records[student_id]
        entry.setdefault('date', register_date)
        entry.setdefault('studentId', student_id)
        entry.setdefault('studentName', _student_name(student))
        classroom_name = str(student.get('className') or entry.get('className') or '').strip()
        if entry.get('className') != classroom_name:
            entry['className'] = classroom_name
            changed = True
        entry.setdefault('status', 'Present')
        entry.setdefault('reason', '')
        entry.setdefault('createdAt', utc_now_iso())

    store[register_date] = day_records
    if changed:
        _save_store(store)

    return sorted(day_records.values(), key=lambda item: item.get('studentName', ''))


def update_attendance_entry(register_date: str, student: dict, status: str, reason: str = '') -> dict:
    normalized_status = str(status or '').strip().title()
    if normalized_status not in VALID_ATTENDANCE_STATUSES:
        raise ValueError('Status must be Present, Absent, or Late.')

    cleaned_reason = str(reason or '').strip()

    store = _load_store()
    day_records = store.get(register_date, {})
    if not isinstance(day_records, dict):
        day_records = {}

    student_id = str(student.get('id') or '').strip()
    if not student_id:
        raise ValueError('Student id is required for attendance updates.')

    entry = deepcopy(day_records.get(student_id) or _default_entry(register_date, student))
    entry['status'] = normalized_status
    entry['className'] = str(student.get('className') or entry.get('className') or '').strip()
    entry['reason'] = cleaned_reason if normalized_status in {'Absent', 'Late'} else ''
    entry.setdefault('createdAt', utc_now_iso())
    entry['updatedAt'] = utc_now_iso()

    day_records[student_id] = entry
    store[register_date] = day_records
    _save_store(store)
    return entry


def list_attendance_entries_for_range(start_date: str, end_date: str, students: Iterable[dict]) -> list[dict]:
    store = _load_store()

    if start_date == end_date and start_date not in store:
        get_daily_register(start_date, students)
        store = _load_store()

    entries: list[dict] = []
    for register_date, day_records in store.items():
        if not isinstance(day_records, dict):
            continue
        if start_date <= register_date <= end_date:
            entries.extend(day_records.values())

    return sorted(entries, key=lambda item: (item.get('date', ''), item.get('studentName', '')))
