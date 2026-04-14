import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SCHOOLS_COLLECTION = 'schools';
const USERS_COLLECTION = 'users';
const DEFAULT_SCHOOL_ID = 'greenhill';
const ROOT_COLLECTIONS = [
  'students',
  'attendance',
  'incidents',
  'medicine_logs',
  'compliance_documents',
  'activities',
];
const DEFAULT_SCHOOL_FEATURES = {
  students: true,
  activities: false,
  staffAccess: true,
  compliance: false,
  pdfExport: true,
};

function parseArgs(argv) {
  const parsed = {
    schoolId: DEFAULT_SCHOOL_ID,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg.startsWith('--schoolId=')) {
      parsed.schoolId = arg.slice('--schoolId='.length);
      continue;
    }
    if (arg === '--schoolId') {
      const next = String(argv[i + 1] || '').trim();
      if (next) {
        parsed.schoolId = next;
        i += 1;
      }
    }
  }

  return parsed;
}

function normalizeSchoolId(value, fallback = DEFAULT_SCHOOL_ID) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || fallback;
}

function buildSchoolNameFromId(schoolId) {
  return String(schoolId || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'School';
}

function loadCredentialFromEnv() {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) {
    return cert(JSON.parse(jsonRaw));
  }

  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) {
    const absolutePath = path.resolve(filePath);
    const raw = fs.readFileSync(absolutePath, 'utf8');
    return cert(JSON.parse(raw));
  }

  return applicationDefault();
}

async function commitInChunks(workItems, dryRun) {
  if (dryRun || !workItems.length) {
    return;
  }

  const db = getFirestore();
  let batch = db.batch();
  let ops = 0;

  for (const item of workItems) {
    batch.set(item.ref, item.payload, { merge: true });
    ops += 1;

    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }
}

async function migrateRootCollections(defaultSchoolId, dryRun) {
  const db = getFirestore();
  const schoolsTouched = new Set();
  const summary = {};

  for (const collectionName of ROOT_COLLECTIONS) {
    const snapshot = await db.collection(collectionName).get();
    const writes = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const targetSchoolId = normalizeSchoolId(data.schoolId, defaultSchoolId);
      schoolsTouched.add(targetSchoolId);

      const targetRef = db
        .collection(SCHOOLS_COLLECTION)
        .doc(targetSchoolId)
        .collection(collectionName)
        .doc(docSnap.id);

      writes.push({
        ref: targetRef,
        payload: {
          ...data,
          id: data.id || docSnap.id,
          schoolId: targetSchoolId,
        },
      });
    });

    await commitInChunks(writes, dryRun);
    summary[collectionName] = writes.length;
  }

  return { schoolsTouched, summary };
}

async function migrateUsers(defaultSchoolId, dryRun) {
  const db = getFirestore();
  const userSnapshot = await db.collection(USERS_COLLECTION).get();
  const writes = [];
  const schoolToPrincipal = new Map();
  const schoolsTouched = new Set();

  userSnapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const schoolId = normalizeSchoolId(data.schoolId, defaultSchoolId);
    schoolsTouched.add(schoolId);

    const role = String(data.role || '').trim().toLowerCase();
    if (role === 'principal' && !schoolToPrincipal.has(schoolId)) {
      schoolToPrincipal.set(schoolId, docSnap.id);
    }

    writes.push({
      ref: db.collection(USERS_COLLECTION).doc(docSnap.id),
      payload: {
        schoolId,
        updatedAt: new Date().toISOString(),
      },
    });
  });

  await commitInChunks(writes, dryRun);

  return {
    userCount: writes.length,
    schoolsTouched,
    schoolToPrincipal,
  };
}

async function ensureSchoolDocs(schoolIds, schoolToPrincipal, dryRun) {
  const db = getFirestore();
  const writes = [];

  for (const schoolId of schoolIds) {
    writes.push({
      ref: db.collection(SCHOOLS_COLLECTION).doc(schoolId),
      payload: {
        id: schoolId,
        name: buildSchoolNameFromId(schoolId),
        principalUserUid: String(schoolToPrincipal.get(schoolId) || '').trim(),
        features: {
          ...DEFAULT_SCHOOL_FEATURES,
        },
        updatedAt: new Date().toISOString(),
      },
    });
  }

  await commitInChunks(writes, dryRun);
  return writes.length;
}

async function main() {
  const { schoolId, dryRun } = parseArgs(process.argv);
  const defaultSchoolId = normalizeSchoolId(schoolId);

  initializeApp({ credential: loadCredentialFromEnv() });

  const rootResult = await migrateRootCollections(defaultSchoolId, dryRun);
  const userResult = await migrateUsers(defaultSchoolId, dryRun);

  const combinedSchools = new Set([
    ...rootResult.schoolsTouched,
    ...userResult.schoolsTouched,
  ]);

  const schoolsUpserted = await ensureSchoolDocs(
    combinedSchools,
    userResult.schoolToPrincipal,
    dryRun,
  );

  const modeLabel = dryRun ? 'DRY RUN (no writes committed)' : 'LIVE RUN';
  console.log(`Migration completed: ${modeLabel}`);
  console.log('Root collection docs migrated by collection:');
  Object.entries(rootResult.summary).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });
  console.log(`Users updated with schoolId: ${userResult.userCount}`);
  console.log(`School docs upserted: ${schoolsUpserted}`);
  console.log(`Schools touched: ${Array.from(combinedSchools).sort().join(', ') || '(none)'}`);
}

main().catch((error) => {
  console.error('Migration failed.');
  console.error(error);
  process.exitCode = 1;
});
