from __future__ import annotations

from datetime import datetime, timezone
import uuid
from typing import Optional

from compliance_store import COMPLIANCE_DATA_DIR, load_json_file, save_json_file, utc_now_iso

BOTTLE_LOGS_FILE = COMPLIANCE_DATA_DIR / 'bottle_logs.json'


def list_bottle_logs(db=None, school_id: str = None) -> list[dict]:
    if db and school_id:
        try:
            logs_ref = db.collection('schools').document(school_id).collection('bottle_logs')
            docs = logs_ref.order_by('timeGiven', direction='DESCENDING').stream()
            records = [{'id': doc.id, **doc.to_dict()} for doc in docs]
            return records if records else []
        except Exception as e:
            print(f"Error reading bottle logs from Firestore: {e}")
            return []

    records = load_json_file(BOTTLE_LOGS_FILE, [])
    if not isinstance(records, list):
        return []
    return sorted(records, key=lambda item: item.get('createdAt', ''), reverse=True)


def create_bottle_log_record(payload: dict, student: Optional[dict] = None) -> dict:
    student_id = str(payload.get('studentId') or (student or {}).get('id') or '').strip()
    amount = str(payload.get('amount') or '').strip()
    comments = str(payload.get('comments') or payload.get('note') or '').strip()

    missing = [
        field_name
        for field_name, value in {
            'studentId': student_id,
            'amount': amount,
        }.items()
        if not value
    ]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    student_name = ''
    if student:
        first_name = str(student.get('firstName') or '').strip()
        last_name = str(student.get('lastName') or '').strip()
        student_name = f'{first_name} {last_name}'.strip()

    created_at = utc_now_iso()
    raw_time_given = str(payload.get('timeGiven') or payload.get('occurredAt') or '').strip()
    if raw_time_given:
        try:
            parsed_time_given = datetime.fromisoformat(raw_time_given.replace('Z', '+00:00'))
        except ValueError as exc:
            raise ValueError('timeGiven must be a valid bottle date and time.') from exc
        if parsed_time_given.tzinfo is None:
            parsed_time_given = parsed_time_given.replace(tzinfo=timezone.utc)
        time_given = parsed_time_given.astimezone(timezone.utc).isoformat()
    else:
        time_given = created_at

    record = {
        'id': f"bot-{uuid.uuid4().hex[:10]}",
        'studentId': student_id,
        'studentName': student_name,
        'amount': amount,
        'comments': comments,
        'timeGiven': time_given,
        'createdAt': created_at,
    }

    records = list_bottle_logs()
    records.insert(0, record)
    save_json_file(BOTTLE_LOGS_FILE, records)
    return record