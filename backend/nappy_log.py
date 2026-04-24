from __future__ import annotations

from datetime import datetime, timezone
import uuid
from typing import Optional

from compliance_store import COMPLIANCE_DATA_DIR, load_json_file, save_json_file, utc_now_iso

NAPPY_LOGS_FILE = COMPLIANCE_DATA_DIR / 'nappy_logs.json'


def list_nappy_logs(db=None, school_id: str = None) -> list[dict]:
    if db and school_id:
        try:
            logs_ref = db.collection('schools').document(school_id).collection('nappy_logs')
            docs = logs_ref.order_by('timeLogged', direction='DESCENDING').stream()
            records = [{'id': doc.id, **doc.to_dict()} for doc in docs]
            return records if records else []
        except Exception as e:
            print(f"Error reading nappy logs from Firestore: {e}")
            return []

    records = load_json_file(NAPPY_LOGS_FILE, [])
    if not isinstance(records, list):
        return []
    return sorted(records, key=lambda item: item.get('createdAt', ''), reverse=True)


def create_nappy_log_record(payload: dict, student: Optional[dict] = None) -> dict:
    student_id = str(payload.get('studentId') or (student or {}).get('id') or '').strip()
    raw_type = str(payload.get('nappyType') or payload.get('type') or '').strip().lower()
    nappy_type = 'Dirty' if raw_type == 'dirty' else 'Wee' if raw_type == 'wee' else ''
    comments = str(payload.get('comments') or payload.get('note') or '').strip()

    missing = [
        field_name
        for field_name, value in {
            'studentId': student_id,
            'nappyType': nappy_type,
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
    raw_time_logged = str(payload.get('timeLogged') or payload.get('occurredAt') or '').strip()
    if raw_time_logged:
        try:
            parsed_time_logged = datetime.fromisoformat(raw_time_logged.replace('Z', '+00:00'))
        except ValueError as exc:
            raise ValueError('timeLogged must be a valid nappy date and time.') from exc
        if parsed_time_logged.tzinfo is None:
            parsed_time_logged = parsed_time_logged.replace(tzinfo=timezone.utc)
        time_logged = parsed_time_logged.astimezone(timezone.utc).isoformat()
    else:
        time_logged = created_at

    record = {
        'id': f"nap-{uuid.uuid4().hex[:10]}",
        'studentId': student_id,
        'studentName': student_name,
        'nappyType': nappy_type,
        'comments': comments,
        'timeLogged': time_logged,
        'createdAt': created_at,
    }

    records = list_nappy_logs()
    records.insert(0, record)
    save_json_file(NAPPY_LOGS_FILE, records)
    return record