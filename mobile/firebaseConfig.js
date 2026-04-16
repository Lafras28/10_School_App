import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  updateProfile,
  updatePassword,
} from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCQcV1urnN1GlsVCOv62XojgFrpRrc34dg',
  authDomain: 'schoolsafetyapp.firebaseapp.com',
  projectId: 'schoolsafetyapp',
  storageBucket: 'schoolsafetyapp.firebasestorage.app',
  messagingSenderId: '303337727685',
  appId: '1:303337727685:web:4b438db6c0ec6d5f96b2ac',
  measurementId: 'G-LVZ6MPRQ06',
};

const DEFAULT_SCHOOL_ID = 'greenhill';
const SCHOOLS_COLLECTION = 'schools';
const USERS_COLLECTION = 'users';
const STUDENTS_COLLECTION = 'students';
const ATTENDANCE_COLLECTION = 'attendance';
const INCIDENTS_COLLECTION = 'incidents';
const MEDICINE_LOGS_COLLECTION = 'medicine_logs';
const GENERAL_LOGS_COLLECTION = 'general_logs';
const COMPLIANCE_DOCS_COLLECTION = 'compliance_documents';
const ACTIVITIES_COLLECTION = 'activities';
const PRINCIPAL_EMAILS = new Set(['fritzlafras@gmail.com', 'principal@school.com']);

function getCurrentLocalDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const DEFAULT_SCHOOL_FEATURE_FLAGS = {
  students: true,
  activities: false,
  staffAccess: true,
  compliance: false,
  pdfExport: true,
};

