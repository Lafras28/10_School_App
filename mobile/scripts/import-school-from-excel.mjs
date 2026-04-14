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
const ROLE_PERMISSIONS = {
  principal: PRINCIPAL_PERMISSIONS,
  teacher:   TEACHER_PERMISSIONS,
  viewer:    VIEWER_PERMISSIONS,
  parent:    VIEWER_PERMISSIONS,
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
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  return String(v).trim();
}

function yesNo(val) {
  return String(val || '').trim().toUpperCase() !== 'NO';
}

function normalizeId(val, fallback = 'school') {
  const slug = String(val || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug || fallback;
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
    if (rowNum < 6) return;
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
  ws.eachRow((row, rowNum) => {
    if (rowNum < 6) return;
    const firstName  = cellStr(row, 1);
    const lastName   = cellStr(row, 2);
    const className  = cellStr(row, 3);
    if (!firstName && !lastName) return;
    if (!firstName || !lastName) { console.warn(`  Skipping student row ${rowNum}: missing name`); return; }

    const allergies       = cellStr(row, 4)  || 'No known allergies';
    const ec1Name         = cellStr(row, 5);
    const ec1Number       = cellStr(row, 6);
    const ec2Name         = cellStr(row, 7);
    const ec2Number       = cellStr(row, 8);
    const medicalAidName  = cellStr(row, 9);
    const medicalAidNumber= cellStr(row, 10);
    const doctorContact   = cellStr(row, 11);
    const medicalPin      = cellStr(row, 12);

    if (!ec1Name || !ec1Number) {
      console.warn(`  Warning: student ${firstName} ${lastName} is missing Emergency Contact 1 — added with placeholder.`);
    }

    const emergencyContacts = [];
    if (ec1Name || ec1Number) emergencyContacts.push({ name: ec1Name || 'Contact 1', number: ec1Number || '' });
    if (ec2Name || ec2Number) emergencyContacts.push({ name: ec2Name || 'Contact 2', number: ec2Number || '' });

    students.push({ firstName, lastName, className, allergies, emergencyContacts, medicalAidName, medicalAidNumber, doctorContact, medicalPin });
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
    const role = ['teacher','viewer','parent'].includes(member.role) ? member.role : 'teacher';
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
  students.forEach((student, idx) => {
    const sid = `${schoolInfo.id}-st-${padNum(idx + 1)}`;
    writes.push({
      ref: db.collection(SCHOOLS_COL).doc(schoolInfo.id).collection('students').doc(sid),
      data: {
        schoolId: schoolInfo.id,
        id: sid,
        firstName:        student.firstName,
        lastName:         student.lastName,
        className:        student.className,
        emergencyContacts: student.emergencyContacts,
        allergies:        student.allergies,
        medicalAidName:   student.medicalAidName,
        medicalAidNumber: student.medicalAidNumber,
        doctorContact:    student.doctorContact,
        medicalPin:       student.medicalPin,
      },
    });
    console.log(`  Queued: ${student.firstName} ${student.lastName} (${sid}) → ${student.className}`);
  });

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
