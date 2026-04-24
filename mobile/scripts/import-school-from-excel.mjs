/**
 * import-school-from-excel.mjs
 *
 * Reads a completed SchoolOnboardingTemplate.xlsx and seeds the school
 * into Firestore + Firebase Auth using the Admin SDK.
 *
 * Usage:
 *   $env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\path\to\serviceAccountKey.json"
 *   npm run import:school -- --file="C:\path\to\FilledTemplate.xlsx"
 *   npm run import:school -- --file="C:\path\to\FilledTemplate.xlsx" --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ExcelJS from 'exceljs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─── Constants ────────────────────────────────────────────────────────────────
const SCHOOLS_COL   = 'schools';
const USERS_COL     = 'users';

const PRINCIPAL_PERMISSIONS = {
  canEditStudents: true, canEditOwnChildMedicalInfo: true,
  canTakeAttendance: true, canLogIncidents: true,
  canLogMedicine: true, canExportReports: true, canManageUsers: true,
};
const TEACHER_PERMISSIONS = {
  canEditStudents: false, canEditOwnChildMedicalInfo: false,
  canTakeAttendance: true, canLogIncidents: true,
  canLogMedicine: true, canExportReports: false, canManageUsers: false,
};
const VIEWER_PERMISSIONS = {
  canEditStudents: false, canEditOwnChildMedicalInfo: false,
  canTakeAttendance: false, canLogIncidents: false,
  canLogMedicine: false, canExportReports: false, canManageUsers: false,
};
const PARENT_PERMISSIONS = {
  canEditStudents: false, canEditOwnChildMedicalInfo: true,
  canTakeAttendance: false, canLogIncidents: false,
  canLogMedicine: false, canExportReports: false, canManageUsers: false,
};
const ROLE_PERMISSIONS = {
  principal: PRINCIPAL_PERMISSIONS,
  teacher:   TEACHER_PERMISSIONS,
  viewer:    VIEWER_PERMISSIONS,
  parent:    PARENT_PERMISSIONS,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadCredential() {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) return cert(JSON.parse(jsonRaw));
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) return cert(JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8')));
  return applicationDefault();
}

function parseArgs(argv) {
  let file = '', dryRun = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = String(argv[i] || '').trim();
    if (a === '--dry-run') { dryRun = true; continue; }
    if (a.startsWith('--file=')) { file = a.slice('--file='.length); continue; }
    if (a === '--file' && argv[i + 1]) { file = argv[i + 1]; i += 1; }
  }
  return { file, dryRun };
}

function cellStr(row, col) {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (typeof v.text === 'string') return String(v.text).trim();
    if (Array.isArray(v.richText)) {
      return v.richText.map((part) => String(part?.text || '')).join('').trim();
    }
    if (v.result !== undefined && v.result !== null) return String(v.result).trim();
  }
  return String(v).trim();
}

function yesNo(val) {
  return String(val || '').trim().toUpperCase() !== 'NO';
}

function normalizeHeader(val) {
  return String(val || '')
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function normalizePhoneNumber(raw) {
  const original = String(raw || '').trim();
  if (!original) return '';

  // Keep only numeric content (and a leading + intent) for robust spreadsheet input cleanup.
  const startsWithPlus = original.startsWith('+');
  let digits = original.replace(/\D/g, '');
  if (!digits) return '';

  // 00 prefix is often used instead of + in international format.
  if (original.startsWith('00') && digits.startsWith('00')) {
    digits = digits.slice(2);
    return `+${digits}`;
  }

  if (startsWithPlus) return `+${digits}`;

  // South African-friendly normalization.
  if (digits.startsWith('27') && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`;
  if (digits.length === 9) return `+27${digits}`;

  // Fallback: keep cleaned local digits if pattern is unknown.
  return digits;
}

function normalizeId(val, fallback = 'school') {
  const slug = String(val || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug || fallback;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildParentDisplayName(name, email) {
  const normalizedName = String(name || '').trim();
  if (normalizedName) return normalizedName;

  const emailText = normalizeEmail(email);
  const localPart = emailText.split('@')[0] || 'Parent';
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Parent';
}

function padNum(n) { return String(n).padStart(3, '0'); }

async function upsertAuthUser(auth, email, password, displayName, dryRun) {
  if (dryRun) {
    console.log(`  [DRY] auth user: ${email}`);
    return `dry-${email.replace(/[^a-z0-9]/gi, '-')}`;
  }
  try {
    const u = await auth.getUserByEmail(email);
    await auth.updateUser(u.uid, { password, displayName });
    console.log(`  Updated auth: ${email}`);
    return u.uid;
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      const u = await auth.createUser({ email, password, displayName });
      console.log(`  Created auth: ${email}`);
      return u.uid;
    }
    throw err;
  }
}

async function batchWrite(db, writes, dryRun) {
  if (dryRun) {
    console.log(`  [DRY] Would write ${writes.length} documents`);
    return;
  }
  let batch = db.batch();
  let ops = 0;
  for (const { ref, data } of writes) {
    batch.set(ref, data, { merge: true });
    ops += 1;
    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  console.log(`  Wrote ${writes.length} Firestore documents`);
}

// ─── Sheet Readers ────────────────────────────────────────────────────────────
function readSchoolInfo(wb) {
  const ws = wb.getWorksheet('1. School Info');
  if (!ws) throw new Error('Sheet "1. School Info" not found. Did you use the correct template?');

  // Data rows start at row 6 (after title, note, blank, header)
  const fields = {};
  ws.eachRow((row, rowNum) => {
    if (rowNum < 5) return;
    const field = cellStr(row, 1);
    const value = cellStr(row, 2);
    if (!field) return;
    const key = field.replace(/^\*?\s*/, '').replace(/\s+/g, ' ').trim();
    fields[key] = value;
  });

  const name       = fields['School Name']       || '';
  const id         = normalizeId(fields['School ID'] || name);
  const principal  = {
    email:       fields['Principal Email']        || '',
    displayName: fields['Principal Display Name'] || '',
    password:    fields['Principal Password']     || '123456',
  };
  const features = {
    students:    yesNo(fields['Students module']),
    activities:  yesNo(fields['Activities module']),
    staffAccess: yesNo(fields['Staff Access module']),
    compliance:  yesNo(fields['Compliance module']),
    pdfExport:   yesNo(fields['PDF Export module']),
  };

  if (!name)               throw new Error('School Name is required on sheet "1. School Info".');
  if (!id)                 throw new Error('School ID is required on sheet "1. School Info".');
  if (!principal.email)    throw new Error('Principal Email is required on sheet "1. School Info".');
  if (!principal.displayName) throw new Error('Principal Display Name is required on sheet "1. School Info".');

  return { id, name, features, principal };
}