export const DEFAULT_ROLE_PERMISSIONS = {
  principal: {
    canEditStudents: true,
    canTakeAttendance: true,
    canLogIncidents: true,
    canLogMedicine: true,
    canLogGeneral: true,
    canExportReports: true,
    canManageUsers: true,
    canEditOwnChildMedicalInfo: false,
  },
  teacher: {
    canEditStudents: false,
    canTakeAttendance: true,
    canLogIncidents: true,
    canLogMedicine: true,
    canLogGeneral: true,
    canExportReports: true,
    canManageUsers: false,
    canEditOwnChildMedicalInfo: false,
  },
  viewer: {
    canEditStudents: false,
    canTakeAttendance: false,
    canLogIncidents: false,
    canLogMedicine: false,
    canLogGeneral: false,
    canExportReports: true,
    canManageUsers: false,
    canEditOwnChildMedicalInfo: false,
  },
  parent: {
    canEditStudents: false,
    canTakeAttendance: false,
    canLogIncidents: false,
    canLogMedicine: false,
    canLogGeneral: false,
    canExportReports: false,
    canManageUsers: false,
    canEditOwnChildMedicalInfo: true,
  },
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
let activeSchoolId = DEFAULT_SCHOOL_ID;

function createRecordId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultPermissionsForRole(role = 'teacher') {
  const normalizedRole = String(role || 'teacher').trim().toLowerCase();
  return DEFAULT_ROLE_PERMISSIONS[normalizedRole] || DEFAULT_ROLE_PERMISSIONS.teacher;
}

function normalizeSchoolId(value) {
  const candidate = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  return candidate || DEFAULT_SCHOOL_ID;
}

function buildDefaultSchoolFeatures(overrides = {}) {
  return {
    ...DEFAULT_SCHOOL_FEATURE_FLAGS,
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  };
}

function normalizeVaultPassword(value) {
  return String(value || '').trim();
}

function buildDefaultSchoolName(schoolId = DEFAULT_SCHOOL_ID) {
  const cleaned = String(schoolId || DEFAULT_SCHOOL_ID).replace(/[-_]+/g, ' ').trim();
  return cleaned ? cleaned.replace(/\b\w/g, (char) => char.toUpperCase()) : 'School';
}

function schoolCollectionRef(schoolId, collectionName) {
  return collection(db, SCHOOLS_COLLECTION, normalizeSchoolId(schoolId), collectionName);
}

function schoolDocRef(schoolId, collectionName, docId) {
  return doc(db, SCHOOLS_COLLECTION, normalizeSchoolId(schoolId), collectionName, String(docId || '').trim());
}

async function fetchSchoolConfigById(schoolId) {
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  const schoolRef = doc(db, SCHOOLS_COLLECTION, normalizedSchoolId);
  const snapshot = await getDoc(schoolRef);

  if (!snapshot.exists()) {
    return {
      id: normalizedSchoolId,
      name: buildDefaultSchoolName(normalizedSchoolId),
      features: buildDefaultSchoolFeatures(),
      medicalVaultPassword: '',
      principalUserUid: '',
    };
  }

  const data = snapshot.data() || {};
  return {
    id: normalizedSchoolId,
    name: String(data?.name || buildDefaultSchoolName(normalizedSchoolId)).trim(),
    features: buildDefaultSchoolFeatures(data?.features || {}),
    medicalVaultPassword: normalizeVaultPassword(data?.medicalVaultPassword),
    principalUserUid: String(data?.principalUserUid || '').trim(),
  };
}

function inferRoleFromEmail(email = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (PRINCIPAL_EMAILS.has(normalizedEmail) || /(principal|admin|owner|head)/.test(normalizedEmail)) {
    return 'principal';
  }

  if (/(viewer|guest|readonly|read-only)/.test(normalizedEmail)) {
    return 'viewer';
  }

  if (/(parent|guardian|mother|father|mom|dad)/.test(normalizedEmail)) {
    return 'parent';
  }

  return 'teacher';
}

function buildAccessProfile(user, data = {}) {
  const inferredRole = inferRoleFromEmail(data?.email || user?.email || '');
  const storedRole = String(data?.role || '').trim().toLowerCase();
  const role = (inferredRole === 'principal' ? 'principal' : (storedRole || inferredRole || 'teacher'));
  const permissions = {
    ...getDefaultPermissionsForRole(role),
    ...(data?.permissions && typeof data.permissions === 'object' ? data.permissions : {}),
  };

  return {
    uid: String(user?.uid || '').trim(),
    email: String(data?.email || user?.email || '').trim(),
    displayName: String(data?.displayName || user?.displayName || user?.email || 'Staff Member').trim(),
    schoolId: normalizeSchoolId(data?.schoolId),
    schoolFeatures: buildDefaultSchoolFeatures(data?.schoolFeatures || {}),
    role,
    permissions,
    isActive: data?.isActive !== false,
    assignedClasses: Array.isArray(data?.assignedClasses)
      ? data.assignedClasses.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    linkedStudentIds: Array.isArray(data?.linkedStudentIds)
      ? data.linkedStudentIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
  };
}

export async function ensureUserAccessProfile(user) {
  if (!user?.uid) {
    const fallbackProfile = buildAccessProfile(null, {
      displayName: 'Staff Member',
      role: 'teacher',
      schoolId: DEFAULT_SCHOOL_ID,
      schoolFeatures: buildDefaultSchoolFeatures(),
    });
    activeSchoolId = fallbackProfile.schoolId;
    return fallbackProfile;
  }

  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const snapshot = await getDoc(userRef);
  const existingData = snapshot.exists() ? (snapshot.data() || {}) : {};
  const provisionalProfile = buildAccessProfile(user, existingData);
  const schoolId = normalizeSchoolId(existingData?.schoolId || provisionalProfile.schoolId);
  const schoolRef = doc(db, SCHOOLS_COLLECTION, schoolId);
  const schoolSnapshot = await getDoc(schoolRef);

  if (!schoolSnapshot.exists()) {
    await setDoc(schoolRef, {
      id: schoolId,
      name: buildDefaultSchoolName(schoolId),
      principalUserUid: provisionalProfile.role === 'principal' ? provisionalProfile.uid : '',
      features: buildDefaultSchoolFeatures(),
      medicalVaultPassword: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  const schoolConfig = await fetchSchoolConfigById(schoolId);
  if (provisionalProfile.role === 'principal' && !schoolConfig.principalUserUid) {
    await setDoc(schoolRef, {
      principalUserUid: provisionalProfile.uid,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  const schoolFeatures = schoolConfig.features;

  if (snapshot.exists()) {
    const profile = buildAccessProfile(user, {
      ...snapshot.data(),
      schoolId,
      schoolFeatures,
    });
    await setDoc(userRef, {
      email: profile.email,
      displayName: profile.displayName,
      schoolId: profile.schoolId,
      role: profile.role,
      permissions: profile.permissions,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    activeSchoolId = profile.schoolId;
    return profile;
  }

  const newProfile = {
    ...buildAccessProfile(user, {
      role: inferRoleFromEmail(user.email || ''),
      schoolId,
      schoolFeatures,
    }),
    createdAt: new Date().toISOString(),
  };

  await setDoc(userRef, newProfile, { merge: true });
  activeSchoolId = newProfile.schoolId;
  return newProfile;
}

export async function signInUser(email, password) {
  const normalizedEmail = String(email || '').trim();
  const normalizedPassword = String(password || '').trim();
  const credentials = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
  const accessProfile = await ensureUserAccessProfile(credentials.user);
  if (accessProfile?.isActive === false) {
    await signOut(auth);
    throw new Error('This account has been removed. Please contact your principal.');
  }
  return {
    user: credentials.user,
    accessProfile,
  };
}

export function listenToAuthChanges(callback) {
  let unsubscribeProfile = () => {};

  const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    unsubscribeProfile();
    unsubscribeProfile = () => {};

    if (!user) {
      activeSchoolId = DEFAULT_SCHOOL_ID;
      callback(null, null);
      return;
    }

    try {
      const accessProfile = await ensureUserAccessProfile(user);
      if (accessProfile?.isActive === false) {
        await signOut(auth);
        callback(null, null);
        return;
      }
      activeSchoolId = accessProfile.schoolId;
      callback(user, accessProfile);

      const userRef = doc(db, USERS_COLLECTION, user.uid);
      unsubscribeProfile = onSnapshot(userRef, async (snapshot) => {
        if (!snapshot.exists()) {
          callback(user, buildAccessProfile(user));
          return;
        }

        const baseProfile = buildAccessProfile(user, snapshot.data() || {});
        const schoolConfig = await fetchSchoolConfigById(baseProfile.schoolId);
        const nextProfile = buildAccessProfile(user, {
          ...(snapshot.data() || {}),
          schoolId: baseProfile.schoolId,
          schoolFeatures: schoolConfig.features,
        });
        activeSchoolId = nextProfile.schoolId;
        callback(user, nextProfile);
      }, (error) => {
        console.warn('Could not subscribe to user access profile.', error);
      });
    } catch (error) {
      console.warn('Could not load user access profile.', error);
      callback(user, buildAccessProfile(user));
    }
  });

  return () => {
    unsubscribeProfile();
    unsubscribeAuth();
  };
}

export function signOutCurrentUser() {
  return signOut(auth);
}

export async function sendResetPasswordEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Enter your email address first.');
  }

  await sendPasswordResetEmail(auth, normalizedEmail);
}

export async function updateCurrentUserCredentials({ currentPassword = '', newEmail = '', newPassword = '' } = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You need to be signed in to update profile settings.');
  }

  const normalizedNewEmail = String(newEmail || '').trim().toLowerCase();
  const normalizedNewPassword = String(newPassword || '').trim();
  const normalizedCurrentPassword = String(currentPassword || '').trim();
  const hasEmailChange = Boolean(normalizedNewEmail) && normalizedNewEmail !== String(user.email || '').trim().toLowerCase();
  const hasPasswordChange = Boolean(normalizedNewPassword);

  if (!hasEmailChange && !hasPasswordChange) {
    throw new Error('Nothing to update. Enter a new email or password.');
  }

  if (normalizedCurrentPassword && user.email) {
    const credential = EmailAuthProvider.credential(String(user.email).trim(), normalizedCurrentPassword);
    await reauthenticateWithCredential(user, credential);
  }

  if (hasEmailChange) {
    await updateEmail(user, normalizedNewEmail);
    await setDoc(doc(db, USERS_COLLECTION, user.uid), {
      email: normalizedNewEmail,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  if (hasPasswordChange) {
    if (normalizedNewPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    await updatePassword(user, normalizedNewPassword);
  }

  return {
    emailUpdated: hasEmailChange,
    passwordUpdated: hasPasswordChange,
    email: hasEmailChange ? normalizedNewEmail : String(user.email || '').trim(),
  };
}

export async function fetchUserAccessProfiles() {
  const currentSchoolId = normalizeSchoolId(activeSchoolId);
  const usersQuery = query(collection(db, USERS_COLLECTION), where('schoolId', '==', currentSchoolId));
  const snapshot = await getDocs(usersQuery);
  return snapshot.docs
    .map((documentSnapshot) => {
      const data = documentSnapshot.data() || {};
      return buildAccessProfile({
        uid: documentSnapshot.id,
        email: data.email,
        displayName: data.displayName,
      }, {
        ...data,
        uid: documentSnapshot.id,
      });
    })
    .filter((profile) => profile?.isActive !== false)
    .sort((left, right) => String(left.displayName || left.email || '').localeCompare(String(right.displayName || right.email || '')));
}

export async function updateUserAccessProfile(uid, updates = {}) {
  const normalizedUid = String(uid || '').trim();
  if (!normalizedUid) {
    throw new Error('User id is required to update access.');
  }

  const userRef = doc(db, USERS_COLLECTION, normalizedUid);
  const snapshot = await getDoc(userRef);
  const existingData = snapshot.exists() ? (snapshot.data() || {}) : {};
  const role = String(updates?.role || existingData?.role || 'teacher').trim().toLowerCase();
  const nextPermissions = {
    ...getDefaultPermissionsForRole(role),
    ...(existingData?.permissions && typeof existingData.permissions === 'object' ? existingData.permissions : {}),
    ...(updates?.permissions && typeof updates.permissions === 'object' ? updates.permissions : {}),
  };

  const nextData = {
    ...existingData,
    ...updates,
    schoolId: normalizeSchoolId(existingData?.schoolId || activeSchoolId),
    role,
    isActive: typeof updates?.isActive === 'boolean' ? updates.isActive : (existingData?.isActive !== false),
    assignedClasses: Array.isArray(updates?.assignedClasses)
      ? updates.assignedClasses.map((value) => String(value || '').trim()).filter(Boolean)
      : (Array.isArray(existingData?.assignedClasses)
        ? existingData.assignedClasses.map((value) => String(value || '').trim()).filter(Boolean)
        : []),
    permissions: nextPermissions,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(userRef, nextData, { merge: true });
  return buildAccessProfile({
    uid: normalizedUid,
    email: nextData.email,
    displayName: nextData.displayName,
  }, nextData);
}

function normalizeStudent(student = {}, fallbackId = '') {
  const studentId = String(student?.id || fallbackId).trim();
  const emergencyContacts = Array.isArray(student?.emergencyContacts)
    ? student.emergencyContacts
        .map((contact, index) => {
          const name = String(contact?.name || '').trim();
          const number = String(contact?.number || '').trim();
          if (!name && !number) {
            return null;
          }

          return {
            name: name || `Emergency Contact ${index + 1}`,
            number,
          };
        })
        .filter(Boolean)
    : [];

  return {
    schoolId: normalizeSchoolId(student?.schoolId || activeSchoolId),
    id: studentId,
    childId: String(student?.childId || '').trim(),
    firstName: String(student?.firstName || '').trim(),
    lastName: String(student?.lastName || '').trim(),
    className: String(student?.className || '').trim() || 'Sunshine Bunnies',
    emergencyContacts,
    allergies: String(student?.allergies || 'No known allergies').trim(),
    medicalAidName: String(student?.medicalAidName || '').trim(),
    medicalAidPlan: String(student?.medicalAidPlan || '').trim(),
    medicalAidNumber: String(student?.medicalAidNumber || '').trim(),
    mainMemberName: String(student?.mainMemberName || '').trim(),
    mainMemberIdNumber: String(student?.mainMemberIdNumber || '').trim(),
    childDependencyCode: String(student?.childDependencyCode || '').trim(),
    doctorContact: String(student?.doctorContact || '').trim(),
    medicalPin: String(student?.medicalPin || '').trim(),
  };
}

function normalizeAttendanceEntry(entry = {}, fallbackId = '') {
  const date = String(entry?.date || '').trim();
  const studentId = String(entry?.studentId || entry?.id || '').trim();
  const rawStatus = String(entry?.status || 'Present').trim();
  const status = rawStatus ? `${rawStatus.charAt(0).toUpperCase()}${rawStatus.slice(1).toLowerCase()}` : 'Present';
  const parentReportedAbsent = Boolean(entry?.parentReportedAbsent) && status === 'Absent';

  return {
    schoolId: normalizeSchoolId(entry?.schoolId || activeSchoolId),
    id: String(entry?.id || fallbackId || `${date}_${studentId}`).trim(),
    date,
    studentId,
    studentName: String(entry?.studentName || '').trim(),
    className: String(entry?.className || '').trim() || 'Sunshine Bunnies',
    status,
    reason: String(entry?.reason || '').trim(),
    parentReportedAbsent,
    parentReportedAt: parentReportedAbsent ? String(entry?.parentReportedAt || entry?.updatedAt || '').trim() : '',
    parentReportedByUid: parentReportedAbsent ? String(entry?.parentReportedByUid || '').trim() : '',
    parentReportedByEmail: parentReportedAbsent ? String(entry?.parentReportedByEmail || '').trim() : '',
    createdAt: String(entry?.createdAt || new Date().toISOString()).trim(),
    updatedAt: String(entry?.updatedAt || '').trim(),
  };
}

function normalizeIncidentRecord(record = {}, fallbackId = '') {
  const createdAt = String(record?.createdAt || record?.timestamp || new Date().toISOString()).trim();
  const occurredAt = String(record?.occurredAt || record?.incidentAt || record?.timestamp || createdAt).trim();

  return {
    schoolId: normalizeSchoolId(record?.schoolId || activeSchoolId),
    id: String(record?.id || fallbackId || createRecordId('inc')).trim(),
    studentId: String(record?.studentId || '').trim(),
    studentName: String(record?.studentName || '').trim(),
    occurredAt,
    timestamp: String(record?.timestamp || createdAt).trim(),
    location: String(record?.location || '').trim(),
    description: String(record?.description || '').trim(),
    actionTaken: String(record?.actionTaken || '').trim(),
    witness: String(record?.witness || '').trim(),
    createdAt,
    readOnly: record?.readOnly !== false,
  };
}

function normalizeMedicineLog(record = {}, fallbackId = '') {
  const createdAt = String(record?.createdAt || record?.timeAdministered || new Date().toISOString()).trim();
  const timeAdministered = String(record?.timeAdministered || record?.administeredAt || createdAt).trim();

  return {
    schoolId: normalizeSchoolId(record?.schoolId || activeSchoolId),
    id: String(record?.id || fallbackId || createRecordId('med')).trim(),
    studentId: String(record?.studentId || '').trim(),
    studentName: String(record?.studentName || '').trim(),
    medicationName: String(record?.medicationName || '').trim(),
    dosage: String(record?.dosage || '').trim(),
    staffMember: String(record?.staffMember || '').trim(),
    allergies: String(record?.allergies || 'None').trim(),
    allergyWarning: Boolean(record?.allergyWarning),
    timeAdministered,
    createdAt,
  };
}

function normalizeGeneralLog(record = {}, fallbackId = '') {
  const createdAt = String(record?.createdAt || record?.timestamp || new Date().toISOString()).trim();
  const occurredAt = String(record?.occurredAt || record?.communicationAt || record?.timestamp || createdAt).trim();

  return {
    schoolId: normalizeSchoolId(record?.schoolId || activeSchoolId),
    id: String(record?.id || fallbackId || createRecordId('gen')).trim(),
    studentId: String(record?.studentId || '').trim(),
    studentName: String(record?.studentName || '').trim(),
    subject: String(record?.subject || '').trim(),
    note: String(record?.note || '').trim(),
    staffMember: String(record?.staffMember || '').trim(),
    occurredAt,
    timestamp: String(record?.timestamp || createdAt).trim(),
    createdAt,
  };
}

function compareStudentIds(left, right) {
  const leftMatch = String(left?.id || '').match(/st-(\d+)/i);
  const rightMatch = String(right?.id || '').match(/st-(\d+)/i);

  if (leftMatch && rightMatch) {
    return Number(leftMatch[1]) - Number(rightMatch[1]);
  }

  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

function normalizeActivity(data = {}, fallbackId = '') {
  return {
    schoolId: normalizeSchoolId(data?.schoolId || activeSchoolId),
    id: String(data?.id || fallbackId || createRecordId('act')).trim(),
    datum: String(data?.datum || '').trim(),
    aktiwiteitsName: String(data?.aktiwiteitsName || '').trim(),
    kategorie: String(data?.kategorie || '').trim(),
    ouderdomsGroep: Array.isArray(data?.ouderdomsGroep) ? data.ouderdomsGroep.map((v) => String(v || '').trim()).filter(Boolean) : [],
    aanpassingPerGroep: String(data?.aanpassingPerGroep || '').trim(),
    benodigehede: String(data?.benodigehede || '').trim(),
    voorbereidingStappe: String(data?.voorbereidingStappe || '').trim(),
    uitvoering: String(data?.uitvoering || '').trim(),
    duur: String(data?.duur || '').trim(),
    doel: String(data?.doel || '').trim(),
    vaardighede: String(data?.vaardighede || '').trim(),
    leerareas: String(data?.leerareas || '').trim(),
    fileUrl: String(data?.fileUrl || '').trim(),
    fileName: String(data?.fileName || '').trim(),
    storagePath: String(data?.storagePath || '').trim(),
    tema: String(data?.tema || '').trim(),
    className: String(data?.className || '').trim(),
    loggedByUid: String(data?.loggedByUid || '').trim(),
    loggedByEmail: String(data?.loggedByEmail || '').trim(),
    loggedByName: String(data?.loggedByName || '').trim(),
    createdAt: String(data?.createdAt || new Date().toISOString()).trim(),
  };
}

function compareStudentNames(left, right) {
  return String(left?.studentName || '').localeCompare(String(right?.studentName || ''));
}

function compareNewestFirst(left, right) {
  const leftValue = String(left?.createdAt || left?.timeAdministered || left?.timestamp || '');
  const rightValue = String(right?.createdAt || right?.timeAdministered || right?.timestamp || '');
  return rightValue.localeCompare(leftValue);
}

function hasAllergyWarning(medicationName, allergies) {
  const medicine = String(medicationName || '').trim().toLowerCase();
  const allergyText = String(allergies || '').trim().toLowerCase();

  if (!medicine || !allergyText || allergyText === 'none' || allergyText === 'no known allergies') {
    return false;
  }

  const ignoredTokens = new Set(['allergy', 'allergies', 'intolerance', 'required', 'inhaler', 'no', 'known']);
  const allergyTokens = allergyText
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length >= 3 && !ignoredTokens.has(token)) || [];

  return allergyText.includes(medicine) || allergyTokens.some((token) => medicine.includes(token));
}

export async function fetchStudentsFromFirestore() {
  const snapshot = await getDocs(schoolCollectionRef(activeSchoolId, STUDENTS_COLLECTION));
  return snapshot.docs
    .map((documentSnapshot) => normalizeStudent(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareStudentIds);
}

export async function fetchAttendanceFromFirestore(registerDate) {
  const attendanceQuery = query(schoolCollectionRef(activeSchoolId, ATTENDANCE_COLLECTION), where('date', '==', String(registerDate || '').trim()));
  const snapshot = await getDocs(attendanceQuery);
  return snapshot.docs
    .map((documentSnapshot) => normalizeAttendanceEntry(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareStudentNames);
}

export async function fetchAllAttendanceFromFirestore() {
  const snapshot = await getDocs(schoolCollectionRef(activeSchoolId, ATTENDANCE_COLLECTION));
  return snapshot.docs
    .map((documentSnapshot) => normalizeAttendanceEntry(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareNewestFirst);
}

export async function fetchAttendanceHistoryForStudentFromFirestore(studentId) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    return [];
  }

  const attendanceQuery = query(
    schoolCollectionRef(activeSchoolId, ATTENDANCE_COLLECTION),
    where('studentId', '==', normalizedStudentId),
  );
  const snapshot = await getDocs(attendanceQuery);
  return snapshot.docs
    .map((documentSnapshot) => normalizeAttendanceEntry(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareNewestFirst);
}

export async function fetchIncidentsFromFirestore() {
  const snapshot = await getDocs(schoolCollectionRef(activeSchoolId, INCIDENTS_COLLECTION));
  return snapshot.docs
    .map((documentSnapshot) => normalizeIncidentRecord(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareNewestFirst);
}

export async function fetchIncidentsForStudentFromFirestore(studentId) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    return [];
  }

  const incidentQuery = query(
    schoolCollectionRef(activeSchoolId, INCIDENTS_COLLECTION),
    where('studentId', '==', normalizedStudentId),
  );
  const snapshot = await getDocs(incidentQuery);
  return snapshot.docs
    .map((documentSnapshot) => normalizeIncidentRecord(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareNewestFirst);
}

export async function fetchMedicineLogsFromFirestore() {
  const snapshot = await getDocs(schoolCollectionRef(activeSchoolId, MEDICINE_LOGS_COLLECTION));
  return snapshot.docs
    .map((documentSnapshot) => normalizeMedicineLog(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareNewestFirst);
}

export async function fetchMedicineLogsForStudentFromFirestore(studentId) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    return [];
  }

  const medicineQuery = query(
    schoolCollectionRef(activeSchoolId, MEDICINE_LOGS_COLLECTION),
    where('studentId', '==', normalizedStudentId),
  );
  const snapshot = await getDocs(medicineQuery);
  return snapshot.docs
    .map((documentSnapshot) => normalizeMedicineLog(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareNewestFirst);
}

export async function fetchGeneralLogsFromFirestore() {
  const snapshot = await getDocs(schoolCollectionRef(activeSchoolId, GENERAL_LOGS_COLLECTION));
  return snapshot.docs
    .map((documentSnapshot) => normalizeGeneralLog(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareNewestFirst);
}

export async function fetchGeneralLogsForStudentFromFirestore(studentId) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    return [];
  }

  const generalQuery = query(
    schoolCollectionRef(activeSchoolId, GENERAL_LOGS_COLLECTION),
    where('studentId', '==', normalizedStudentId),
  );
  const snapshot = await getDocs(generalQuery);
  return snapshot.docs
    .map((documentSnapshot) => normalizeGeneralLog(documentSnapshot.data() || {}, documentSnapshot.id))
    .sort(compareNewestFirst);
}

async function getNextStudentId() {
  const students = await fetchStudentsFromFirestore();
  let highest = 0;

  students.forEach((student) => {
    const match = String(student?.id || '').match(/st-(\d+)/i);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  });

  return `st-${String(highest + 1).padStart(3, '0')}`;
}

export async function saveStudentToFirestore(student, existingId = '') {
  const studentId = String(existingId || student?.id || '').trim() || await getNextStudentId();
  const normalized = normalizeStudent(student, studentId);

  await setDoc(schoolDocRef(activeSchoolId, STUDENTS_COLLECTION, studentId), normalized, { merge: true });
  return normalized;
}

export async function deleteStudentFromFirestore(studentId = '') {
  const id = String(studentId || '').trim();
  if (!id) {
    throw new Error('Student ID is required to delete a student.');
  }
  await deleteDoc(schoolDocRef(activeSchoolId, STUDENTS_COLLECTION, id));
}

export async function saveAttendanceToFirestore(registerDate, entry, status, reason = '') {
  if (String(registerDate || '').trim() !== getCurrentLocalDateString()) {
    throw new Error('Attendance locks at 12:00 AM. Only today\'s attendance can still be updated.');
  }

  const normalizedStatus = String(status || entry?.status || 'Present').trim() || 'Present';
  const keepParentFlag = normalizedStatus === 'Absent' && Boolean(entry?.parentReportedAbsent);
  const normalized = normalizeAttendanceEntry({
    ...entry,
    date: String(registerDate || entry?.date || '').trim(),
    status: normalizedStatus,
    reason: ['Absent', 'Late'].includes(normalizedStatus) ? String(reason || '').trim() : '',
    parentReportedAbsent: keepParentFlag,
    parentReportedAt: keepParentFlag ? String(entry?.parentReportedAt || new Date().toISOString()).trim() : '',
    parentReportedByUid: keepParentFlag ? String(entry?.parentReportedByUid || '').trim() : '',
    parentReportedByEmail: keepParentFlag ? String(entry?.parentReportedByEmail || '').trim() : '',
    updatedAt: new Date().toISOString(),
    createdAt: entry?.createdAt || new Date().toISOString(),
  });

  if (['Absent', 'Late'].includes(normalized.status)) {
    await setDoc(schoolDocRef(activeSchoolId, ATTENDANCE_COLLECTION, normalized.id), normalized, { merge: true });
  } else if (normalized.id) {
    await deleteDoc(schoolDocRef(activeSchoolId, ATTENDANCE_COLLECTION, normalized.id));
  }

  return normalized;
}

export async function saveIncidentToFirestore(payload = {}, student = null) {
  const studentName = student
    ? `${String(student?.firstName || '').trim()} ${String(student?.lastName || '').trim()}`.trim()
    : String(payload?.studentName || '').trim();
  const createdAt = new Date().toISOString();
  const occurredAt = String(payload?.occurredAt || createdAt).trim();
  const normalized = normalizeIncidentRecord({
    ...payload,
    id: createRecordId('inc'),
    studentName,
    occurredAt,
    timestamp: createdAt,
    createdAt,
    readOnly: true,
  });

  await setDoc(schoolDocRef(activeSchoolId, INCIDENTS_COLLECTION, normalized.id), normalized, { merge: true });
  return normalized;
}

export async function saveMedicineLogToFirestore(payload = {}, student = null) {
  const studentName = student
    ? `${String(student?.firstName || '').trim()} ${String(student?.lastName || '').trim()}`.trim()
    : String(payload?.studentName || '').trim();
  const allergies = String(student?.allergies || payload?.allergies || 'None').trim();
  const createdAt = new Date().toISOString();
  const timeAdministered = String(payload?.timeAdministered || createdAt).trim();
  const normalized = normalizeMedicineLog({
    ...payload,
    id: createRecordId('med'),
    studentName,
    allergies,
    allergyWarning: hasAllergyWarning(payload?.medicationName || '', allergies),
    timeAdministered,
    createdAt,
  });

  await setDoc(schoolDocRef(activeSchoolId, MEDICINE_LOGS_COLLECTION, normalized.id), normalized, { merge: true });
  return normalized;
}

export async function saveGeneralLogToFirestore(payload = {}, student = null) {
  const studentName = student
    ? `${String(student?.firstName || '').trim()} ${String(student?.lastName || '').trim()}`.trim()
    : String(payload?.studentName || '').trim();
  const createdAt = new Date().toISOString();
  const occurredAt = String(payload?.occurredAt || createdAt).trim();
  const normalized = normalizeGeneralLog({
    ...payload,
    id: createRecordId('gen'),
    studentName,
    occurredAt,
    timestamp: createdAt,
    createdAt,
  });

  await setDoc(schoolDocRef(activeSchoolId, GENERAL_LOGS_COLLECTION, normalized.id), normalized, { merge: true });
  return normalized;
}

export async function seedStudentsToFirestore(students = []) {
  if (!Array.isArray(students) || students.length === 0) {
    return 0;
  }

  const batch = writeBatch(db);
  let count = 0;

  students.forEach((student) => {
    const studentId = String(student?.id || '').trim();
    if (!studentId) {
      return;
    }

    batch.set(schoolDocRef(activeSchoolId, STUDENTS_COLLECTION, studentId), normalizeStudent(student, studentId), { merge: true });
    count += 1;
  });

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

export async function seedAttendanceToFirestore(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 0;
  }

  const batch = writeBatch(db);
  let count = 0;

  entries.forEach((entry) => {
    const normalized = normalizeAttendanceEntry(entry);
    if (!normalized.id || !normalized.studentId || !normalized.date || !['Absent', 'Late'].includes(normalized.status)) {
      return;
    }

    batch.set(schoolDocRef(activeSchoolId, ATTENDANCE_COLLECTION, normalized.id), normalized, { merge: true });
    count += 1;
  });

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

export async function seedIncidentsToFirestore(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return 0;
  }

  const batch = writeBatch(db);
  let count = 0;

  records.forEach((record) => {
    const normalized = normalizeIncidentRecord(record);
    if (!normalized.id) {
      return;
    }

    batch.set(schoolDocRef(activeSchoolId, INCIDENTS_COLLECTION, normalized.id), normalized, { merge: true });
    count += 1;
  });

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

export async function seedMedicineLogsToFirestore(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return 0;
  }

  const batch = writeBatch(db);
  let count = 0;

  records.forEach((record) => {
    const normalized = normalizeMedicineLog(record);
    if (!normalized.id) {
      return;
    }

    batch.set(schoolDocRef(activeSchoolId, MEDICINE_LOGS_COLLECTION, normalized.id), normalized, { merge: true });
    count += 1;
  });

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

export async function seedGeneralLogsToFirestore(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return 0;
  }

  const batch = writeBatch(db);
  let count = 0;

  records.forEach((record) => {
    const normalized = normalizeGeneralLog(record);
    if (!normalized.id) {
      return;
    }

    batch.set(schoolDocRef(activeSchoolId, GENERAL_LOGS_COLLECTION, normalized.id), normalized, { merge: true });
    count += 1;
  });

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

export async function saveComplianceDocument(category, fileUri, fileName, notes, uploaderProfile) {
  const docId = createRecordId('cdoc');
  const safeFileName = String(fileName || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `schools/${normalizeSchoolId(activeSchoolId)}/compliance/${category}/${docId}-${safeFileName}`;
  const storageRef = ref(storage, storagePath);

  const response = await fetch(fileUri);
  const blob = await response.blob();
  await uploadBytes(storageRef, blob);
  const fileUrl = await getDownloadURL(storageRef);

  const data = {
    schoolId: normalizeSchoolId(activeSchoolId),
    id: docId,
    category: String(category || '').trim(),
    fileName: String(fileName || 'document').trim(),
    fileUrl,
    storagePath,
    notes: String(notes || '').trim(),
    uploadedAt: new Date().toISOString(),
    uploadedByUid: String(uploaderProfile?.uid || '').trim(),
    uploadedByEmail: String(uploaderProfile?.email || '').trim(),
  };

  await setDoc(schoolDocRef(activeSchoolId, COMPLIANCE_DOCS_COLLECTION, docId), data);
  return data;
}

export async function fetchComplianceDocuments(category) {
  const q = query(schoolCollectionRef(activeSchoolId, COMPLIANCE_DOCS_COLLECTION), where('category', '==', String(category || '').trim()));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => d.data())
    .sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
}

export async function deleteComplianceDocument(docId, storagePath) {
  const normalizedDocId = String(docId || '').trim();
  if (!normalizedDocId) return;

  await deleteDoc(schoolDocRef(activeSchoolId, COMPLIANCE_DOCS_COLLECTION, normalizedDocId));

  if (storagePath) {
    try {
      await deleteObject(ref(storage, storagePath));
    } catch {
      // Storage object may already be gone; Firestore deletion is authoritative
    }
  }
}

export async function saveActivityToFirestore(activityData, uploaderProfile, fileAsset) {
  const actId = createRecordId('act');
  let fileUrl = '';
  let fileName = '';
  let storagePath = '';

  if (fileAsset) {
    const safeFileName = String(fileAsset.name || 'bestand').replace(/[^a-zA-Z0-9._-]/g, '_');
    storagePath = `schools/${normalizeSchoolId(activeSchoolId)}/activities/${actId}-${safeFileName}`;
    const storageRef = ref(storage, storagePath);
    const response = await fetch(fileAsset.uri);
    const blob = await response.blob();
    await uploadBytes(storageRef, blob);
    fileUrl = await getDownloadURL(storageRef);
    fileName = safeFileName;
  }

  const normalized = normalizeActivity({
    ...activityData,
    id: actId,
    fileUrl,
    fileName,
    storagePath,
    loggedByUid: String(uploaderProfile?.uid || '').trim(),
    loggedByEmail: String(uploaderProfile?.email || '').trim(),
    loggedByName: String(uploaderProfile?.displayName || uploaderProfile?.email || '').trim(),
    createdAt: new Date().toISOString(),
  }, actId);

  await setDoc(schoolDocRef(activeSchoolId, ACTIVITIES_COLLECTION, actId), normalized);
  return normalized;
}

export async function fetchActivitiesFromFirestore() {
  const snapshot = await getDocs(schoolCollectionRef(activeSchoolId, ACTIVITIES_COLLECTION));
  const all = snapshot.docs.map((d) => normalizeActivity(d.data(), d.id));
  return all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function updateActivityInFirestore(activityId, updateData) {
  const normalizedId = String(activityId || '').trim();
  if (!normalizedId) throw new Error('Activity id is required to update.');

  const actRef = schoolDocRef(activeSchoolId, ACTIVITIES_COLLECTION, normalizedId);
  const snapshot = await getDoc(actRef);
  const existing = snapshot.exists() ? snapshot.data() : {};

  const merged = normalizeActivity({ ...existing, ...updateData, id: normalizedId });
  await setDoc(actRef, merged, { merge: true });
  return merged;
}

export async function deleteActivityFromFirestore(activityId, storagePath) {
  const normalizedId = String(activityId || '').trim();
  if (!normalizedId) return;

  await deleteDoc(schoolDocRef(activeSchoolId, ACTIVITIES_COLLECTION, normalizedId));

  if (storagePath) {
    try {
      await deleteObject(ref(storage, storagePath));
    } catch {
      // Storage object may already be gone; Firestore deletion is authoritative
    }
  }
}

export async function getCurrentSchoolConfig() {
  return fetchSchoolConfigById(activeSchoolId);
}

export async function updateCurrentSchoolFeatures(featureUpdates = {}, principalUid = '') {
  const schoolId = normalizeSchoolId(activeSchoolId);
  const currentConfig = await fetchSchoolConfigById(schoolId);
  const nextFeatures = buildDefaultSchoolFeatures({
    ...currentConfig.features,
    ...(featureUpdates && typeof featureUpdates === 'object' ? featureUpdates : {}),
  });

  await setDoc(doc(db, SCHOOLS_COLLECTION, schoolId), {
    id: schoolId,
    name: currentConfig.name || buildDefaultSchoolName(schoolId),
    principalUserUid: String(principalUid || currentConfig.principalUserUid || '').trim(),
    features: nextFeatures,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  return fetchSchoolConfigById(schoolId);
}

export async function updateCurrentSchoolMedicalVaultPassword(nextPassword = '', principalUid = '') {
  const schoolId = normalizeSchoolId(activeSchoolId);
  const currentConfig = await fetchSchoolConfigById(schoolId);
  const normalizedPassword = normalizeVaultPassword(nextPassword);

  await setDoc(doc(db, SCHOOLS_COLLECTION, schoolId), {
    id: schoolId,
    name: currentConfig.name || buildDefaultSchoolName(schoolId),
    principalUserUid: String(principalUid || currentConfig.principalUserUid || '').trim(),
    medicalVaultPassword: normalizedPassword,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  return fetchSchoolConfigById(schoolId);
}

export async function createManagedUserAccount(payload = {}) {
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '').trim();
  const displayName = String(payload?.displayName || '').trim() || email;
  const role = String(payload?.role || 'teacher').trim().toLowerCase();
  const allowedRoles = new Set(['principal', 'teacher', 'viewer', 'parent']);
  const safeRole = allowedRoles.has(role) ? role : 'teacher';
  const assignedClasses = Array.isArray(payload?.assignedClasses)
    ? payload.assignedClasses.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (!email) {
    throw new Error('Email is required.');
  }
  if (!password || password.length < 6) {
    throw new Error('Temporary password must be at least 6 characters.');
  }

  const secondaryAppName = `provision-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const credentials = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    if (displayName) {
      await updateProfile(credentials.user, { displayName });
    }

    const profile = {
      uid: credentials.user.uid,
      email,
      displayName,
      schoolId: normalizeSchoolId(activeSchoolId),
      schoolFeatures: buildDefaultSchoolFeatures(),
      role: safeRole,
      permissions: getDefaultPermissionsForRole(safeRole),
      isActive: true,
      assignedClasses,
      linkedStudentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, USERS_COLLECTION, credentials.user.uid), profile, { merge: true });
    return buildAccessProfile({ uid: credentials.user.uid, email, displayName }, profile);
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch {
      // no-op
    }
    await deleteApp(secondaryApp);
  }
}

export async function deleteUserAccessProfile(uid) {
  const normalizedUid = String(uid || '').trim();
  if (!normalizedUid) {
    throw new Error('User id is required to remove a user.');
  }
  await deleteDoc(doc(db, USERS_COLLECTION, normalizedUid));
}