from __future__ import annotations

import uuid
from typing import Optional

from compliance_store import COMPLIANCE_DATA_DIR, load_json_file, save_json_file, utc_now_iso

GENERAL_LOGS_FILE = COMPLIANCE_DATA_DIR / 'general_logs.json'


def list_general_logs(db=None, school_id: str = None) -> list[dict]:
    """
    List all general communication logs, optionally filtered by school.

    If db (Firestore client) and school_id are provided, reads from Firestore.
    Otherwise falls back to the local JSON file for backwards compatibility.
    """
    if db and school_id:
        try:
            logs_ref = db.collection('schools').document(school_id).collection('general_logs')
            docs = logs_ref.order_by('timestamp', direction='DESCENDING').stream()
            records = [{'id': doc.id, **doc.to_dict()} for doc in docs]
            return records if records else []
        except Exception as e:
            print(f"Error reading general logs from Firestore: {e}")
            return []

    records = load_json_file(GENERAL_LOGS_FILE, [])
    if not isinstance(records, list):
        return []
    return sorted(records, key=lambda item: item.get('createdAt', ''), reverse=True)


def create_general_log_record(payload: dict, student: Optional[dict] = None) -> dict:
    student_id = str(payload.get('studentId') or (student or {}).get('id') or '').strip()
    subject = str(payload.get('subject') or '').strip()
    note = str(payload.get('note') or '').strip()
    staff_member = str(payload.get('staffMember') or '').strip()

    missing = [
        field_name
        for field_name, value in {
            'studentId': student_id,
            'subject': subject,
            'note': note,
            'staffMember': staff_member,
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
    record = {
        'id': f"gen-{uuid.uuid4().hex[:10]}",
        'studentId': student_id,
        'studentName': student_name,
        'subject': subject,
        'note': note,
        'staffMember': staff_member,
        'timestamp': created_at,
        'createdAt': created_at,
    }

    records = list_general_logs()
    records.insert(0, record)
    save_json_file(GENERAL_LOGS_FILE, records)
    return record