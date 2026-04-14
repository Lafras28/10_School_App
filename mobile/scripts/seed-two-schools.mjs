/**
 * seed-two-schools.mjs
 *
 * Creates two demo schools in Firestore with Firebase Admin SDK:
 *   School 1 – Greenhill  (full feature access)
 *   School 2 – Riverside  (students, staffAccess, pdfExport)
 *
 * Each school gets:
 *   - 1 principal auth user + user access profile
 *   - 2 teacher auth users + user access profiles
 *   - 2 classes of 5 students each
 *   - 2 attendance logs (Absent / Late), 2 medicine logs,
 *     2 incident logs per student
 *
 * Usage:
 *   $env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\path\to\serviceAccountKey.json"
 *   npm run seed:schools              – live run
 *   npm run seed:schools -- --dry-run – preview only
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─── Constants ────────────────────────────────────────────────────────────────
const SCHOOLS_COLLECTION = 'schools';
const USERS_COLLECTION = 'users';

const PRINCIPAL_PERMISSIONS = {
  canEditStudents: true,
  canEditOwnChildMedicalInfo: true,
  canTakeAttendance: true,
  canLogIncidents: true,
  canLogMedicine: true,
  canExportReports: true,
  canManageUsers: true,
};
const TEACHER_PERMISSIONS = {
  canEditStudents: false,
  canEditOwnChildMedicalInfo: false,
  canTakeAttendance: true,
  canLogIncidents: true,
  canLogMedicine: true,
  canExportReports: false,
  canManageUsers: false,
};

// ─── School Definitions ───────────────────────────────────────────────────────
const SCHOOLS = [
  {
    id: 'greenhill',
    name: 'Greenhill Primary',
    features: {
      students: true,
      activities: true,
      staffAccess: true,
      compliance: true,
      pdfExport: true,
    },
    principal: {
      email: 'fritzlafras@gmail.com',
      password: '123456',
      displayName: 'Fritz Lafras',
    },
    teachers: [
      { email: 'teacher1@greenhill.com', password: '123456', displayName: 'Ms Sunshine', className: 'Sunshine Bunnies' },
      { email: 'teacher2@greenhill.com', password: '123456', displayName: 'Mr Rainbow',  className: 'Rainbow Cubs' },
    ],
    classes: [
      {
        name: 'Sunshine Bunnies',
        students: [
          { firstName: 'Liam',     lastName: 'Smith',    allergies: 'Peanuts',          emergencyName: 'Sarah Smith',    emergencyNumber: '+27821234001' },
          { firstName: 'Emma',     lastName: 'Johnson',  allergies: 'No known allergies', emergencyName: 'Tom Johnson',   emergencyNumber: '+27821234002' },
          { firstName: 'Noah',     lastName: 'Williams', allergies: 'Dairy',             emergencyName: 'Kate Williams', emergencyNumber: '+27821234003' },
          { firstName: 'Olivia',   lastName: 'Brown',    allergies: 'No known allergies', emergencyName: 'Peter Brown',  emergencyNumber: '+27821234004' },
          { firstName: 'James',    lastName: 'Davis',    allergies: 'Eggs',              emergencyName: 'Ann Davis',     emergencyNumber: '+27821234005' },
        ],
      },
      {
        name: 'Rainbow Cubs',
        students: [
          { firstName: 'Sophia',   lastName: 'Wilson',   allergies: 'No known allergies', emergencyName: 'Mark Wilson',   emergencyNumber: '+27821234006' },
          { firstName: 'Benjamin', lastName: 'Miller',   allergies: 'Gluten',            emergencyName: 'Lisa Miller',   emergencyNumber: '+27821234007' },
          { firstName: 'Ava',      lastName: 'Moore',    allergies: 'No known allergies', emergencyName: 'Chris Moore',   emergencyNumber: '+27821234008' },
          { firstName: 'Lucas',    lastName: 'Taylor',   allergies: 'Bee stings',        emergencyName: 'Sue Taylor',    emergencyNumber: '+27821234009' },
          { firstName: 'Isabella', lastName: 'Anderson', allergies: 'No known allergies', emergencyName: 'Dan Anderson',  emergencyNumber: '+27821234010' },
        ],
      },
    ],
  },
  {
    id: 'riverside',
    name: 'Riverside Academy',
    features: {
      students: true,
      activities: false,
      staffAccess: true,
      compliance: false,
      pdfExport: true,
    },
    principal: {
      email: 'principal2@school.com',
      password: '123456',
      displayName: 'Principal Riverside',
    },
    teachers: [
      { email: 'teacher1@riverside.com', password: '123456', displayName: 'Ms Stars', className: 'Little Stars' },
      { email: 'teacher2@riverside.com', password: '123456', displayName: 'Mr Ocean', className: 'Ocean Waves' },
    ],
    classes: [
      {
        name: 'Little Stars',
        students: [
          { firstName: 'Ethan',    lastName: 'Thomas',    allergies: 'No known allergies', emergencyName: 'Mary Thomas',    emergencyNumber: '+27831234001' },
          { firstName: 'Mia',      lastName: 'Jackson',   allergies: 'Shellfish',         emergencyName: 'Joe Jackson',    emergencyNumber: '+27831234002' },
          { firstName: 'Mason',    lastName: 'White',     allergies: 'No known allergies', emergencyName: 'Beth White',     emergencyNumber: '+27831234003' },
          { firstName: 'Harper',   lastName: 'Harris',    allergies: 'Nuts',              emergencyName: 'Greg Harris',    emergencyNumber: '+27831234004' },
          { firstName: 'Elijah',   lastName: 'Martin',    allergies: 'No known allergies', emergencyName: 'Nina Martin',    emergencyNumber: '+27831234005' },
        ],
      },
      {
        name: 'Ocean Waves',
        students: [
          { firstName: 'Emily',    lastName: 'Thompson',  allergies: 'No known allergies', emergencyName: 'Dave Thompson',  emergencyNumber: '+27831234006' },
          { firstName: 'Alexander',lastName: 'Garcia',    allergies: 'Latex',             emergencyName: 'Rosa Garcia',    emergencyNumber: '+27831234007' },
          { firstName: 'Abigail',  lastName: 'Martinez',  allergies: 'No known allergies', emergencyName: 'Luis Martinez',  emergencyNumber: '+27831234008' },
          { firstName: 'Michael',  lastName: 'Robinson',  allergies: 'Soy',               emergencyName: 'Claire Robinson',emergencyNumber: '+27831234009' },
          { firstName: 'Elizabeth',lastName: 'Clark',     allergies: 'No known allergies', emergencyName: 'Paul Clark',     emergencyNumber: '+27831234010' },
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadCredential() {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) return cert(JSON.parse(jsonRaw));
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) {
    const absolutePath = path.resolve(filePath);
    return cert(JSON.parse(fs.readFileSync(absolutePath, 'utf8')));
  }
  return applicationDefault();
}

function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function ts(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function padNum(n, length = 3) {
  return String(n).padStart(length, '0');
}

function studentId(schoolId, index) {
  return `${schoolId}-st-${padNum(index)}`;
}

// Upsert a Firebase Auth user (create if not found, update password otherwise)
async function upsertAuthUser(auth, email, password, displayName, dryRun) {
  if (dryRun) {
    console.log(`  [DRY] would upsert auth user: ${email}`);
    return `dry-uid-${email.replace(/[^a-z0-9]/gi, '-')}`;
  }
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password, displayName });
    console.log(`  Updated existing auth user: ${email} (${existing.uid})`);
    return existing.uid;
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      const created = await auth.createUser({ email, password, displayName });
      console.log(`  Created new auth user: ${email} (${created.uid})`);
      return created.uid;
    }
    throw err;
  }
}

async function batchWrite(db, writes, dryRun) {
  if (dryRun || !writes.length) return;
  let batch = db.batch();
  let ops = 0;
  for (const { ref, data } of writes) {
    batch.set(ref, data, { merge: true });
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seedSchool(school, db, auth, dryRun) {
  const writes = [];
  console.log(`\n── School: ${school.name} (${school.id}) ──`);

  // 1. School document
  const schoolRef = db.collection(SCHOOLS_COLLECTION).doc(school.id);
  writes.push({
    ref: schoolRef,
    data: {
      id: school.id,
      name: school.name,
      features: school.features,
      principalUserUid: '',        // filled after we create principal
      createdAt: ts(30),
      updatedAt: new Date().toISOString(),
    },
  });

  // 2. Principal
  const principalUid = await upsertAuthUser(auth, school.principal.email, school.principal.password, school.principal.displayName, dryRun);
  const principalProfile = {
    uid: principalUid,
    email: school.principal.email,
    displayName: school.principal.displayName,
    schoolId: school.id,
    schoolFeatures: school.features,
    role: 'principal',
    permissions: PRINCIPAL_PERMISSIONS,
    linkedStudentIds: [],
    createdAt: ts(30),
    updatedAt: new Date().toISOString(),
  };
  writes.push({ ref: db.collection(USERS_COLLECTION).doc(principalUid), data: principalProfile });
  // patch schoolRef principalUserUid
  writes.push({
    ref: schoolRef,
    data: { principalUserUid: principalUid, updatedAt: new Date().toISOString() },
  });

  // 3. Teachers
  for (const teacher of school.teachers) {
    const uid = await upsertAuthUser(auth, teacher.email, teacher.password, teacher.displayName, dryRun);
    const profile = {
      uid,
      email: teacher.email,
      displayName: teacher.displayName,
      schoolId: school.id,
      schoolFeatures: school.features,
      role: 'teacher',
      permissions: TEACHER_PERMISSIONS,
      linkedStudentIds: [],
      createdAt: ts(20),
      updatedAt: new Date().toISOString(),
    };
    writes.push({ ref: db.collection(USERS_COLLECTION).doc(uid), data: profile });
    console.log(`  Teacher profile queued: ${teacher.email} → ${teacher.className}`);
  }

  // 4. Students + logs
  let studentIndex = 1;
  for (const cls of school.classes) {
    for (const raw of cls.students) {
      const sid = studentId(school.id, studentIndex);
      studentIndex += 1;
      const studentName = `${raw.firstName} ${raw.lastName}`;
      const studentDoc = {
        schoolId: school.id,
        id: sid,
        firstName: raw.firstName,
        lastName: raw.lastName,
        className: cls.name,
        emergencyContacts: [{ name: raw.emergencyName, number: raw.emergencyNumber }],
        allergies: raw.allergies,
        medicalAidName: '',
        medicalAidNumber: '',
        doctorContact: '',
        medicalPin: '',
      };
      writes.push({
        ref: db.collection(SCHOOLS_COLLECTION).doc(school.id).collection('students').doc(sid),
        data: studentDoc,
      });

      // Attendance: 1 Absent (3 days ago), 1 Late (6 days ago)
      const attEntries = [
        { status: 'Absent', daysAgo: 3, reason: 'Sick' },
        { status: 'Late',   daysAgo: 6, reason: 'Traffic' },
      ];
      for (const att of attEntries) {
        const attDate = pastDate(att.daysAgo);
        const attId = `${attDate}_${sid}`;
        writes.push({
          ref: db.collection(SCHOOLS_COLLECTION).doc(school.id).collection('attendance').doc(attId),
          data: {
            schoolId: school.id,
            id: attId,
            date: attDate,
            studentId: sid,
            studentName,
            className: cls.name,
            status: att.status,
            reason: att.reason,
            parentReportedAbsent: false,
            parentReportedAt: '',
            parentReportedByUid: '',
            parentReportedByEmail: '',
            createdAt: ts(att.daysAgo),
            updatedAt: ts(att.daysAgo),
          },
        });
      }

      // Medicine logs: 2 per student
      const medicines = [
        { name: 'Panado Syrup',     dosage: '5ml',  staffMember: school.teachers[0].displayName, daysAgo: 2 },
        { name: 'Allergex Tablets', dosage: '1 tab', staffMember: school.teachers[1].displayName, daysAgo: 5 },
      ];
      for (let mi = 0; mi < medicines.length; mi += 1) {
        const med = medicines[mi];
        const medId = `med-${school.id}-${sid}-${mi + 1}`;
        const allergyWarning = raw.allergies !== 'No known allergies'
          && med.name.toLowerCase().includes(raw.allergies.toLowerCase().split(' ')[0]);
        writes.push({
          ref: db.collection(SCHOOLS_COLLECTION).doc(school.id).collection('medicine_logs').doc(medId),
          data: {
            schoolId: school.id,
            id: medId,
            studentId: sid,
            studentName,
            medicationName: med.name,
            dosage: med.dosage,
            staffMember: med.staffMember,
            allergies: raw.allergies,
            allergyWarning: Boolean(allergyWarning),
            timeAdministered: ts(med.daysAgo),
            createdAt: ts(med.daysAgo),
          },
        });
      }

      // Incident logs: 2 per student
      const incidents = [
        { description: 'Minor fall on playground. Grazed knee.', actionTaken: 'Cleaned wound, applied plaster.', location: 'Playground', daysAgo: 4 },
        { description: 'Child complained of stomach ache after lunch.', actionTaken: 'Rested 30 min. Parent contacted.', location: 'Classroom', daysAgo: 8 },
      ];
      for (let ii = 0; ii < incidents.length; ii += 1) {
        const inc = incidents[ii];
        const incId = `inc-${school.id}-${sid}-${ii + 1}`;
        writes.push({
          ref: db.collection(SCHOOLS_COLLECTION).doc(school.id).collection('incidents').doc(incId),
          data: {
            schoolId: school.id,
            id: incId,
            studentId: sid,
            studentName,
            timestamp: ts(inc.daysAgo),
            location: inc.location,
            description: inc.description,
            actionTaken: inc.actionTaken,
            witness: school.teachers[ii % school.teachers.length].displayName,
            createdAt: ts(inc.daysAgo),
            readOnly: true,
          },
        });
      }

      console.log(`  Queued student: ${studentName} (${sid}) in ${cls.name} – 2 att, 2 med, 2 inc`);
    }
  }

  if (dryRun) {
    console.log(`  [DRY] Would write ${writes.length} Firestore documents for ${school.name}`);
  } else {
    await batchWrite(db, writes, false);
    console.log(`  Wrote ${writes.length} Firestore documents for ${school.name}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n=== seed-two-schools.mjs (${dryRun ? 'DRY RUN' : 'LIVE'}) ===`);

  initializeApp({ credential: loadCredential() });
  const db = getFirestore();
  const auth = getAuth();

  for (const school of SCHOOLS) {
    await seedSchool(school, db, auth, dryRun);
  }

  console.log('\n=== Seed complete ===');
  console.log('Login credentials:');
  for (const school of SCHOOLS) {
    console.log(`\n${school.name} (${school.id}):`);
    console.log(`  Principal:  ${school.principal.email} / 123456`);
    for (const t of school.teachers) {
      console.log(`  Teacher:    ${t.email} / 123456  → ${t.className}`);
    }
  }
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message || err);
  process.exitCode = 1;
});
