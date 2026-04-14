from __future__ import annotations

import uuid
from typing import Optional

from compliance_store import COMPLIANCE_DATA_DIR, load_json_file, save_json_file, utc_now_iso

INCIDENTS_FILE = COMPLIANCE_DATA_DIR / 'incidents.json'


def list_incidents(db=None, school_id: str = None) -> list[dict]:
    """
    List all incidents, optionally filtered by school.
    
    If db (Firestore client) and school_id are provided, reads from Firestore.
    Otherwise falls back to local JSON file for backwards compatibility.
    """
    if db and school_id:
        try:
            # Read from Firestore school-scoped collection
            incidents_ref = db.collection('schools').document(school_id).collection('incidents')
            docs = incidents_ref.order_by('timestamp', direction='DESCENDING').stream()
            records = [{'id': doc.id, **doc.to_dict()} for doc in docs]
            return records if records else []
        except Exception as e:
            print(f"Error reading incidents from Firestore: {e}")
            return []
    else:
        # Fallback to local JSON file
        records = load_json_file(INCIDENTS_FILE, [])
        if not isinstance(records, list):
            return []
        return sorted(records, key=lambda item: item.get('createdAt', ''), reverse=True)


def create_incident_record(payload: dict, student: Optional[dict] = None) -> dict:
    location = str(payload.get('location') or '').strip()
    description = str(payload.get('description') or '').strip()
    action_taken = str(payload.get('actionTaken') or '').strip()
    witness = str(payload.get('witness') or '').strip()

    missing = [
        field_name
        for field_name, value in {
            'location': location,
            'description': description,
            'actionTaken': action_taken,
            'witness': witness,
        }.items()
        if not value
    ]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    student_id = str(payload.get('studentId') or (student or {}).get('id') or '').strip()
    student_name = ''
    if student:
        first_name = str(student.get('firstName') or '').strip()
        last_name = str(student.get('lastName') or '').strip()
        student_name = f'{first_name} {last_name}'.strip()

    created_at = utc_now_iso()
    record = {
        'id': f"inc-{uuid.uuid4().hex[:10]}",
        'studentId': student_id,
        'studentName': student_name,
        'timestamp': created_at,
        'location': location,
        'description': description,
        'actionTaken': action_taken,
        'witness': witness,
        'createdAt': created_at,
        'readOnly': True,
    }

    records = list_incidents()
    records.insert(0, record)
    save_json_file(INCIDENTS_FILE, records)
    return record
