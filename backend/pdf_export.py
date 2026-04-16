from __future__ import annotations

from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

PRIMARY = colors.HexColor('#102A43')
BORDER = colors.HexColor('#D9E2EC')
LIGHT = colors.HexColor('#F8FAFC')
WARNING = colors.HexColor('#FFF3E8')


def _format_date(value: str) -> str:
    """
    Format ISO date/datetime string to readable format 'DD MMM YYYY'.
    Falls back to original value if parsing fails.
    """
    if not value or not isinstance(value, str):
        return str(value or '-')
    
    try:
        # Try parsing ISO format (with or without time)
        if 'T' in value:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        else:
            dt = datetime.strptime(value, '%Y-%m-%d')
        return dt.strftime('%d %b %Y')
    except (ValueError, AttributeError):
        return value


def _build_table(rows: list[list[str]], column_widths: list[float]) -> Table:
    table = Table(rows, colWidths=column_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
                ('BACKGROUND', (0, 1), (-1, -1), LIGHT),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def build_compliance_report_pdf(
    school_name: str,
    start_date: str,
    end_date: str,
    attendance_entries: list[dict],
    incidents: list[dict],
    medicine_logs: list[dict],
    general_logs: list[dict],
) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'ComplianceTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=PRIMARY,
        spaceAfter=4,
    )
    section_style = ParagraphStyle(
        'ComplianceSection',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=PRIMARY,
        spaceBefore=8,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        'ComplianceBody',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.black,
    )

    elements = [
        Paragraph('DSD Bana Pele Compliance Report', title_style),
        Paragraph(f'<b>School Name:</b> {school_name}', body_style),
        Paragraph(f'<b>Date Range:</b> {start_date} to {end_date}', body_style),
        Spacer(1, 8),
    ]

    elements.append(Paragraph('Digital Attendance Register', section_style))
    if attendance_entries:
        absent_count = sum(1 for entry in attendance_entries if entry.get('status') == 'Absent')
        late_count = sum(1 for entry in attendance_entries if entry.get('status') == 'Late')
        elements.append(
            Paragraph(
                f'Total entries: {len(attendance_entries)} | Absent: {absent_count} | Late: {late_count}',
                body_style,
            )
        )
        elements.append(Spacer(1, 6))
        attendance_rows = [['Date', 'Learner', 'Status', 'Reason / Note']]
        for entry in attendance_entries:
            attendance_rows.append([
                _format_date(entry.get('date', '-')),
                str(entry.get('studentName') or entry.get('studentId') or 'Learner'),
                str(entry.get('status', 'Present')),
                str(entry.get('reason') or 'None'),
            ])
        elements.append(_build_table(attendance_rows, [28 * mm, 52 * mm, 24 * mm, 70 * mm]))
    else:
        elements.append(Paragraph('No attendance entries were found for the selected date range.', body_style))

    elements.append(Paragraph('Incident / Accident Register', section_style))
    if incidents:
        incident_rows = [['Happened', 'Logged', 'Learner', 'Location', 'Action Taken', 'Witness']]
        for incident in incidents:
            incident_rows.append([
                _format_date(incident.get('occurredAt') or incident.get('timestamp', '-')),
                _format_date(incident.get('createdAt') or incident.get('timestamp', '-')),
                str(incident.get('studentName') or incident.get('studentId') or 'General incident'),
                str(incident.get('location', '-')),
                str(incident.get('actionTaken', '-')),
                str(incident.get('witness', '-')),
            ])
        elements.append(_build_table(incident_rows, [26 * mm, 26 * mm, 34 * mm, 24 * mm, 42 * mm, 24 * mm]))
        elements.append(Spacer(1, 4))
        for incident in incidents:
            elements.append(
                Paragraph(
                    f"<b>Description:</b> {str(incident.get('description', '-'))}",
                    body_style,
                )
            )
    else:
        elements.append(Paragraph('No incident records were found for the selected date range.', body_style))

    elements.append(Paragraph('Medicine Administration Log', section_style))
    if medicine_logs:
        medicine_rows = [['Given', 'Logged', 'Learner', 'Medication', 'Dosage', 'Staff Member', 'Warning']]
        for entry in medicine_logs:
            medicine_rows.append([
                _format_date(entry.get('timeAdministered', '-')),
                _format_date(entry.get('createdAt') or entry.get('timeAdministered', '-')),
                str(entry.get('studentName') or entry.get('studentId') or 'Learner'),
                str(entry.get('medicationName', '-')),
                str(entry.get('dosage', '-')),
                str(entry.get('staffMember', '-')),
                'YES' if entry.get('allergyWarning') else 'No',
            ])
        elements.append(_build_table(medicine_rows, [22 * mm, 22 * mm, 28 * mm, 28 * mm, 16 * mm, 28 * mm, 12 * mm]))
    else:
        elements.append(Paragraph('No medicine logs were found for the selected date range.', body_style))

    elements.append(Paragraph('General Communication Log', section_style))
    if general_logs:
        general_rows = [['Happened', 'Logged', 'Learner', 'Subject', 'Staff Member', 'Note']]
        for entry in general_logs:
            general_rows.append([
                _format_date(entry.get('occurredAt') or entry.get('timestamp', '-')),
                _format_date(entry.get('createdAt') or entry.get('timestamp', '-')),
                str(entry.get('studentName') or entry.get('studentId') or 'Learner'),
                str(entry.get('subject', '-')),
                str(entry.get('staffMember', '-')),
                str(entry.get('note', '-')),
            ])
        elements.append(_build_table(general_rows, [22 * mm, 22 * mm, 28 * mm, 26 * mm, 28 * mm, 42 * mm]))
    else:
        elements.append(Paragraph('No general communication logs were found for the selected date range.', body_style))

    document.build(elements)
    return buffer.getvalue()
