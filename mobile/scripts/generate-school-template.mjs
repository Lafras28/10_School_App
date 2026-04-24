/**
 * generate-school-template.mjs
 *
 * Generates a formatted Excel (.xlsx) onboarding template for a new school.
 * Fill it in and hand it back to run: npm run import:school -- --file=<path>
 *
 * Usage:
 *   npm run template:school
 *   npm run template:school -- --out=C:\Users\fritz\Desktop\MySchool.xlsx
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  navy:       { argb: 'FF102A43' },
  teal:       { argb: 'FF0D7377' },
  gold:       { argb: 'FFFFB703' },
  white:      { argb: 'FFFFFFFF' },
  lightBlue:  { argb: 'FFE8F4FD' },
  lightGreen: { argb: 'FFE8F5E9' },
  lightAmber: { argb: 'FFFFF8E1' },
  lightGrey:  { argb: 'FFF5F5F5' },
  red:        { argb: 'FFCC0000' },
  midGrey:    { argb: 'FFB0BEC5' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  let out = '';
  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg.startsWith('--out=')) out = arg.slice('--out='.length);
    if (arg === '--out' && argv[i + 1]) { out = argv[i + 1]; i += 1; }
  }
  return { out };
}

function headerRow(ws, values, fillColor, fontColor = C.white) {
  const row = ws.addRow(values);
  row.eachCell((cell) => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: fillColor };
    cell.font   = { bold: true, color: fontColor, size: 11 };
    cell.border = {
      bottom: { style: 'medium', color: C.navy },
      right:  { style: 'thin',   color: C.midGrey },
    };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 22;
  return row;
}

function titleRow(ws, text, colCount, fillColor = C.navy) {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, colCount);
  const cell = row.getCell(1);
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: fillColor };
  cell.font      = { bold: true, color: C.white, size: 13 };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  row.height = 28;
  return row;
}

function noteRow(ws, text, colCount, fillColor = C.lightGrey) {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, colCount);
  const cell = row.getCell(1);
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: fillColor };
  cell.font      = { italic: true, color: { argb: 'FF546E7A' }, size: 10 };
  cell.alignment = { vertical: 'middle', indent: 1, wrapText: true };
  row.height = 18;
}

function dataRow(ws, values, fillColor) {
  const row = ws.addRow(values);
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col <= values.length) {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: fillColor };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border    = { right: { style: 'thin', color: C.midGrey }, bottom: { style: 'thin', color: C.midGrey } };
    }
  });
  row.height = 18;
  return row;
}

function requiredLabel(ws, rowNum, col) {
  const cell = ws.getCell(rowNum, col);
  cell.font = { ...cell.font, color: C.red, bold: true };
}

// ─── Sheet 1 : School Info ────────────────────────────────────────────────────
function buildSchoolSheet(wb) {
  const ws = wb.addWorksheet('1. School Info', { properties: { tabColor: C.navy } });
  ws.columns = [
    { key: 'field', width: 34 },
    { key: 'value', width: 44 },
    { key: 'notes', width: 52 },
  ];

  titleRow(ws, '  SCHOOL INFORMATION', 3);
  noteRow(ws, '  Fill in Column B (Value). Fields marked * are required.', 3, C.lightBlue);
  ws.addRow([]);

  headerRow(ws, ['Field', 'Value', 'Notes / Example'], C.teal);

  const rows = [
    { field: '* School Name',           value: '', notes: 'Full display name, e.g. Riverside Academy' },
    { field: '* School ID',             value: '', notes: 'Short slug, lowercase, no spaces: riverside  |  st-marys' },
    { field: '* Principal Email',        value: '', notes: 'Must be a valid email. Will be created in Firebase Auth.' },
    { field: '* Principal Display Name', value: '', notes: 'e.g. Mr Johan van der Berg' },
    { field: '  Principal Password',     value: '123456', notes: 'Leave as 123456 or set a custom initial password' },
    { field: '', value: '', notes: '' },
    { field: '  ── Feature Flags ──',    value: '', notes: 'Type YES or NO for each module' },
    { field: '  Students module',        value: 'YES', notes: 'Allow staff to view/edit learner profiles' },
    { field: '  Activities module',      value: 'NO',  notes: 'Lesson activity planning and logs' },
    { field: '  Staff Access module',    value: 'YES', notes: 'Principal can manage staff roles and permissions' },
    { field: '  Compliance module',      value: 'NO',  notes: 'Upload DSD documents and certificates' },
    { field: '  PDF Export module',      value: 'YES', notes: 'Generate attendance / incident PDF reports' },
  ];

  const requiredFields = new Set([0, 1, 2, 3]);
  rows.forEach((r, i) => {
    const row = dataRow(ws, [r.field, r.value, r.notes], i % 2 === 0 ? C.lightGrey : { argb: 'FFFFFFFF' });
    if (requiredFields.has(i)) {
      row.getCell(1).font = { bold: true };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: C.lightAmber };
    }
    if (r.value === 'YES' || r.value === 'NO') {
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: C.lightGreen };
    }
  });

  ws.getColumn('notes').font = { italic: true, color: { argb: 'FF546E7A' }, size: 10 };
  return ws;
}

// ─── Sheet 2 : Staff / Users ──────────────────────────────────────────────────
function buildStaffSheet(wb) {
  const ws = wb.addWorksheet('2. Staff', { properties: { tabColor: C.teal } });
  ws.columns = [
    { key: 'displayName', width: 28 },
    { key: 'email',       width: 32 },
    { key: 'password',    width: 16 },
    { key: 'role',        width: 14 },
    { key: 'className',   width: 22 },
  ];

  titleRow(ws, '  STAFF / USERS', 5);
  noteRow(ws, '  Add one row per staff member. Do NOT include the principal here (add on School Info sheet).', 5, C.lightBlue);
  noteRow(ws, '  Role options: teacher | viewer | parent    |    Class Name must match exactly what is on the Students sheet.', 5, C.lightAmber);
  ws.addRow([]);

  headerRow(ws, ['* Display Name', '* Email', 'Password', '* Role', 'Assigned Class'], C.teal);

  const examples = [
    ['Ms Sunshine',  'teacher1@myschool.com', '123456', 'teacher', 'Sunshine Bunnies'],
    ['Mr Rainbow',   'teacher2@myschool.com', '123456', 'teacher', 'Rainbow Cubs'],
    ['View Only',    'viewer@myschool.com',   '123456', 'viewer',  ''],
  ];
  examples.forEach((r, i) => {
    dataRow(ws, r, i % 2 === 0 ? C.lightGrey : { argb: 'FFFFFFFF' });
  });

  // 10 blank input rows
  for (let i = 0; i < 10; i += 1) {
    dataRow(ws, ['', '', '123456', 'teacher', ''], { argb: 'FFFFFFFF' });
  }
}

// ─── Sheet 3 : Students ───────────────────────────────────────────────────────
function buildStudentsSheet(wb) {
  const ws = wb.addWorksheet('3. Students', { properties: { tabColor: C.gold } });
  ws.columns = [
    { key: 'childId',           width: 18 },
    { key: 'firstName',         width: 18 },
    { key: 'lastName',          width: 18 },
    { key: 'className',         width: 22 },
    { key: 'allergies',         width: 24 },
    { key: 'ec1Name',           width: 24 },
    { key: 'ec1Number',         width: 18 },
    { key: 'ec1Email',          width: 30 },
    { key: 'ec2Name',           width: 24 },
    { key: 'ec2Number',         width: 18 },
    { key: 'ec2Email',          width: 30 },
    { key: 'ec3Name',           width: 24 },
    { key: 'ec3Number',         width: 18 },
    { key: 'ec4Name',           width: 24 },
    { key: 'ec4Number',         width: 18 },
    { key: 'medicalAidName',    width: 20 },
    { key: 'medicalAidPlan',    width: 20 },
    { key: 'medicalAidNumber',  width: 18 },
    { key: 'mainMemberName',    width: 24 },
    { key: 'mainMemberIdNumber', width: 20 },
    { key: 'childDependencyCode', width: 24 },
    { key: 'doctorContact',     width: 22 },
  ];

  titleRow(ws, '  STUDENTS / LEARNERS', 22, C.gold);
  noteRow(ws, '  Add one row per learner. Class Name must match exactly what is written on the Staff sheet.', 22, C.lightBlue);
  noteRow(ws, '  Child ID can be provided for your internal reference. Emergency Contact 1 (name + number) is required. You can add up to 4 emergency contacts per learner. EC1/EC2 email and medical aid fields are optional unless your process requires them.', 22, C.lightAmber);
  ws.addRow([]);

  headerRow(ws, [
    'Child ID', '* First Name', '* Last Name', '* Class Name', 'Allergies',
    '* EC1 Name', '* EC1 Number', 'EC1 Email', 'EC2 Name', 'EC2 Number', 'EC2 Email', 'EC3 Name', 'EC3 Number', 'EC4 Name', 'EC4 Number',
    'Medical Aid Name', 'Medical Aid Plan', 'Medical Aid No.', 'Main Member Name', 'Main Member ID No.', 'Child Dependency Code', 'Doctor Contact',
  ], C.gold, C.navy);

  const examples = [
    ['CH-001', 'Liam',   'Smith',    'Sunshine Bunnies', 'Peanuts',            'Sarah Smith', '+27821234001', 'sarah@example.com', '', '', '', '', '', '', '', 'Discovery', 'Classic Smart', 'D12345', 'Sarah Smith', '8201015009087', '01', 'Dr Patel +27112223333'],
    ['CH-002', 'Emma',   'Johnson',  'Sunshine Bunnies', 'No known allergies', 'Tom Johnson', '+27821234002', '',                  '', '', '', '', '', '', '', '',          '',              '',       '',             '',              '',   ''],
    ['CH-003', 'Sophia', 'Wilson',   'Rainbow Cubs',     'Dairy',              'Mark Wilson', '+27821234006', 'mark@example.com',  'Ann Wilson', '+27821234099', 'ann@example.com', 'Jane Wilson', '+27825551111', 'Luke Wilson', '+27825552222', 'Bonitas', 'BonComprehensive', 'B77891', 'Mark Wilson', '7902125101088', '02', ''],
  ];
  examples.forEach((r, i) => {
    dataRow(ws, r, i % 2 === 0 ? C.lightGrey : { argb: 'FFFFFFFF' });
  });

  // 30 blank input rows
  for (let i = 0; i < 30; i += 1) {
    dataRow(ws, new Array(22).fill(''), { argb: 'FFFFFFFF' });
  }
}

// ─── Sheet 4 : Instructions ───────────────────────────────────────────────────
function buildInstructionsSheet(wb) {
  const ws = wb.addWorksheet('README', { properties: { tabColor: { argb: 'FF607D8B' } } });
  ws.columns = [{ key: 'text', width: 90 }];

  titleRow(ws, '  HOW TO FILL IN THIS TEMPLATE', 1);
  ws.addRow([]);

  const lines = [
    ['STEP 1 — School Info (Sheet 1)', C.navy],
    ['Fill in School Name, School ID, and Principal details.', null],
    ['School ID must be a short slug with no spaces or special characters, e.g. "riverside" or "st-marys".', null],
    ['For each feature (Students, Activities, etc.) type YES or NO in the Value column.', null],
    ['', null],
    ['STEP 2 — Staff (Sheet 2)', C.teal],
    ['Add one row per teacher or staff member. The principal should NOT be listed here.', null],
    ['Role must be exactly one of: teacher | viewer | parent', null],
    ['Assigned Class must match the class name you use in the Students sheet.', null],
    ['If a staff member is not assigned to a class (e.g. viewer), leave the Class column blank.', null],
    ['', null],
    ['STEP 3 — Students (Sheet 3)', { argb: 'FF7A6000' }],
    ['Add one row per learner. Emergency Contact 1 (name + number) is required for every learner.', null],
    ['If there are no known allergies, write: No known allergies', null],
    ['Class Name must match EXACTLY what you wrote on the Staff sheet (same spelling and capitalisation).', null],
    ['', null],
    ['STEP 4 — Return the file', C.navy],
    ['Send the completed Excel file back. We will import it and set up the school in the app.', null],
    ['', null],
    ['TIPS', { argb: 'FF455A64' }],
    ['— Do not rename or delete the sheet tabs.', null],
    ['— Do not change the column headers.', null],
    ['— You can add as many student rows as needed.', null],
    ['— Passwords default to 123456. Staff can change their own password in the app after first login.', null],
  ];

  lines.forEach(([text, color]) => {
    const row = ws.addRow([text]);
    const cell = row.getCell(1);
    cell.alignment = { wrapText: true, vertical: 'middle', indent: 1 };
    row.height = 20;
    if (color) {
      cell.font = { bold: true, color: typeof color === 'string' ? { argb: color } : color, size: 12 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: C.lightGrey };
    } else {
      cell.font = { size: 11, color: { argb: 'FF37474F' } };
    }
  });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
async function main() {
  const { out } = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = out
    ? path.resolve(out)
    : path.resolve(scriptDir, '..', '..', 'SchoolOnboardingTemplate.xlsx');

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'School Safety App';
  wb.created  = new Date();
  wb.modified = new Date();

  buildInstructionsSheet(wb);
  buildSchoolSheet(wb);
  buildStaffSheet(wb);
  buildStudentsSheet(wb);

  await wb.xlsx.writeFile(outPath);
  console.log(`\nTemplate created: ${outPath}`);
  console.log('Fill it in and run: npm run import:school -- --file="<path to file>"');
}

main().catch((err) => {
  console.error('Failed to generate template:', err.message || err);
  process.exitCode = 1;
});