function readStaff(wb) {
  const ws = wb.getWorksheet('2. Staff');
  if (!ws) throw new Error('Sheet "2. Staff" not found.');

  const staff = [];
  // Header is row 5; data from row 6
  ws.eachRow((row, rowNum) => {
    if (rowNum < 6) return;
    const displayName = cellStr(row, 1);
    const email       = cellStr(row, 2);
    const password    = cellStr(row, 3) || '123456';
    const role        = cellStr(row, 4).toLowerCase() || 'teacher';
    const className   = cellStr(row, 5);
    if (!displayName && !email) return; // skip blank rows
    if (!email) { console.warn(`  Skipping staff row ${rowNum}: missing email`); return; }
    staff.push({ displayName, email, password, role, className });
  });

  return staff;
}

function readStudents(wb) {
  const ws = wb.getWorksheet('3. Students');
  if (!ws) throw new Error('Sheet "3. Students" not found.');

  const students = [];
  // Header is row 5; data from row 6
  const headerRow = ws.getRow(5);
  const headerMap = new Map();
  headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    const normalized = normalizeHeader(cell.value);
    if (normalized) headerMap.set(normalized, colNum);
  });

  const valueByHeader = (row, ...keys) => {
    for (const key of keys) {
      const col = headerMap.get(normalizeHeader(key));
      if (!col) continue;
      const value = cellStr(row, col);
      if (value) return value;
    }
    return '';
  };

  ws.eachRow((row, rowNum) => {
    if (rowNum < 6) return;
    const childId    = valueByHeader(row, 'Child ID', 'ID', 'Student ID');
    const firstName  = valueByHeader(row, '* First Name', 'First Name');
    const lastName   = valueByHeader(row, '* Last Name', 'Last Name');
    const className  = valueByHeader(row, '* Class Name', 'Class Name');
    if (!firstName && !lastName) return;
    if (!firstName || !lastName) { console.warn(`  Skipping student row ${rowNum}: missing name`); return; }

    const allergies           = valueByHeader(row, 'Allergies') || 'No known allergies';
    const ec1Name             = valueByHeader(row, '* EC1 Name', 'EC1 Name');
    const ec1Number           = normalizePhoneNumber(valueByHeader(row, '* EC1 Number', 'EC1 Number'));
    const ec1Email            = valueByHeader(row, 'EC1 Email');
    const ec2Name             = valueByHeader(row, 'EC2 Name');
    const ec2Number           = normalizePhoneNumber(valueByHeader(row, 'EC2 Number'));
    const ec2Email            = valueByHeader(row, 'EC2 Email', 'EM2 Email');
    const ec3Name             = valueByHeader(row, 'EC3 Name');
    const ec3Number           = normalizePhoneNumber(valueByHeader(row, 'EC3 Number'));
    const ec4Name             = valueByHeader(row, 'EC4 Name');
    const ec4Number           = normalizePhoneNumber(valueByHeader(row, 'EC4 Number'));
    const medicalAidName      = valueByHeader(row, 'Medical Aid Name');
    const medicalAidPlan      = valueByHeader(row, 'Medical Aid Plan');
    const medicalAidNumber    = valueByHeader(row, 'Medical Aid No.', 'Medical Aid No', 'Medical Aid Number');
    const mainMemberName      = valueByHeader(row, 'Main Member Name');
    const mainMemberIdNumber  = valueByHeader(row, 'Main Member ID No.', 'Main Member ID Number');
    const childDependencyCode = valueByHeader(row, 'Child Dependency Code');
    const doctorContact       = valueByHeader(row, 'Doctor Contact');

    if (!ec1Name || !ec1Number) {
      console.warn(`  Warning: student ${firstName} ${lastName} is missing Emergency Contact 1 — added with placeholder.`);
    }

    const emergencyContacts = [];
    if (ec1Name || ec1Number || ec1Email) {
      emergencyContacts.push({ name: ec1Name || 'Contact 1', number: ec1Number || '', email: ec1Email || '' });
    }
    if (ec2Name || ec2Number || ec2Email) emergencyContacts.push({ name: ec2Name || 'Contact 2', number: ec2Number || '', email: ec2Email || '' });
    if (ec3Name || ec3Number) emergencyContacts.push({ name: ec3Name || 'Contact 3', number: ec3Number || '' });
    if (ec4Name || ec4Number) emergencyContacts.push({ name: ec4Name || 'Contact 4', number: ec4Number || '' });

    students.push({
      childId,
      firstName,
      lastName,
      className,
      allergies,
      ec1Email,
      ec2Email,
      emergencyContacts,
      medicalAidName,
      medicalAidPlan,
      medicalAidNumber,
      mainMemberName,
      mainMemberIdNumber,
      childDependencyCode,
      doctorContact,
    });
  });

  return students;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { file, dryRun } = parseArgs(process.argv);
  if (!file) {
    console.error('Error: --file argument is required.');
    console.error('Usage: npm run import:school -- --file="C:\\path\\to\\FilledTemplate.xlsx"');
    process.exitCode = 1;
    return;
  }

  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== import-school-from-excel.mjs (${dryRun ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`Reading: ${filePath}\n`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const schoolInfo = readSchoolInfo(wb);
  const staff      = readStaff(wb);
  const students   = readStudents(wb);

  console.log(`School:   ${schoolInfo.name} (${schoolInfo.id})`);
  console.log(`Principal: ${schoolInfo.principal.email}`);
  console.log(`Staff:    ${staff.length} members`);
  console.log(`Students: ${students.length} learners`);
  console.log(`Features: ${Object.entries(schoolInfo.features).filter(([,v])=>v).map(([k])=>k).join(', ')}`);
  console.log('');

  initializeApp({ credential: loadCredential() });
  const db   = getFirestore();
  const auth = getAuth();

  const writes = [];
  const parentLinksByEmail = new Map();

  // School doc
  const schoolRef = db.collection(SCHOOLS_COL).doc(schoolInfo.id);
  writes.push({
    ref: schoolRef,
    data: {
      id: schoolInfo.id,
      name: schoolInfo.name,
      features: schoolInfo.features,
      principalUserUid: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  // Principal
  const principalUid = await upsertAuthUser(
    auth,
    schoolInfo.principal.email,
    schoolInfo.principal.password,
    schoolInfo.principal.displayName,
    dryRun,
  );
  writes.push({
    ref: db.collection(USERS_COL).doc(principalUid),
    data: {
      uid: principalUid,
      email: schoolInfo.principal.email,
      displayName: schoolInfo.principal.displayName,
      schoolId: schoolInfo.id,
      schoolFeatures: schoolInfo.features,
      role: 'principal',
      permissions: PRINCIPAL_PERMISSIONS,
      linkedStudentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
  writes.push({
    ref: schoolRef,
    data: { principalUserUid: principalUid, updatedAt: new Date().toISOString() },
  });

  // Staff
  for (const member of staff) {
    const uid = await upsertAuthUser(auth, member.email, member.password, member.displayName, dryRun);
    const normalizedRole = String(member.role || '').trim().toLowerCase();
    const roleAliases = {
      admin: 'principal',
      administrator: 'principal',
      principal: 'principal',
    };
    const role = roleAliases[normalizedRole] || (['teacher', 'viewer', 'parent'].includes(normalizedRole) ? normalizedRole : 'teacher');
    writes.push({
      ref: db.collection(USERS_COL).doc(uid),
      data: {
        uid,
        email: member.email,
        displayName: member.displayName,
        schoolId: schoolInfo.id,
        schoolFeatures: schoolInfo.features,
        role,
        permissions: ROLE_PERMISSIONS[role] || TEACHER_PERMISSIONS,
        linkedStudentIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  }

  // Students
  const usedStudentIds = new Set();
  students.forEach((student, idx) => {
    const normalizedProvidedId = normalizeId(student.childId || '', '');
    let sid = normalizedProvidedId
      ? `${schoolInfo.id}-st-${normalizedProvidedId}`
      : `${schoolInfo.id}-st-${padNum(idx + 1)}`;

    if (usedStudentIds.has(sid)) {
      const fallbackSid = `${schoolInfo.id}-st-${padNum(idx + 1)}`;
      console.warn(`  Warning: duplicate Child ID "${student.childId}". Using generated ID ${fallbackSid} instead.`);
      sid = fallbackSid;
    }
    usedStudentIds.add(sid);

    writes.push({
      ref: db.collection(SCHOOLS_COL).doc(schoolInfo.id).collection('students').doc(sid),
      data: {
        schoolId: schoolInfo.id,
        id: sid,
        childId: student.childId,
        firstName:        student.firstName,
        lastName:         student.lastName,
        className:        student.className,
        ec1Email:         String(student.ec1Email || '').trim(),
        ec2Email:         String(student.ec2Email || '').trim(),
        emergencyContacts: student.emergencyContacts,
        allergies:        student.allergies,
        medicalAidName:   student.medicalAidName,
        medicalAidPlan:   student.medicalAidPlan,
        medicalAidNumber: student.medicalAidNumber,
        mainMemberName:   student.mainMemberName,
        mainMemberIdNumber: student.mainMemberIdNumber,
        childDependencyCode: student.childDependencyCode,
        doctorContact:    student.doctorContact,
      },
    });

    const pushParentLink = (contact = {}, fallbackName = 'Parent') => {
      const email = normalizeEmail(contact?.email || '');
      if (!email) return;

      const current = parentLinksByEmail.get(email) || {
        displayName: buildParentDisplayName(contact?.name, email) || fallbackName,
        linkedStudentIds: new Set(),
        childIds: new Set(),
      };
      current.linkedStudentIds.add(sid);

      const normalizedChildId = String(student.childId || '').trim();
      if (normalizedChildId) {
        current.childIds.add(normalizedChildId);
      }

      if (!current.displayName || current.displayName === 'Parent') {
        current.displayName = buildParentDisplayName(contact?.name, email);
      }

      parentLinksByEmail.set(email, current);
    };

    pushParentLink(student?.emergencyContacts?.[0], 'Parent Contact 1');
    pushParentLink(student?.emergencyContacts?.[1], 'Parent Contact 2');

    console.log(`  Queued: ${student.firstName} ${student.lastName} (${sid}) → ${student.className}`);
  });

  for (const [email, parentInfo] of parentLinksByEmail.entries()) {
    const linkedStudentIds = Array.from(parentInfo.linkedStudentIds);
    const childIds = Array.from(parentInfo.childIds);
    const initialPassword = String(childIds[0] || '').trim() || '123456';

    if (childIds.length > 1) {
      console.warn(`  Parent ${email} linked to multiple Child IDs (${childIds.join(', ')}). Using first Child ID as initial password.`);
    }

    const parentUid = await upsertAuthUser(auth, email, initialPassword, parentInfo.displayName || 'Parent', dryRun);
    writes.push({
      ref: db.collection(USERS_COL).doc(parentUid),
      data: {
        uid: parentUid,
        email,
        displayName: parentInfo.displayName || 'Parent',
        schoolId: schoolInfo.id,
        schoolFeatures: schoolInfo.features,
        role: 'parent',
        permissions: ROLE_PERMISSIONS.parent,
        linkedStudentIds,
        mustResetPassword: true,
        requiresPasswordReset: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    console.log(`  Parent access: ${email} linked to ${linkedStudentIds.length} learner(s)`);
  }

  await batchWrite(db, writes, dryRun);

  console.log('\n=== Import complete ===');
  console.log(`School "${schoolInfo.name}" is ready.`);
  console.log(`Principal: ${schoolInfo.principal.email} / ${schoolInfo.principal.password}`);
  staff.forEach((m) => console.log(`  ${m.role.padEnd(9)} ${m.email} / ${m.password}`));
}

main().catch((err) => {
  console.error('\nImport failed:', err.message || err);
  process.exitCode = 1;
});
