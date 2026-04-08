from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timezone
import csv
from pathlib import Path
from openpyxl import load_workbook

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent.parent
STUDENTS_XLSX_FILE = BASE_DIR / 'data' / 'students_template.xlsx'
STUDENTS_CSV_FILE = BASE_DIR / 'data' / 'students_template.csv'


def parse_parent_contacts(raw_value):
    value = str(raw_value or '').strip()
    if not value:
        return []

    # Support semicolon, comma, or slash-separated values from spreadsheets.
    separators = [';', ',', '/']
    parts = [value]
    for separator in separators:
        if separator in value:
            parts = [part.strip() for part in value.split(separator)]
            break

    return [part for part in parts if part]


def normalize_student_record(row):
    return {
        'id': str(row.get('id') or '').strip(),
        'firstName': str(row.get('firstName') or '').strip(),
        'lastName': str(row.get('lastName') or '').strip(),
        'parentContact': parse_parent_contacts(row.get('parentContact')),
        'allergies': str(row.get('allergies') or 'None').strip(),
        'medicalAidName': str(row.get('medicalAidName') or '').strip(),
        'medicalAidNumber': str(row.get('medicalAidNumber') or '').strip(),
        'doctorContact': str(row.get('doctorContact') or '').strip(),
        'medicalPin': str(row.get('medicalPin') or '').strip(),
    }


def load_students_from_xlsx():
    if not STUDENTS_XLSX_FILE.exists():
        return []

    workbook = load_workbook(STUDENTS_XLSX_FILE, data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [str(header).strip() if header is not None else '' for header in rows[0]]
    students = []

    for values in rows[1:]:
        row = {headers[index]: values[index] if index < len(values) else '' for index in range(len(headers))}
        student = normalize_student_record(row)

        if student['id'] or student['firstName'] or student['lastName']:
            students.append(student)

    return students


def load_students_from_csv():
    if not STUDENTS_CSV_FILE.exists():
        return []

    students = []
    with STUDENTS_CSV_FILE.open(mode='r', encoding='utf-8', newline='') as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            students.append(normalize_student_record(row))

    return students


def load_students():
    students_from_xlsx = load_students_from_xlsx()
    if students_from_xlsx:
        return students_from_xlsx

    return load_students_from_csv()


@app.get('/health')
def health_check():
    return jsonify({
        'status': 'ok',
        'service': 'school-safety-api',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }), 200


@app.post('/incident')
def create_incident():
    """
    Temporary endpoint that validates and accepts incident payloads.
    In production, this should write to Firestore via the Firebase Admin SDK.
    """
    payload = request.get_json(silent=True) or {}

    required_fields = ['schoolId', 'reportedBy', 'incidentType', 'description']
    missing = [field for field in required_fields if not payload.get(field)]

    if missing:
        return jsonify({
            'error': 'Missing required fields.',
            'missingFields': missing,
        }), 400

    response = {
        'message': 'Incident received.',
        'incident': {
            'schoolId': payload['schoolId'],
            'reportedBy': payload['reportedBy'],
            'incidentType': payload['incidentType'],
            'description': payload['description'],
            'childId': payload.get('childId'),
            'severity': payload.get('severity', 'unspecified'),
            'createdAt': datetime.now(timezone.utc).isoformat(),
        },
    }

    return jsonify(response), 201


@app.get('/students')
def list_students():
    return jsonify(load_students()), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
