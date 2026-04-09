from __future__ import annotations

import re
import uuid
from typing import Optional

from compliance_store import COMPLIANCE_DATA_DIR, load_json_file, save_json_file, utc_now_iso

MEDICINE_LOGS_FILE = COMPLIANCE_DATA_DIR / 'medicine_logs.json'


def list_medicine_logs() -> list[dict]:
    records = load_json_file(MEDICINE_LOGS_FILE, [])
    if not isinstance(records, list):
        return []

    return sorted(records, key=lambda item: item.get('createdAt', ''), reverse=True)


def has_allergy_warning(medication_name: str, allergies: str) -> bool:
    medication = str(medication_name or '').strip().lower()
    allergy_text = str(allergies or '').strip().lower()

    if not medication or not allergy_text or allergy_text in {'none', 'no known allergies'}:
        return False

    ignored_tokens = {'allergy', 'allergies', 'intolerance', 'required', 'inhaler', 'no', 'known'}
    allergy_tokens = {
        token
        for token in re.findall(r'[a-z0-9]+', allergy_text)
        if len(token) >= 3 and token not in ignored_tokens
    }

    return medication in allergy_text or any(token in medication for token in allergy_tokens)


def create_medicine_record(payload: dict, student: Optional[dict] = None) -> dict:
    student_id = str(payload.get('studentId') or (student or {}).get('id') or '').strip()
    medication_name = str(payload.get('medicationName') or '').strip()
    dosage = str(payload.get('dosage') or '').strip()
    staff_member = str(payload.get('staffMember') or '').strip()

    missing = [
        field_name
        for field_name, value in {
            'studentId': student_id,
            'medicationName': medication_name,
            'dosage': dosage,
            'staffMember': staff_member,
        }.items()
        if not value
    ]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    student_name = ''
    allergies = str(payload.get('allergies') or 'None').strip()
    if student:
        first_name = str(student.get('firstName') or '').strip()
        last_name = str(student.get('lastName') or '').strip()
        student_name = f'{first_name} {last_name}'.strip()
        allergies = str(student.get('allergies') or allergies).strip()

    created_at = utc_now_iso()
    allergy_warning = has_allergy_warning(medication_name, allergies)
    record = {
        'id': f"med-{uuid.uuid4().hex[:10]}",
        'studentId': student_id,
        'studentName': student_name,
        'medicationName': medication_name,
        'dosage': dosage,
        'staffMember': staff_member,
        'allergies': allergies,
        'allergyWarning': allergy_warning,
        'timeAdministered': created_at,
        'createdAt': created_at,
    }

    records = list_medicine_logs()
    records.insert(0, record)
    save_json_file(MEDICINE_LOGS_FILE, records)
    return record
