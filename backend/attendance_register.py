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

    register_entries: list[dict] = []

    for student in students:
        student_id = str(student.get('id') or '').strip()
        if not student_id:
            continue

        stored_entry = day_records.get(student_id)
        if isinstance(stored_entry, dict):
            entry = deepcopy(stored_entry)
            entry.setdefault('date', register_date)
            entry.setdefault('studentId', student_id)
            entry.setdefault('studentName', _student_name(student))
            entry['className'] = str(student.get('className') or entry.get('className') or '').strip()
            normalized_status = str(entry.get('status') or 'Present').strip().title()
            entry['status'] = normalized_status if normalized_status in VALID_ATTENDANCE_STATUSES else 'Present'
            entry['reason'] = str(entry.get('reason') or '').strip() if entry['status'] in {'Absent', 'Late'} else ''
            entry.setdefault('createdAt', utc_now_iso())
        else:
            entry = _default_entry(register_date, student)

        register_entries.append(entry)

    return sorted(register_entries, key=lambda item: item.get('studentName', ''))


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

    if normalized_status == 'Present':
        day_records.pop(student_id, None)
        if day_records:
            store[register_date] = day_records
        else:
            store.pop(register_date, None)
        _save_store(store)

        entry = _default_entry(register_date, student)
        entry['updatedAt'] = utc_now_iso()
        return entry

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
