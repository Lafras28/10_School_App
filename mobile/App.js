import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  DEFAULT_ROLE_PERMISSIONS,
  createManagedUserAccount,
  deleteActivityFromFirestore,
  deleteComplianceDocument,
  deleteStudentFromFirestore,
  fetchAttendanceHistoryForStudentFromFirestore,
  fetchAllAttendanceFromFirestore,
  fetchActivitiesFromFirestore,
  fetchAttendanceFromFirestore,
  fetchComplianceDocuments,
  fetchGeneralLogsFromFirestore,
  fetchGeneralLogsForStudentFromFirestore,
  fetchIncidentsForStudentFromFirestore,
  fetchIncidentsFromFirestore,
  fetchMedicineLogsForStudentFromFirestore,
  fetchMedicineLogsFromFirestore,
  fetchStudentsFromFirestore,
  fetchUserAccessProfiles,
  listenToAuthChanges,
  saveAttendanceToFirestore,
  saveActivityToFirestore,
  updateActivityInFirestore,
  saveComplianceDocument,
  saveGeneralLogToFirestore,
  saveIncidentToFirestore,
  saveMedicineLogToFirestore,
  saveStudentToFirestore,
  subscribeStudentsFromFirestore,
  seedAttendanceToFirestore,
  seedGeneralLogsToFirestore,
  seedIncidentsToFirestore,
  seedMedicineLogsToFirestore,
  seedStudentsToFirestore,
  signInUser,
  signOutCurrentUser,
  sendResetPasswordEmail,
  getCurrentSchoolConfig,
  updateCurrentUserCredentials,
  updateCurrentSchoolFeatures,
  updateCurrentSchoolEditDataPassword,
  updateCurrentSchoolMedicalVaultPassword,
  updateAttendanceEntryInFirestore,
  updateGeneralLogInFirestore,
  updateIncidentInFirestore,
  updateMedicineLogInFirestore,
  updateUserAccessProfile,
} from './firebaseConfig';
import styles from './styles/appStyles';

function resolveApiBaseUrl() {
  const configuredUrl = String(
    process.env.EXPO_PUBLIC_API_URL
      || Constants.expoConfig?.extra?.apiUrl
      || '',
  ).trim().replace(/\/+$/, '');

  if (configuredUrl) {
    return configuredUrl;
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:5000';
  }

  const hostUri = String(
    Constants.expoConfig?.hostUri
      || Constants.manifest2?.extra?.expoGo?.debuggerHost
      || Constants.manifest?.debuggerHost
      || '',
  ).trim();

  const host = hostUri.split(':')[0];
  return host ? `http://${host}:5000` : 'http://127.0.0.1:5000';
}

const API_BASE_URL = resolveApiBaseUrl();
const Stack = createNativeStackNavigator();
const FORM_PLACEHOLDER_COLOR = '#334E68';
const TODAY = new Date().toISOString().split('T')[0];
const DEFAULT_SCHOOL_NAME = 'Greenhill';
const PARENT_ABSENT_REASON = 'Parent marked absent in app';
const HISTORY_CACHE_KEY_PREFIX = 'schoolapp:history-cache:';

function getHistoryCacheKey(studentId, historyType) {
  return `${HISTORY_CACHE_KEY_PREFIX}${studentId}:${historyType}`;
}

async function loadHistoryFromCache(studentId, historyType) {
  try {
    const key = getHistoryCacheKey(studentId, historyType);
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

async function saveHistoryToCache(studentId, historyType, data) {
  try {
    const key = getHistoryCacheKey(studentId, historyType);
    await AsyncStorage.setItem(key, JSON.stringify(Array.isArray(data) ? data : []));
  } catch (_e) {
    /* ignore */
  }
}
const STUDENTS_CACHE_KEY_PREFIX = 'schoolapp:students-cache:';
const SAVED_CREDENTIALS_KEY = 'schoolapp:saved-credentials';

function getCurrentLocalDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getCurrentLocalTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function isAttendanceDateEditable(registerDate) {
  return String(registerDate || '').trim() === getCurrentLocalDateString();
}

function isValidTimeValue(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());
}

function buildIncidentOccurredAt(dateValue, timeValue) {
  const normalizedDate = String(dateValue || '').trim();
  const normalizedTime = String(timeValue || '').trim();
  if (!normalizedDate || !isValidTimeValue(normalizedTime)) {
    return '';
  }

  const [year, month, day] = normalizedDate.split('-').map((part) => parseInt(part, 10));
  const [hours, minutes] = normalizedTime.split(':').map((part) => parseInt(part, 10));
  const occurredAt = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);

  if (Number.isNaN(occurredAt.getTime())) {
    return '';
  }

  return occurredAt.toISOString();
}
const CLASSROOM_OPTIONS = ['All Classes', 'Sunshine Bunnies', 'Rainbow Cubs', 'Little Explorers'];
const ROLE_OPTIONS = ['principal', 'teacher', 'viewer', 'parent'];
const COMPLIANCE_FOLDERS = [
  { key: 'evacuation_plan', label: 'Emergency Evacuation Plan', description: 'Fire and emergency evacuation routes and procedures' },
  { key: 'fire_safety', label: 'Fire Safety Certificate', description: 'Annual fire safety inspection certificates' },
  { key: 'health_safety', label: 'Health & Safety Policy', description: 'Health and safety policy documentation' },
  { key: 'dsd_registration', label: 'DSD Registration Certificate', description: 'Department of Social Development registration and renewals' },
  { key: 'child_protection', label: 'Child Protection Policy', description: 'Child protection and safeguarding policy documents' },
  { key: 'first_aid', label: 'First Aid Records', description: 'First aid qualifications and incident records' },
  { key: 'nutrition_menu', label: 'Nutrition & Menu Plan', description: 'Approved menus and nutrition guidelines' },
  { key: 'practitioner_register', label: 'Practitioner Registers', description: 'Staff qualifications, registers, and attendance records' },
];
const MANAGEABLE_PERMISSION_OPTIONS = [
  { key: 'canEditStudents', label: 'Edit students' },
  { key: 'canEditOwnChildMedicalInfo', label: 'Edit child medical' },
  { key: 'canTakeAttendance', label: 'Attendance' },
  { key: 'canLogIncidents', label: 'Incidents' },
  { key: 'canLogMedicine', label: 'Medicine' },
  { key: 'canLogGeneral', label: 'General' },
  { key: 'canExportReports', label: 'Reports' },
  { key: 'canManageUsers', label: 'Manage users' },
];
const AccessContext = createContext({
  uid: '',
  email: '',
  displayName: 'Staff Member',
  schoolId: 'greenhill',
  schoolFeatures: {
    students: true,
    activities: false,
    staffAccess: true,
    compliance: false,
    pdfExport: true,
  },
  role: 'teacher',
  permissions: DEFAULT_ROLE_PERMISSIONS.teacher,
  linkedStudentIds: [],
});

function useAccessProfile() {
  return useContext(AccessContext);
}

function hasPermission(accessProfile, permission) {
  return Boolean(accessProfile?.permissions?.[permission]);
}

function isSchoolFeatureEnabled(accessProfile, featureKey) {
  const features = accessProfile?.schoolFeatures;
  if (!features || typeof features !== 'object') {
    return true;
  }

  return features[featureKey] !== false;
}

function isParentRole(accessProfile) {
  return String(accessProfile?.role || '').trim().toLowerCase() === 'parent';
}

function formatCompactDateDisplay(year, month, day) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = Math.max(0, Math.min(11, parseInt(month, 10) - 1));
  return `${months[monthIndex]} ${parseInt(day, 10)}, ${year}`;
}

function CompactDatePickerModal({ visible, onClose, onDateSelect, currentYear: cy, currentMonth: cm, currentDay: cd }) {
  const [tempYear, setTempYear] = useState(String(cy));
  const [tempMonth, setTempMonth] = useState(cm);
  const [tempDay, setTempDay] = useState(cd);
  const yearOptions = Array.from({ length: 11 }, (_, index) => String(Number(cy) - 5 + index));
  const monthOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const dayOptions = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

  useEffect(() => {
    setTempYear(String(cy));
    setTempMonth(cm);
    setTempDay(cd);
  }, [cy, cm, cd, visible]);

  const handleConfirm = () => {
    onDateSelect(tempYear, tempMonth, tempDay);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.datePickerModalRoot}>
        <TouchableOpacity style={styles.datePickerBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.datePickerModalCenter} pointerEvents="box-none">
          <View style={styles.datePickerModalCard}>
            <Text style={styles.datePickerModalTitle}>Select Date</Text>

            <View style={styles.compactDatePickerRow}>
              <CompactDatePickerColumn
                items={yearOptions}
                selectedValue={tempYear}
                onSelect={setTempYear}
                label="Year"
              />
              <CompactDatePickerColumn
                items={monthOptions}
                selectedValue={tempMonth}
                onSelect={setTempMonth}
                label="Month"
              />
              <CompactDatePickerColumn
                items={dayOptions}
                selectedValue={tempDay}
                onSelect={setTempDay}
                label="Day"
              />
            </View>

            <View style={styles.datePickerModalButtonRow}>
              <TouchableOpacity style={styles.datePickerModalCancelBtn} onPress={onClose}>
                <Text style={styles.datePickerModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.datePickerModalConfirmBtn} onPress={handleConfirm}>
                <Text style={styles.datePickerModalConfirmText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getLinkedStudentIds(accessProfile) {
  return Array.isArray(accessProfile?.linkedStudentIds)
    ? accessProfile.linkedStudentIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
}

function canAccessStudent(accessProfile, studentOrId) {
  if (!isParentRole(accessProfile)) {
    return true;
  }

  const studentId = typeof studentOrId === 'string'
    ? String(studentOrId || '').trim()
    : String(studentOrId?.id || '').trim();

  return getLinkedStudentIds(accessProfile).includes(studentId);
}

function filterStudentsByAccess(students, accessProfile) {
  if (!isParentRole(accessProfile)) {
    return Array.isArray(students) ? students : [];
  }

  const linkedIds = new Set(getLinkedStudentIds(accessProfile));
  return (Array.isArray(students) ? students : []).filter((student) => linkedIds.has(String(student?.id || '').trim()));
}

function filterRecordsByAccess(records, accessProfile) {
  if (!isParentRole(accessProfile)) {
    return Array.isArray(records) ? records : [];
  }

  const linkedIds = new Set(getLinkedStudentIds(accessProfile));
  return (Array.isArray(records) ? records : []).filter((record) => linkedIds.has(String(record?.studentId || '').trim()));
}

function formatRoleLabel(role = 'teacher') {
  const normalizedRole = String(role || 'teacher').trim();
  return normalizedRole ? `${normalizedRole.charAt(0).toUpperCase()}${normalizedRole.slice(1)}` : 'Teacher';
}

function formatAuthError(error) {
  const code = String(error?.code || '').trim();

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Incorrect email or password.';
  }

  if (code === 'auth/invalid-email') {
    return 'Enter a valid email address.';
  }

  if (code === 'auth/too-many-requests') {
    return 'Too many login attempts. Please wait and try again.';
  }

  return error?.message || 'Could not sign in.';
}

function getStudentFullName(student) {
  return `${student?.firstName || ''} ${student?.lastName || ''}`.trim();
}

function getClassroomName(student) {
  const className = String(student?.className || '').trim();
  return className || 'Sunshine Bunnies';
}

function formatDateTime(value) {
  if (!value) {
    return 'Not recorded';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value);
  }

  return parsedDate.toLocaleString();
}

function formatPhoneForDisplay(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return 'No number saved';
  }

  const digitsOnly = rawValue.replace(/\D+/g, '');
  if (!digitsOnly) {
    return rawValue;
  }

  let normalized = digitsOnly;
  if (normalized.startsWith('27') && normalized.length === 11) {
    normalized = `0${normalized.slice(2)}`;
  }

  if (normalized.length === 10 && normalized.startsWith('0')) {
    return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6)}`;
  }

  return rawValue;
}

function doesMedicationTriggerAllergy(medicationName, allergies) {
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

async function withTimeout(taskPromise, timeoutMs = 12000, timeoutMessage = 'Request timed out. Please try again.') {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function getStudentsCacheKey(accessProfile) {
  const schoolId = String(accessProfile?.schoolId || DEFAULT_SCHOOL_NAME || 'default-school').trim().toLowerCase();
  return `${STUDENTS_CACHE_KEY_PREFIX}${schoolId || 'default-school'}`;
}

async function loadStudentsFromCache(accessProfile) {
  try {
    const raw = await AsyncStorage.getItem(getStudentsCacheKey(accessProfile));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Could not load cached students.', error);
    return [];
  }
}

async function saveStudentsToCache(accessProfile, students) {
  try {
    const safeStudents = Array.isArray(students) ? students : [];
    await AsyncStorage.setItem(getStudentsCacheKey(accessProfile), JSON.stringify(safeStudents));
  } catch (error) {
    console.warn('Could not save students cache.', error);
  }
}

async function fetchJson(url, options = {}) {
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(
      `Could not reach the backend at ${API_BASE_URL}. For phone use away from your laptop, set EXPO_PUBLIC_API_URL to your hosted backend URL.`,
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data && typeof data === 'object'
      ? data.error || data.message || 'Request failed.'
      : 'Request failed.';
    throw new Error(message);
  }

  return data;
}

async function loadStudentsFromDataStore() {
  try {
    const firestoreStudents = await fetchStudentsFromFirestore();
    if (Array.isArray(firestoreStudents)) {
      return firestoreStudents;
    }
  } catch (error) {
    console.warn('Firestore students unavailable, using backend fallback.', error);
  }

  const fallbackData = await fetchJson(`${API_BASE_URL}/students`);
  const nextStudents = Array.isArray(fallbackData) ? fallbackData : [];

  if (nextStudents.length > 0) {
    try {
      await seedStudentsToFirestore(nextStudents);
    } catch (error) {
      console.warn('Could not seed Firestore from backend data.', error);
    }
  }

  return nextStudents;
}

async function saveStudentRecord(mode, payload, initialStudent) {
  try {
    return await saveStudentToFirestore(payload, mode === 'edit' ? initialStudent?.id : '');
  } catch (firestoreError) {
    console.warn('Firestore save failed, using backend fallback.', firestoreError);

    const endpoint = mode === 'edit'
      ? `${API_BASE_URL}/students/${initialStudent.id}`
      : `${API_BASE_URL}/students`;
    const method = mode === 'edit' ? 'PUT' : 'POST';

    const data = await fetchJson(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return data?.student || payload;
  }
}

async function deleteStudentRecord(studentId) {
  const normalizedId = String(studentId || '').trim();
  if (!normalizedId) {
    throw new Error('Student ID is required to remove a learner.');
  }

  const deleteFromBackend = async (timeoutMs = 8000) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutHandle = setTimeout(() => {
      if (controller) {
        controller.abort();
      }
    }, timeoutMs);

    try {
      await fetchJson(`${API_BASE_URL}/students/${normalizedId}`, {
        method: 'DELETE',
        ...(controller ? { signal: controller.signal } : {}),
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  let firestoreError = null;
  try {
    await deleteStudentFromFirestore(normalizedId);
    // If Firestore succeeds, complete immediately so the UI never feels stuck.
    deleteFromBackend(5000).catch((backendError) => {
      console.warn('Backend student delete sync skipped after Firestore delete.', backendError);
    });
    return true;
  } catch (error) {
    firestoreError = error;
    console.warn('Firestore student delete failed, trying backend fallback.', error);
  }

  try {
    await deleteFromBackend(10000);
    return true;
  } catch (backendError) {
    const firestoreMessage = firestoreError?.message ? ` Firestore: ${firestoreError.message}` : '';
    const backendMessage = backendError?.message ? ` Backend: ${backendError.message}` : '';
    throw new Error(`Could not remove learner.${firestoreMessage}${backendMessage}`.trim());
  }
}

function buildDefaultAttendanceEntries(registerDate, students = []) {
  return (Array.isArray(students) ? students : [])
    .map((student) => ({
      id: `${String(registerDate || '').trim()}_${String(student?.id || '').trim()}`,
      date: String(registerDate || '').trim(),
      studentId: String(student?.id || '').trim(),
      studentName: getStudentFullName(student) || String(student?.id || 'Unknown Student'),
      className: getClassroomName(student),
      status: 'Present',
      reason: '',
      createdAt: new Date().toISOString(),
    }))
    .filter((entry) => entry.studentId)
    .sort((left, right) => String(left.studentName || '').localeCompare(String(right.studentName || '')));
}

async function loadAttendanceFromDataStore(registerDate, students = []) {
  const defaultEntries = buildDefaultAttendanceEntries(registerDate, students);

  const mergeAttendanceEntries = (savedEntries = []) => {
    const mergedEntries = new Map(defaultEntries.map((defaultEntry) => [defaultEntry.studentId, defaultEntry]));

    (Array.isArray(savedEntries) ? savedEntries : []).forEach((entry) => {
      const studentId = String(entry?.studentId || '').trim();
      if (!studentId) {
        return;
      }

      const normalizedStatus = String(entry?.status || 'Present').trim();
      mergedEntries.set(studentId, {
        ...(mergedEntries.get(studentId) || {}),
        ...entry,
        studentId,
        status: normalizedStatus || 'Present',
        reason: ['Absent', 'Late'].includes(normalizedStatus) ? String(entry?.reason || '').trim() : '',
      });
    });

    return Array.from(mergedEntries.values())
      .filter((entry) => entry.studentId)
      .sort((left, right) => String(left.studentName || '').localeCompare(String(right.studentName || '')));
  };

  try {
    const firestoreEntries = await fetchAttendanceFromFirestore(registerDate);
    if (Array.isArray(firestoreEntries)) {
      return mergeAttendanceEntries(firestoreEntries);
    }
  } catch (error) {
    console.warn('Firestore attendance unavailable, using fallback data.', error);
  }

  try {
    const fallbackData = await fetchJson(`${API_BASE_URL}/attendance?date=${registerDate}`);
    const nextEntries = Array.isArray(fallbackData?.entries) ? fallbackData.entries : [];

    if (nextEntries.length > 0) {
      try {
        await seedAttendanceToFirestore(nextEntries);
      } catch (error) {
        console.warn('Could not seed Firestore attendance from backend data.', error);
      }
      return mergeAttendanceEntries(nextEntries);
    }
  } catch (error) {
    console.warn('Backend attendance unavailable, generating defaults from student data.', error);
  }

  return defaultEntries;
}

async function saveAttendanceRecord(registerDate, entry, status, reason = '') {
  if (!isAttendanceDateEditable(registerDate)) {
    throw new Error('Attendance locks at 12:00 AM. Only today\'s attendance can still be updated.');
  }

  const normalizedStatus = String(status || entry?.status || 'Present').trim() || 'Present';
  const normalizedReason = ['Absent', 'Late'].includes(normalizedStatus) ? String(reason || '').trim() : '';
  const clientLocalDate = getCurrentLocalDateString();
  const optimisticEntry = {
    ...entry,
    date: String(registerDate || entry?.date || '').trim(),
    status: normalizedStatus,
    reason: normalizedReason,
    updatedAt: new Date().toISOString(),
  };

  try {
    const savedFirestoreEntry = await saveAttendanceToFirestore(registerDate, entry, normalizedStatus, normalizedReason);

    // Keep backend fallback storage aligned so staff still sees latest attendance when Firestore is unavailable.
    try {
      await fetchJson(`${API_BASE_URL}/attendance/${registerDate}/${entry.studentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: normalizedStatus, reason: normalizedReason, clientLocalDate }),
      });
    } catch (backendSyncError) {
      console.warn('Backend attendance sync skipped after Firestore save.', backendSyncError);
    }

    return savedFirestoreEntry;
  } catch (firestoreError) {
    console.warn('Firestore attendance save failed, using backend fallback.', firestoreError);

    const data = await fetchJson(`${API_BASE_URL}/attendance/${registerDate}/${entry.studentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: normalizedStatus, reason: normalizedReason, clientLocalDate }),
    });

    return data?.entry ? { ...optimisticEntry, ...data.entry } : optimisticEntry;
  }
}

async function loadIncidentsFromDataStore() {
  try {
    const firestoreIncidents = await fetchIncidentsFromFirestore();
    if (Array.isArray(firestoreIncidents)) {
      return firestoreIncidents;
    }
  } catch (error) {
    console.warn('Firestore incidents unavailable, using backend fallback.', error);
  }

  const fallbackData = await fetchJson(`${API_BASE_URL}/incidents`);
  const nextIncidents = Array.isArray(fallbackData) ? fallbackData : [];

  if (nextIncidents.length > 0) {
    try {
      await seedIncidentsToFirestore(nextIncidents);
    } catch (error) {
      console.warn('Could not seed Firestore incidents from backend data.', error);
    }
  }

  return nextIncidents;
}

async function saveIncidentRecord(payload, student = null) {
  try {
    return await saveIncidentToFirestore(payload, student);
  } catch (firestoreError) {
    console.warn('Firestore incident save failed, using backend fallback.', firestoreError);

    const data = await fetchJson(`${API_BASE_URL}/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return data?.incident || payload;
  }
}

async function loadMedicineLogsFromDataStore() {
  try {
    const firestoreLogs = await fetchMedicineLogsFromFirestore();
    if (Array.isArray(firestoreLogs)) {
      return firestoreLogs;
    }
  } catch (error) {
    console.warn('Firestore medicine logs unavailable, using backend fallback.', error);
  }

  const fallbackData = await fetchJson(`${API_BASE_URL}/medicine`);
  const nextLogs = Array.isArray(fallbackData) ? fallbackData : [];

  if (nextLogs.length > 0) {
    try {
      await seedMedicineLogsToFirestore(nextLogs);
    } catch (error) {
      console.warn('Could not seed Firestore medicine logs from backend data.', error);
    }
  }

  return nextLogs;
}

async function loadGeneralLogsFromDataStore() {
  try {
    const firestoreLogs = await fetchGeneralLogsFromFirestore();
    if (Array.isArray(firestoreLogs)) {
      return firestoreLogs;
    }
  } catch (error) {
    console.warn('Firestore general logs unavailable, using backend fallback.', error);
  }

  const fallbackData = await fetchJson(`${API_BASE_URL}/general-logs`);
  const nextLogs = Array.isArray(fallbackData) ? fallbackData : [];

  if (nextLogs.length > 0) {
    try {
      await seedGeneralLogsToFirestore(nextLogs);
    } catch (error) {
      console.warn('Could not seed Firestore general logs from backend data.', error);
    }
  }

  return nextLogs;
}

async function loadAttendanceHistoryForStudentFromDataStore(studentId, options = {}) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    return [];
  }

  const defaultEndDate = TODAY;
  const defaultStartDate = new Date(Date.now() - (365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
  const startDate = String(options?.startDate || defaultStartDate).trim();
  const endDate = String(options?.endDate || defaultEndDate).trim();
  const mergedEntries = new Map();

  try {
    const firestoreEntries = await fetchAttendanceHistoryForStudentFromFirestore(normalizedStudentId);
    firestoreEntries.forEach((entry) => {
      const key = String(entry?.id || `${entry?.date || ''}_${entry?.studentId || ''}`).trim();
      if (key) {
        mergedEntries.set(key, entry);
      }
    });
  } catch (error) {
    console.warn('Firestore learner attendance history unavailable, checking backend fallback.', error);
  }

  try {
    const fallbackData = await fetchJson(
      `${API_BASE_URL}/attendance/history?studentId=${encodeURIComponent(normalizedStudentId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    );
    const fallbackEntries = Array.isArray(fallbackData?.entries) ? fallbackData.entries : [];
    fallbackEntries.forEach((entry) => {
      const key = String(entry?.id || `${entry?.date || ''}_${entry?.studentId || ''}`).trim();
      if (!key) {
        return;
      }

      mergedEntries.set(key, {
        ...entry,
        id: key,
      });
    });
  } catch (error) {
    console.warn('Backend learner attendance history unavailable.', error);
  }

  return Array.from(mergedEntries.values())
    .filter((entry) => String(entry?.studentId || '').trim() === normalizedStudentId)
    .sort((left, right) => String(right?.date || right?.createdAt || '').localeCompare(String(left?.date || left?.createdAt || '')));
}

async function loadIncidentsForStudentFromDataStore(studentId) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    return [];
  }

  try {
    return await fetchIncidentsForStudentFromFirestore(normalizedStudentId);
  } catch (error) {
    console.warn('Firestore learner incidents unavailable, using broader fallback.', error);
    const incidents = await loadIncidentsFromDataStore();
    return incidents.filter((entry) => String(entry?.studentId || '').trim() === normalizedStudentId);
  }
}

async function loadMedicineLogsForStudentFromDataStore(studentId) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    return [];
  }

  try {
    return await fetchMedicineLogsForStudentFromFirestore(normalizedStudentId);
  } catch (error) {
    console.warn('Firestore learner medicine logs unavailable, using broader fallback.', error);
    const logs = await loadMedicineLogsFromDataStore();
    return logs.filter((entry) => String(entry?.studentId || '').trim() === normalizedStudentId);
  }
}

async function loadGeneralLogsForStudentFromDataStore(studentId) {
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedStudentId) {
    return [];
  }

  try {
    return await fetchGeneralLogsForStudentFromFirestore(normalizedStudentId);
  } catch (error) {
    console.warn('Firestore learner general logs unavailable, using broader fallback.', error);
    const logs = await loadGeneralLogsFromDataStore();
    return logs.filter((entry) => String(entry?.studentId || '').trim() === normalizedStudentId);
  }
}

async function saveMedicineLogRecord(payload, student = null) {
  try {
    return await saveMedicineLogToFirestore(payload, student);
  } catch (firestoreError) {
    console.warn('Firestore medicine save failed, using backend fallback.', firestoreError);

    const data = await fetchJson(`${API_BASE_URL}/medicine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return data?.entry || payload;
  }
}

async function saveGeneralLogRecord(payload, student = null) {
  try {
    return await saveGeneralLogToFirestore(payload, student);
  } catch (firestoreError) {
    console.warn('Firestore general log save failed, using backend fallback.', firestoreError);

    const data = await fetchJson(`${API_BASE_URL}/general-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return data?.entry || payload;
  }
}

async function updateAttendanceHistoryEntry(entryId, updates = {}) {
  return updateAttendanceEntryInFirestore(entryId, updates);
}

async function updateIncidentHistoryEntry(entryId, updates = {}) {
  return updateIncidentInFirestore(entryId, updates);
}

async function updateMedicineHistoryEntry(entryId, updates = {}) {
  return updateMedicineLogInFirestore(entryId, updates);
}

async function updateGeneralHistoryEntry(entryId, updates = {}) {
  return updateGeneralLogInFirestore(entryId, updates);
}

function LoginScreen({ onLogin, isBusy }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(SAVED_CREDENTIALS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (saved?.email) setIdentifier(saved.email);
        if (saved?.password) setPassword(saved.password);
      } catch (_e) { /* ignore */ }
    });
  }, []);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Missing Details', 'Enter your staff email and password.');
      return;
    }

    try {
      setErrorMessage('');
      await onLogin(identifier.trim(), password);
      AsyncStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify({ email: identifier.trim(), password }));
    } catch (error) {
      setErrorMessage(formatAuthError(error));
    }
  };

  const handleForgotPassword = async () => {
    const email = String(identifier || '').trim().toLowerCase();
    if (!email) {
      setForgotError('Enter your email address first.');
      setForgotMessage('');
      Alert.alert('Email Required', 'Enter your email address first, then tap Forgot password.');
      return;
    }

    try {
      setForgotBusy(true);
      setForgotError('');
      setForgotMessage('Sending reset link...');
      await sendResetPasswordEmail(email);
      setForgotMessage('If this email is registered, a reset link has been sent. Check inbox and spam folder.');
      Alert.alert('Reset Email Sent', 'Check your inbox for the password reset link.');
    } catch (error) {
      const code = String(error?.code || '').trim();
      if (code === 'auth/invalid-email') {
        setForgotError('Please enter a valid email address.');
        setForgotMessage('');
        Alert.alert('Invalid Email', 'Please enter a valid email address.');
        return;
      }
      setForgotError(error.message || 'Could not send password reset email.');
      setForgotMessage('');
      Alert.alert('Could Not Send', error.message || 'Could not send password reset email.');
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.loginScreenContainer}>
      <View style={styles.loginCard}>
        <Text style={styles.loginTitle}>Greenhill Login</Text>
        <Text style={styles.loginSubtitle}>Sign in with your staff email and password. Your role controls what you can edit.</Text>

        <TextInput
          style={styles.formInput}
          placeholder="Staff Email"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType="email-address"
          onSubmitEditing={handleLogin}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Password"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={[styles.loginButton, isBusy && styles.saveStudentButtonDisabled]}
          onPress={handleLogin}
          disabled={isBusy || forgotBusy}
        >
          <Text style={styles.saveStudentButtonText}>{isBusy ? 'Signing In...' : 'Log In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginForgotButton} onPress={handleForgotPassword} disabled={isBusy || forgotBusy}>
          <Text style={styles.loginForgotText}>{forgotBusy ? 'Sending reset link...' : 'Forgot password?'}</Text>
        </TouchableOpacity>

        {forgotMessage ? <Text style={styles.loginInfoText}>{forgotMessage}</Text> : null}
        {forgotError ? <Text style={styles.loginErrorText}>{forgotError}</Text> : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

function StudentAutocomplete({
  students,
  selectedStudentId,
  onSelect,
  onStudentChosen,
  placeholder = 'Search learner by name or ID',
  helperText = 'Start typing to find a learner quickly.',
}) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId],
  );

  useEffect(() => {
    if (selectedStudent) {
      setQuery(getStudentFullName(selectedStudent));
    }
  }, [selectedStudent]);

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const pool = students.filter((student) => {
      const name = getStudentFullName(student).toLowerCase();
      const studentId = String(student.id || '').toLowerCase();
      return name.includes(normalizedQuery) || studentId.includes(normalizedQuery);
    });

    return pool.slice(0, 12);
  }, [query, students]);

  const handleSelect = (student) => {
    onSelect(student.id);
    setQuery(getStudentFullName(student));
    setShowSuggestions(false);

    if (typeof onStudentChosen === 'function') {
      onStudentChosen(student);
    }
  };

  const handleClearSearch = () => {
    onSelect('');
    setQuery('');
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.autocompleteContainer}>
      <View style={styles.searchInputRow}>
        <TextInput
          style={styles.autocompleteTextInput}
          placeholder={placeholder}
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={query}
          onFocus={() => setShowSuggestions(true)}
          onChangeText={(text) => {
            setQuery(text);
            setShowSuggestions(true);
          }}
        />
        {query.trim() ? (
          <TouchableOpacity style={styles.clearSearchButton} onPress={handleClearSearch}>
            <Text style={styles.clearSearchButtonText}>×</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {showSuggestions && query.trim() ? (
        <View style={styles.autocompleteResults}>
          {suggestions.length > 0 ? (
            <ScrollView nestedScrollEnabled style={styles.autocompleteScrollArea} keyboardShouldPersistTaps="handled">
              {suggestions.map((student) => (
                <TouchableOpacity
                  key={student.id}
                  style={styles.autocompleteItem}
                  onPress={() => handleSelect(student)}
                >
                  <Text style={styles.autocompleteName}>{getStudentFullName(student)}</Text>
                  <Text style={styles.autocompleteMeta}>{getClassroomName(student)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.autocompleteEmpty}>No learners match that search.</Text>
          )}
        </View>
      ) : null}

      <Text style={styles.selectedLearnerText}>
        {selectedStudent
          ? `Selected learner: ${getStudentFullName(selectedStudent)} • ${getClassroomName(selectedStudent)}`
          : helperText}
      </Text>
    </View>
  );
}

function LinkedStudentPicker({
  students,
  linkedStudentIds,
  onToggleStudent,
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const normalizedLinkedIds = useMemo(
    () => (Array.isArray(linkedStudentIds) ? linkedStudentIds : []).map((value) => String(value || '').trim()).filter(Boolean),
    [linkedStudentIds],
  );

  const linkedIdSet = useMemo(() => new Set(normalizedLinkedIds), [normalizedLinkedIds]);

  const linkedStudents = useMemo(
    () => (Array.isArray(students) ? students : [])
      .filter((student) => linkedIdSet.has(String(student?.id || '').trim()))
      .sort((left, right) => getStudentFullName(left).localeCompare(getStudentFullName(right))),
    [students, linkedIdSet],
  );

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return (Array.isArray(students) ? students : [])
      .filter((student) => {
        const name = getStudentFullName(student).toLowerCase();
        const studentId = String(student?.id || '').toLowerCase();
        return name.includes(normalizedQuery) || studentId.includes(normalizedQuery);
      })
      .sort((left, right) => getStudentFullName(left).localeCompare(getStudentFullName(right)))
      .slice(0, 8);
  }, [query, students]);

  const handleClear = () => {
    setQuery('');
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  const handleSelect = (student) => {
    onToggleStudent(student.id);
    setQuery('');
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.autocompleteContainer}>
      <View style={styles.searchInputRow}>
        <TextInput
          style={styles.autocompleteTextInput}
          placeholder="Search learner to link to this parent"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={query}
          onFocus={() => setShowSuggestions(true)}
          onChangeText={(text) => {
            setQuery(text);
            setShowSuggestions(true);
          }}
          editable={!disabled}
        />
        {query.trim() ? (
          <TouchableOpacity style={styles.clearSearchButton} onPress={handleClear} disabled={disabled}>
            <Text style={styles.clearSearchButtonText}>×</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {showSuggestions && query.trim() ? (
        <View style={styles.autocompleteResults}>
          {suggestions.length > 0 ? (
            <ScrollView nestedScrollEnabled style={styles.autocompleteScrollArea} keyboardShouldPersistTaps="handled">
              {suggestions.map((student) => {
                const isLinked = linkedIdSet.has(String(student?.id || '').trim());
                return (
                  <TouchableOpacity
                    key={student.id}
                    style={styles.autocompleteItem}
                    onPress={() => handleSelect(student)}
                    disabled={disabled}
                  >
                    <Text style={styles.autocompleteName}>{getStudentFullName(student)}</Text>
                    <Text style={styles.autocompleteMeta}>
                      {getClassroomName(student)}{isLinked ? ' • linked' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.autocompleteEmpty}>No learners match that search.</Text>
          )}
        </View>
      ) : null}

      <Text style={styles.selectedLearnerText}>
        {linkedStudents.length > 0
          ? 'Linked learners: tap a chip below to remove one if needed.'
          : 'Search above to link one or more learners to this parent account.'}
      </Text>

      {linkedStudents.length > 0 ? (
        <View style={styles.actionRow}>
          {linkedStudents.map((student) => (
            <TouchableOpacity
              key={`linked-${student.id}`}
              style={[styles.chipButton, styles.chipButtonSelected]}
              onPress={() => onToggleStudent(student.id)}
              disabled={disabled}
            >
              <Text style={[styles.chipButtonText, styles.selectedActionText]}>{getStudentFullName(student) || student.id} ×</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [accessProfile, setAccessProfile] = useState({
    uid: '',
    email: '',
    displayName: 'Staff Member',
    schoolId: 'greenhill',
    schoolFeatures: {
      students: true,
      activities: false,
      staffAccess: true,
      compliance: false,
      pdfExport: true,
    },
    role: 'teacher',
    permissions: DEFAULT_ROLE_PERMISSIONS.teacher,
    linkedStudentIds: [],
  });

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((user, profile) => {
      setAuthUser(user);
      setAccessProfile(profile || {
        uid: '',
        email: '',
        displayName: 'Staff Member',
        schoolId: 'greenhill',
        schoolFeatures: {
          students: true,
          activities: false,
          staffAccess: true,
          compliance: false,
          pdfExport: true,
        },
        role: 'teacher',
        permissions: DEFAULT_ROLE_PERMISSIONS.teacher,
        linkedStudentIds: [],
      });
      setAuthReady(true);
      setAuthBusy(false);
    });

    return unsubscribe;
  }, []);

  const handleLogin = async (email, password) => {
    setAuthBusy(true);
    try {
      const result = await signInUser(email, password);
      setAuthUser(result.user);
      setAccessProfile(result.accessProfile);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);
    try {
      await signOutCurrentUser();
    } finally {
      setAuthBusy(false);
    }
  };

  // Auto-logout after 30 minutes of being signed in
  useEffect(() => {
    if (!authUser) return;
    const timer = setTimeout(() => { handleLogout(); }, 30 * 60 * 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  if (!authReady) {
    return (
      <SafeAreaView style={styles.loginScreenContainer}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>Loading access...</Text>
          <Text style={styles.loginSubtitle}>Checking your sign-in details.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!authUser) {
    return <LoginScreen onLogin={handleLogin} isBusy={authBusy} />;
  }

  const loginIdentity = accessProfile.displayName || authUser.email || 'Staff Member';

  return (
    <AccessContext.Provider value={accessProfile}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: '#102A43' },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '700' },
          }}
        >
        <Stack.Screen
          name="Home"
          options={{ title: 'School Safety', headerBackVisible: false, headerLeft: () => null }}
        >
          {(props) => <HomeScreen {...props} onLogout={handleLogout} loginIdentity={loginIdentity} />}
        </Stack.Screen>
        <Stack.Screen
          name="ProfileSettings"
          component={ProfileSettingsScreen}
          options={{ title: 'Profile & Settings' }}
        />
        <Stack.Screen
          name="SchoolSettings"
          component={SchoolSettingsScreen}
          options={{ title: 'School Settings' }}
        />
        <Stack.Screen
          name="ManageUsers"
          component={ManageUsersScreen}
          options={{ title: 'Staff Access' }}
        />
        <Stack.Screen
          name="StudentDirectory"
          component={StudentDirectoryScreen}
          options={{ title: 'Students' }}
        />
          <Stack.Screen
            name="EmergencyProfile"
            component={EmergencyProfileScreen}
            options={{ title: 'Emergency Profile' }}
          />
          <Stack.Screen
            name="StudentForm"
            component={StudentFormScreen}
            options={({ route }) => ({
              title: route.params?.mode === 'edit' ? 'Edit Student' : 'Add Student',
            })}
          />
          <Stack.Screen
            name="StudentClassFolder"
            component={StudentClassFolderScreen}
            options={({ route }) => ({
              title: route.params?.className || 'Class Folder',
            })}
          />
          <Stack.Screen
            name="GeneralCommunication"
            component={GeneralCommunicationScreen}
            options={{ title: 'General Communication' }}
          />
          <Stack.Screen
            name="ComplianceReports"
            component={ComplianceReportsScreen}
            options={{ title: 'Compliance PDF Export' }}
          />
          <Stack.Screen
            name="ComplianceDocuments"
            component={ComplianceDocumentsScreen}
            options={{ title: 'Compliance Documents' }}
          />
          <Stack.Screen
            name="ComplianceDocumentFolder"
            component={ComplianceDocumentFolderScreen}
            options={({ route }) => ({
              title: route.params?.folder?.label || 'Documents',
            })}
          />
          <Stack.Screen
            name="Activities"
            component={ActivitiesScreen}
            options={{ title: 'Activities' }}
          />
          <Stack.Screen
            name="LogActivity"
            component={LogActivityScreen}
            options={({ route }) => ({ title: route.params?.activity ? 'Edit Activity' : 'Log Activity' })}
          />
          <Stack.Screen
            name="ActivityDetail"
            component={ActivityDetailScreen}
            options={({ route }) => ({ title: route.params?.activity?.aktiwiteitsName || 'Activity Details' })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </AccessContext.Provider>
  );
}

function HomeScreen({ navigation, onLogout, loginIdentity }) {
  const accessProfile = useAccessProfile();
  const roleLabel = formatRoleLabel(accessProfile.role);
  const isPrincipal = String(accessProfile?.role || '').trim().toLowerCase() === 'principal';
  const isParentAccount = isParentRole(accessProfile);
  const studentsEnabled = isSchoolFeatureEnabled(accessProfile, 'students');
  const activitiesEnabled = isSchoolFeatureEnabled(accessProfile, 'activities');
  const staffAccessEnabled = isSchoolFeatureEnabled(accessProfile, 'staffAccess');
  const complianceEnabled = isSchoolFeatureEnabled(accessProfile, 'compliance');
  const pdfExportEnabled = isSchoolFeatureEnabled(accessProfile, 'pdfExport');
  const canManageUsers = hasPermission(accessProfile, 'canManageUsers');
  const canExportReports = hasPermission(accessProfile, 'canExportReports');
  const canOpenActivities = hasPermission(accessProfile, 'canTakeAttendance')
    || hasPermission(accessProfile, 'canLogIncidents')
    || hasPermission(accessProfile, 'canLogMedicine')
    || canExportReports;
  const canOpenCompliance = canExportReports || hasPermission(accessProfile, 'canManageUsers');
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const schoolName = String(accessProfile?.schoolName || DEFAULT_SCHOOL_NAME).trim();

  const closeMenu = () => {
    setIsMenuVisible(false);
  };

  const handleOpenSettings = () => {
    closeMenu();
    navigation.navigate('ProfileSettings');
  };

  const handleLogoutFromMenu = () => {
    closeMenu();
    onLogout();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <View style={styles.homeHeaderRow}>
          <View style={styles.homeHeaderTextWrap}>
            <Text style={styles.title}>{schoolName}</Text>
          </View>

          <TouchableOpacity style={styles.burgerButton} onPress={() => setIsMenuVisible(true)}>
            <Text style={styles.burgerButtonText}>☰</Text>
          </TouchableOpacity>
        </View>

        {studentsEnabled ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('StudentDirectory')}
          >
            <Text style={styles.moduleTitle}>{isParentAccount ? 'My Child/Children' : 'Students'}</Text>
          </TouchableOpacity>
        ) : null}

        {!isParentAccount && staffAccessEnabled && canManageUsers ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('ManageUsers')}
          >
            <Text style={styles.moduleTitle}>Staff Access</Text>
          </TouchableOpacity>
        ) : null}

        {!isParentAccount && activitiesEnabled && canOpenActivities ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('Activities')}
          >
            <Text style={styles.moduleTitle}>Activities</Text>
          </TouchableOpacity>
        ) : null}

        {!isParentAccount && complianceEnabled && canOpenCompliance ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('ComplianceDocuments')}
          >
            <Text style={styles.moduleTitle}>Compliance</Text>
          </TouchableOpacity>
        ) : null}

        {!isParentAccount && pdfExportEnabled && canExportReports ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('ComplianceReports')}
          >
            <Text style={styles.moduleTitle}>PDF Export</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.footerStatusText}>{`Logged in as ${loginIdentity || 'Staff Member'} - ${roleLabel} Access`}</Text>
      </ScrollView>

      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <View style={styles.menuModalRoot}>
          <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={closeMenu} />
          <View style={styles.menuSheetWrap} pointerEvents="box-none">
            <View style={styles.menuSheetCard}>
              <TouchableOpacity style={styles.menuItemButton} onPress={handleOpenSettings}>
                <Text style={styles.menuItemText}>Profile & Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItemButton} onPress={handleLogoutFromMenu}>
                <Text style={styles.menuItemText}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProfileSettingsScreen() {
  const accessProfile = useAccessProfile();
  const canManageUsers = hasPermission(accessProfile, 'canManageUsers');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [medicalVaultPassword, setMedicalVaultPassword] = useState('');
  const [initialMedicalVaultPassword, setInitialMedicalVaultPassword] = useState('');
  const [editDataPassword, setEditDataPassword] = useState('');
  const [initialEditDataPassword, setInitialEditDataPassword] = useState('');
  const [isMedicalVaultPasswordVisible, setIsMedicalVaultPasswordVisible] = useState(false);
  const [isEditDataPasswordVisible, setIsEditDataPasswordVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadVaultPassword = async () => {
      if (!canManageUsers) return;
      try {
        const config = await getCurrentSchoolConfig();
        if (!isMounted) return;
        const current = String(config?.medicalVaultPassword || '').trim();
        setMedicalVaultPassword(current);
        setInitialMedicalVaultPassword(current);
        const currentEditPassword = String(config?.editDataPassword || '').trim();
        setEditDataPassword(currentEditPassword);
        setInitialEditDataPassword(currentEditPassword);
      } catch (_error) {
        // No-op: profile settings still usable without this field load.
      }
    };

    loadVaultPassword();

    return () => {
      isMounted = false;
    };
  }, [canManageUsers]);

  const handleSave = async () => {
    const trimmedEmail = String(newEmail || '').trim();
    const trimmedPassword = String(newPassword || '').trim();
    const trimmedConfirm = String(confirmPassword || '').trim();
    const trimmedVaultPassword = String(medicalVaultPassword || '').trim();
    const trimmedEditDataPassword = String(editDataPassword || '').trim();
    const vaultPasswordChanged = canManageUsers && trimmedVaultPassword !== String(initialMedicalVaultPassword || '').trim();
    const editPasswordChanged = canManageUsers && trimmedEditDataPassword !== String(initialEditDataPassword || '').trim();
    const hasCredentialChanges = Boolean(trimmedEmail || trimmedPassword);

    if (!hasCredentialChanges && !vaultPasswordChanged && !editPasswordChanged) {
      Alert.alert('No Changes', 'Update your profile settings, Medical Aid Vault password, or Edit Data password before saving.');
      return;
    }

    if (hasCredentialChanges && trimmedPassword && trimmedPassword !== trimmedConfirm) {
      Alert.alert('Password Mismatch', 'New password and confirm password must match.');
      return;
    }

    try {
      setIsSaving(true);
      if (hasCredentialChanges) {
        const result = await updateCurrentUserCredentials({
          currentPassword,
          newEmail: trimmedEmail,
          newPassword: trimmedPassword,
        });

        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        if (result?.emailUpdated) {
          setNewEmail(result.email || '');
        } else {
          setNewEmail('');
        }
      }

      if (vaultPasswordChanged) {
        const nextSchoolConfig = await updateCurrentSchoolMedicalVaultPassword(trimmedVaultPassword, accessProfile?.uid || '');
        const current = String(nextSchoolConfig?.medicalVaultPassword || '').trim();
        setMedicalVaultPassword(current);
        setInitialMedicalVaultPassword(current);
      }

      if (editPasswordChanged) {
        const nextSchoolConfig = await updateCurrentSchoolEditDataPassword(trimmedEditDataPassword, accessProfile?.uid || '');
        const current = String(nextSchoolConfig?.editDataPassword || '').trim();
        setEditDataPassword(current);
        setInitialEditDataPassword(current);
      }

      Alert.alert('Updated', 'Your profile settings were updated successfully.');
    } catch (error) {
      const code = String(error?.code || '').trim();
      if (code === 'auth/requires-recent-login') {
        Alert.alert('Re-login Needed', 'For security, please log out and log in again before changing email or password.');
        return;
      }
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        Alert.alert('Could Not Verify', 'Current password is incorrect.');
        return;
      }
      Alert.alert('Update Failed', error.message || 'Could not update profile settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Profile & Settings</Text>
        <Text style={styles.subtitle}>Update your own email and password.</Text>

        {canManageUsers ? (
          <>
            <Text style={styles.formSectionLabel}>Medical Aid Vault Password</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Set shared vault password"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={medicalVaultPassword}
              onChangeText={setMedicalVaultPassword}
              autoCapitalize="none"
              secureTextEntry={!isMedicalVaultPasswordVisible}
            />
            <TouchableOpacity
              style={styles.modalButtonSecondary}
              onPress={() => setIsMedicalVaultPasswordVisible((current) => !current)}
            >
              <Text style={styles.modalButtonSecondaryText}>
                {isMedicalVaultPasswordVisible ? 'Hide Vault Password' : 'Show Vault Password'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.tapHint}>This password is shared across principal/admin and required for staff to unlock Medical Aid Vault.</Text>

            <Text style={styles.formSectionLabel}>Learner History Edit Password</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Set shared edit-data password"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={editDataPassword}
              onChangeText={setEditDataPassword}
              autoCapitalize="none"
              secureTextEntry={!isEditDataPasswordVisible}
            />
            <TouchableOpacity
              style={styles.modalButtonSecondary}
              onPress={() => setIsEditDataPasswordVisible((current) => !current)}
            >
              <Text style={styles.modalButtonSecondaryText}>
                {isEditDataPasswordVisible ? 'Hide Edit Password' : 'Show Edit Password'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.tapHint}>Staff must enter this password before editing attendance, incident, medicine, or general entries in learner history popups.</Text>
          </>
        ) : null}

        <Text style={styles.formSectionLabel}>Current Password (recommended)</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Current password"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
        />

        <Text style={styles.formSectionLabel}>New Email (optional)</Text>
        <TextInput
          style={styles.formInput}
          placeholder="newemail@example.com"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={newEmail}
          onChangeText={setNewEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.formSectionLabel}>New Password (optional)</Text>
        <TextInput
          style={styles.formInput}
          placeholder="At least 6 characters"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />

        <Text style={styles.formSectionLabel}>Confirm New Password</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Re-enter new password"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.saveStudentButton, isSaving && styles.saveStudentButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveStudentButtonText}>{isSaving ? 'Saving...' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SchoolSettingsScreen() {
  const accessProfile = useAccessProfile();
  const isPrincipal = String(accessProfile?.role || '').trim().toLowerCase() === 'principal';
  const [featureState, setFeatureState] = useState({
    students: true,
    activities: false,
    staffAccess: true,
    compliance: false,
    pdfExport: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      if (!isPrincipal) {
        setLoading(false);
        return;
      }

      try {
        const config = await getCurrentSchoolConfig();
        if (!isMounted) return;
        const next = config?.features && typeof config.features === 'object'
          ? config.features
          : accessProfile?.schoolFeatures;
        setFeatureState((prev) => ({
          ...prev,
          ...(next || {}),
        }));
      } catch (error) {
        if (!isMounted) return;
        Alert.alert('Could Not Load', error.message || 'Failed to load school feature settings.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, [accessProfile?.schoolFeatures, isPrincipal]);

  const toggleFeature = (key) => {
    setFeatureState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateCurrentSchoolFeatures(featureState, accessProfile?.uid || '');
      Alert.alert('Saved', 'School features updated. Re-open Home to see the latest menu modules.');
    } catch (error) {
      Alert.alert('Save Failed', error.message || 'Could not update school features.');
    } finally {
      setSaving(false);
    }
  };

  const featureOptions = [
    { key: 'students', label: 'Students' },
    { key: 'activities', label: 'Activities' },
    { key: 'staffAccess', label: 'Staff Access' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'pdfExport', label: 'PDF Export' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>School Settings</Text>
        <Text style={styles.subtitle}>Principal controls for school modules.</Text>

        {!isPrincipal ? (
          <View style={styles.errorBox}>
            <Text style={styles.warningText}>Only principal accounts can change school feature settings.</Text>
          </View>
        ) : null}

        {isPrincipal ? (
          <>
            <Text style={styles.formSectionLabel}>Enabled Modules</Text>
            <View style={styles.chipContainer}>
              {featureOptions.map((item) => {
                const selected = featureState[item.key] !== false;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.chipButton, selected && styles.chipButtonSelected]}
                    onPress={() => toggleFeature(item.key)}
                    disabled={loading || saving}
                  >
                    <Text style={[styles.chipButtonText, selected && styles.selectedActionText]}>
                      {selected ? 'ON - ' : 'OFF - '}
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.saveStudentButton, (loading || saving) && styles.saveStudentButtonDisabled]}
              onPress={handleSave}
              disabled={loading || saving}
            >
              <Text style={styles.saveStudentButtonText}>{saving ? 'Saving...' : 'Save Feature Settings'}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ManageUsersScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const canManageUsers = hasPermission(accessProfile, 'canManageUsers');
  const [userProfiles, setUserProfiles] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [savingUid, setSavingUid] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isShowingAddUserModal, setIsShowingAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('123456');
  const [newUserRole, setNewUserRole] = useState('teacher');
  const [newUserAssignedClasses, setNewUserAssignedClasses] = useState([]);

  useEffect(() => {
    if (!canManageUsers) {
      Alert.alert('Access Restricted', 'Your account does not have permission to open Staff Access.');
      navigation.goBack();
    }
  }, [canManageUsers, navigation]);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) {
      setUserProfiles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      const [userData, studentData] = await Promise.all([
        fetchUserAccessProfiles(),
        loadStudentsFromDataStore(),
      ]);
      setUserProfiles(Array.isArray(userData) ? userData : []);
      setStudents(Array.isArray(studentData) ? studentData : []);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load staff access settings.');
    } finally {
      setLoading(false);
    }
  }, [canManageUsers]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [loadUsers]),
  );

  const classOptions = useMemo(() => {
    const defaults = CLASSROOM_OPTIONS.filter((value) => value !== 'All Classes');
    const fromStudents = (Array.isArray(students) ? students : [])
      .map((student) => getClassroomName(student))
      .filter(Boolean);
    return Array.from(new Set([...defaults, ...fromStudents]));
  }, [students]);

  const handleToggleNewUserClass = (className) => {
    setNewUserAssignedClasses((current) => (
      current.includes(className)
        ? current.filter((value) => value !== className)
        : [...current, className]
    ));
  };

  const resetNewUserForm = () => {
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('123456');
    setNewUserRole('teacher');
    setNewUserAssignedClasses([]);
    setIsShowingAddUserModal(false);
  };

  const handleCreateUser = async () => {
    const email = String(newUserEmail || '').trim().toLowerCase();
    const password = String(newUserPassword || '').trim();
    const displayName = String(newUserName || '').trim();
    if (!email || !password) {
      Alert.alert('Missing Details', 'Please add email and temporary password for the new user.');
      return;
    }

    try {
      setIsCreatingUser(true);
      const createdProfile = await createManagedUserAccount({
        email,
        password,
        displayName,
        role: newUserRole,
        assignedClasses: newUserAssignedClasses,
      });
      setUserProfiles((current) => [...current, createdProfile].sort((left, right) => String(left.displayName || left.email || '').localeCompare(String(right.displayName || right.email || ''))));
      resetNewUserForm();
      Alert.alert('User Added', 'New user account created. Ask them to log in and change password.');
    } catch (error) {
      Alert.alert('Could Not Create User', error.message || 'Failed to create the user account.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleOpenAddUserModal = () => {
    setIsShowingAddUserModal(true);
  };

  const handleCloseAddUserModal = () => {
    resetNewUserForm();
  };

  const handleRoleChange = async (userProfile, nextRole) => {
    if (!canManageUsers || !userProfile?.uid || !nextRole) {
      return;
    }

    if (userProfile.uid === accessProfile.uid && nextRole !== 'principal') {
      Alert.alert('Keep Principal Access', 'Your signed-in principal account must stay a principal so you do not lock yourself out.');
      return;
    }

    try {
      setSavingUid(userProfile.uid);
      const updatedProfile = await updateUserAccessProfile(userProfile.uid, {
        email: userProfile.email,
        displayName: userProfile.displayName,
        role: nextRole,
        permissions: DEFAULT_ROLE_PERMISSIONS[nextRole],
      });
      setUserProfiles((currentUsers) => currentUsers.map((currentUser) => (
        currentUser.uid === userProfile.uid ? updatedProfile : currentUser
      )));
    } catch (error) {
      Alert.alert('Update Failed', error.message || 'Could not update the user role.');
    } finally {
      setSavingUid('');
    }
  };

  const handlePermissionToggle = async (userProfile, permissionKey) => {
    if (!canManageUsers || !userProfile?.uid || !permissionKey) {
      return;
    }

    if (userProfile.uid === accessProfile.uid && permissionKey === 'canManageUsers' && userProfile.permissions?.canManageUsers) {
      Alert.alert('Keep Principal Access', 'Your signed-in principal account must keep user-management access.');
      return;
    }

    const nextPermissions = {
      ...DEFAULT_ROLE_PERMISSIONS[userProfile.role] || DEFAULT_ROLE_PERMISSIONS.teacher,
      ...(userProfile.permissions || {}),
      [permissionKey]: !Boolean(userProfile.permissions?.[permissionKey]),
    };

    try {
      setSavingUid(userProfile.uid);
      const updatedProfile = await updateUserAccessProfile(userProfile.uid, {
        email: userProfile.email,
        displayName: userProfile.displayName,
        role: userProfile.role,
        permissions: nextPermissions,
      });
      setUserProfiles((currentUsers) => currentUsers.map((currentUser) => (
        currentUser.uid === userProfile.uid ? updatedProfile : currentUser
      )));
    } catch (error) {
      Alert.alert('Update Failed', error.message || 'Could not update the user permissions.');
    } finally {
      setSavingUid('');
    }
  };

  const handleLinkedStudentToggle = async (userProfile, studentId) => {
    if (!canManageUsers || !userProfile?.uid || !studentId) {
      return;
    }

    const currentLinkedIds = Array.isArray(userProfile.linkedStudentIds) ? userProfile.linkedStudentIds : [];
    const nextLinkedStudentIds = currentLinkedIds.includes(studentId)
      ? currentLinkedIds.filter((currentId) => currentId !== studentId)
      : [...currentLinkedIds, studentId];

    try {
      setSavingUid(userProfile.uid);
      const updatedProfile = await updateUserAccessProfile(userProfile.uid, {
        email: userProfile.email,
        displayName: userProfile.displayName,
        role: userProfile.role,
        permissions: userProfile.permissions,
        linkedStudentIds: nextLinkedStudentIds,
      });
      setUserProfiles((currentUsers) => currentUsers.map((currentUser) => (
        currentUser.uid === userProfile.uid ? updatedProfile : currentUser
      )));
    } catch (error) {
      Alert.alert('Update Failed', error.message || 'Could not link the learner to this parent account.');
    } finally {
      setSavingUid('');
    }
  };

  const handleAssignedClassToggle = async (userProfile, className) => {
    if (!canManageUsers || !userProfile?.uid || !className) {
      return;
    }

    const currentAssigned = Array.isArray(userProfile.assignedClasses) ? userProfile.assignedClasses : [];
    const nextAssigned = currentAssigned.includes(className)
      ? currentAssigned.filter((value) => value !== className)
      : [...currentAssigned, className];

    try {
      setSavingUid(userProfile.uid);
      const updatedProfile = await updateUserAccessProfile(userProfile.uid, {
        email: userProfile.email,
        displayName: userProfile.displayName,
        role: userProfile.role,
        permissions: userProfile.permissions,
        linkedStudentIds: userProfile.linkedStudentIds || [],
        assignedClasses: nextAssigned,
      });
      setUserProfiles((currentUsers) => currentUsers.map((currentUser) => (
        currentUser.uid === userProfile.uid ? updatedProfile : currentUser
      )));
    } catch (error) {
      Alert.alert('Update Failed', error.message || 'Could not update class assignment.');
    } finally {
      setSavingUid('');
    }
  };

  const handleRemoveUser = (userProfile) => {
    if (!canManageUsers || !userProfile?.uid) {
      Alert.alert('Error', 'Cannot remove this user.');
      return;
    }
    if (userProfile.uid === accessProfile.uid) {
      Alert.alert('Not Allowed', 'You cannot remove your own account from Staff Access.');
      return;
    }

    const removeUserNow = async () => {
      try {
        setSavingUid(userProfile.uid);
        await withTimeout(updateUserAccessProfile(userProfile.uid, {
          email: userProfile.email,
          displayName: userProfile.displayName,
          role: userProfile.role,
          permissions: userProfile.permissions,
          linkedStudentIds: userProfile.linkedStudentIds || [],
          assignedClasses: userProfile.assignedClasses || [],
          isActive: false,
        }), 12000, 'Could not complete remove user request in time.');
        setUserProfiles((currentUsers) => currentUsers.filter((currentUser) => currentUser.uid !== userProfile.uid));
        Alert.alert('Removed', `${userProfile.displayName || userProfile.email} has been removed from staff access.`);
      } catch (error) {
        console.error('Remove user error:', error);
        const message = String(error?.message || '').trim();
        if (/permission|insufficient/i.test(message)) {
          Alert.alert('Remove Failed', 'This account does not have permission in Firestore to remove users. Sign in with the principal account and try again.');
          return;
        }
        Alert.alert('Remove Failed', message || 'Could not remove this user. Please try again.');
      } finally {
        setSavingUid('');
      }
    };

    const promptMessage = `Remove ${userProfile.displayName || userProfile.email || 'this user'} from this school?`;
    if (Platform.OS === 'web') {
      const shouldRemove = typeof window !== 'undefined' ? window.confirm(promptMessage) : true;
      if (shouldRemove) {
        void removeUserNow();
      }
      return;
    }

    Alert.alert(
      'Remove User',
      promptMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void removeUserNow();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>Staff Access</Text>
        <Text style={styles.subtitle}>Principal control for roles and permissions</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Add, edit, and remove user access here. Class assignment is saved now for future class-restricted access updates.</Text>
        </View>

        {canManageUsers ? (
          <TouchableOpacity
            style={styles.saveStudentButton}
            onPress={handleOpenAddUserModal}
          >
            <Text style={styles.saveStudentButtonText}>+ Add New User</Text>
          </TouchableOpacity>
        ) : null}

        {!canManageUsers ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>This screen is restricted to principal/admin accounts.</Text>
          </View>
        ) : null}

        {loading ? <Text style={styles.statusText}>Loading staff access...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {!loading && !errorMessage && userProfiles.length === 0 ? (
          <Text style={styles.statusText}>No staff profiles found yet. Ask each user to log in once after their Firebase Auth account is created.</Text>
        ) : null}

        {userProfiles
          .filter((userProfile) => userProfile.uid !== accessProfile.uid)
          .map((userProfile) => (
          <View key={userProfile.uid} style={styles.sectionCard}>
            <Text style={styles.studentName}>{userProfile.displayName || userProfile.email || 'Staff Member'}</Text>
            <Text style={styles.studentClassText}>
              {userProfile.email || 'No email'}{userProfile.uid === accessProfile.uid ? ' • You' : ''}
            </Text>
            <Text style={styles.tapHint}>Role: {formatRoleLabel(userProfile.role)}</Text>

            <Text style={styles.formSectionLabel}>Role</Text>
            <View style={styles.actionRow}>
              {ROLE_OPTIONS.map((roleOption) => (
                <TouchableOpacity
                  key={`${userProfile.uid}-${roleOption}`}
                  style={[
                    styles.chipButton,
                    userProfile.role === roleOption && styles.chipButtonSelected,
                  ]}
                  onPress={() => handleRoleChange(userProfile, roleOption)}
                  disabled={savingUid === userProfile.uid || !canManageUsers}
                >
                  <Text style={[styles.chipButtonText, userProfile.role === roleOption && styles.selectedActionText]}>
                    {formatRoleLabel(roleOption)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formSectionLabel}>Permissions</Text>
            <View style={styles.actionRow}>
              {MANAGEABLE_PERMISSION_OPTIONS.map((permission) => {
                const isEnabled = Boolean(userProfile.permissions?.[permission.key]);
                return (
                  <TouchableOpacity
                    key={`${userProfile.uid}-${permission.key}`}
                    style={[
                      styles.chipButton,
                      isEnabled && styles.chipButtonSelected,
                    ]}
                    onPress={() => handlePermissionToggle(userProfile, permission.key)}
                    disabled={savingUid === userProfile.uid || !canManageUsers}
                  >
                    <Text style={[styles.chipButtonText, isEnabled && styles.selectedActionText]}>{permission.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {userProfile.role === 'parent' ? (
              <>
                <Text style={styles.formSectionLabel}>Linked Learner(s)</Text>
                <LinkedStudentPicker
                  students={students}
                  linkedStudentIds={userProfile.linkedStudentIds}
                  onToggleStudent={(studentId) => handleLinkedStudentToggle(userProfile, studentId)}
                  disabled={savingUid === userProfile.uid || !canManageUsers}
                />
                <Text style={styles.tapHint}>Parent accounts only see the learners selected here.</Text>
              </>
            ) : null}

            {userProfile.role !== 'parent' ? (
              <>
                <Text style={styles.formSectionLabel}>Assigned Classes</Text>
                <View style={styles.actionRow}>
                  {classOptions.map((className) => {
                    const selected = Array.isArray(userProfile.assignedClasses) && userProfile.assignedClasses.includes(className);
                    return (
                      <TouchableOpacity
                        key={`${userProfile.uid}-class-${className}`}
                        style={[styles.chipButton, selected && styles.chipButtonSelected]}
                        onPress={() => handleAssignedClassToggle(userProfile, className)}
                        disabled={savingUid === userProfile.uid || !canManageUsers}
                      >
                        <Text style={[styles.chipButtonText, selected && styles.selectedActionText]}>{className}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.tapHint}>Stored for future class-level user restriction. Current behavior still shows all students.</Text>
              </>
            ) : null}

            {userProfile.uid !== accessProfile.uid ? (
              <TouchableOpacity
                style={[styles.modalButtonSecondary, savingUid === userProfile.uid && styles.saveStudentButtonDisabled]}
                onPress={() => handleRemoveUser(userProfile)}
                disabled={savingUid === userProfile.uid}
              >
                <Text style={styles.modalButtonSecondaryText}>Remove User</Text>
              </TouchableOpacity>
            ) : null}

            {savingUid === userProfile.uid ? <Text style={styles.statusText}>Saving access changes...</Text> : null}
          </View>
        ))}

        <Modal
          visible={isShowingAddUserModal}
          transparent
          animationType="fade"
          onRequestClose={handleCloseAddUserModal}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add New User</Text>

              <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScrollContent}>
                <TextInput
                  style={styles.formInput}
                  placeholder="Display Name"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={newUserName}
                  onChangeText={setNewUserName}
                />
                <TextInput
                  style={styles.formInput}
                  placeholder="Email"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={newUserEmail}
                  onChangeText={setNewUserEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TextInput
                  style={styles.formInput}
                  placeholder="Temporary Password"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={newUserPassword}
                  onChangeText={setNewUserPassword}
                  secureTextEntry
                />

                <Text style={styles.formSectionLabel}>Role</Text>
                <View style={styles.actionRow}>
                  {ROLE_OPTIONS.map((roleOption) => (
                    <TouchableOpacity
                      key={`modal-new-user-${roleOption}`}
                      style={[styles.chipButton, newUserRole === roleOption && styles.chipButtonSelected]}
                      onPress={() => setNewUserRole(roleOption)}
                      disabled={isCreatingUser}
                    >
                      <Text style={[styles.chipButtonText, newUserRole === roleOption && styles.selectedActionText]}>
                        {formatRoleLabel(roleOption)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {newUserRole !== 'parent' ? (
                  <>
                    <Text style={styles.formSectionLabel}>Assigned Classes</Text>
                    <View style={styles.actionRow}>
                      {classOptions.map((className) => {
                        const selected = newUserAssignedClasses.includes(className);
                        return (
                          <TouchableOpacity
                            key={`modal-new-user-class-${className}`}
                            style={[styles.chipButton, selected && styles.chipButtonSelected]}
                            onPress={() => handleToggleNewUserClass(className)}
                            disabled={isCreatingUser}
                          >
                            <Text style={[styles.chipButtonText, selected && styles.selectedActionText]}>{className}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.tapHint}>Class assignment is stored for future restricted class access. Teachers currently still view all learners.</Text>
                  </>
                ) : null}
              </ScrollView>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={styles.modalButtonSecondary} onPress={handleCloseAddUserModal} disabled={isCreatingUser}>
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButtonPrimary, isCreatingUser && styles.saveStudentButtonDisabled]}
                  onPress={handleCreateUser}
                  disabled={isCreatingUser}
                >
                  <Text style={styles.modalButtonPrimaryText}>{isCreatingUser ? 'Creating...' : 'Create User'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

function StudentDirectoryScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const isParentAccount = isParentRole(accessProfile);
  const canEditStudents = hasPermission(accessProfile, 'canEditStudents');
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isBackgroundUpdating, setIsBackgroundUpdating] = useState(false);
  const [hasResolvedFirstLoad, setHasResolvedFirstLoad] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const refreshStudents = useCallback(async ({ fromPullToRefresh = false } = {}) => {
    if (fromPullToRefresh) {
      setRefreshing(true);
    } else {
      setIsBackgroundUpdating(true);
    }

    try {
      setErrorMessage('');
      const data = await fetchStudentsFromFirestore();
      if (Array.isArray(data)) {
        setStudents(data);
        await saveStudentsToCache(accessProfile, data);
      }
    } catch (error) {
      setErrorMessage(error.message || 'Could not refresh students right now.');
    } finally {
      if (fromPullToRefresh) {
        setRefreshing(false);
      } else {
        setIsBackgroundUpdating(false);
      }
      if (!hasResolvedFirstLoad) {
        setHasResolvedFirstLoad(true);
        setLoading(false);
      }
    }
  }, [accessProfile, hasResolvedFirstLoad]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeStudents = () => {};

    const initStudents = async () => {
      try {
        const cached = await loadStudentsFromCache(accessProfile);
        if (isMounted && Array.isArray(cached) && cached.length > 0) {
          setStudents(cached);
          setLoading(false);
        }
      } catch (_error) {
        // Keep default loading state until realtime data resolves.
      }

      try {
        unsubscribeStudents = subscribeStudentsFromFirestore(
          async (nextStudents) => {
            if (!isMounted) {
              return;
            }
            setErrorMessage('');
            setStudents(Array.isArray(nextStudents) ? nextStudents : []);
            setHasResolvedFirstLoad(true);
            setLoading(false);
            setIsBackgroundUpdating(false);
            await saveStudentsToCache(accessProfile, nextStudents);
          },
          async (error) => {
            if (!isMounted) {
              return;
            }
            setIsBackgroundUpdating(false);
            setErrorMessage(error.message || 'Could not sync students in real time. Showing last saved data.');
            if (!hasResolvedFirstLoad) {
              const cached = await loadStudentsFromCache(accessProfile);
              setStudents(Array.isArray(cached) ? cached : []);
              setHasResolvedFirstLoad(true);
              setLoading(false);
            }
          },
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setErrorMessage(error.message || 'Could not subscribe to student updates.');
        const fallbackData = await loadStudentsFromDataStore();
        setStudents(Array.isArray(fallbackData) ? fallbackData : []);
        setHasResolvedFirstLoad(true);
        setLoading(false);
      }
    };

    initStudents();

    return () => {
      isMounted = false;
      unsubscribeStudents();
    };
  }, [accessProfile, hasResolvedFirstLoad]);

  useFocusEffect(
    useCallback(() => {
      refreshStudents();
    }, [refreshStudents]),
  );

  const visibleStudentPool = useMemo(
    () => filterStudentsByAccess(students, accessProfile),
    [students, accessProfile],
  );

  const groupedStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filteredStudents = visibleStudentPool.filter((student) => {
      const name = getStudentFullName(student).toLowerCase();
      const studentId = String(student.id || '').toLowerCase();
      const className = getClassroomName(student).toLowerCase();
      return !query || name.includes(query) || studentId.includes(query) || className.includes(query);
    });

    const grouped = filteredStudents.reduce((accumulator, student) => {
      const className = getClassroomName(student);
      if (!accumulator[className]) {
        accumulator[className] = [];
      }
      accumulator[className].push(student);
      return accumulator;
    }, {});

    return Object.entries(grouped).map(([className, learners]) => ({
      className,
      learners: learners.sort((left, right) => getStudentFullName(left).localeCompare(getStudentFullName(right))),
    }));
  }, [visibleStudentPool, searchQuery]);

  const orderedVisibleStudents = useMemo(
    () => [...visibleStudentPool].sort((left, right) => getStudentFullName(left).localeCompare(getStudentFullName(right))),
    [visibleStudentPool],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screenContainer}>
        <View style={styles.studentDirectoryHeaderRow}>
          <Text style={styles.title}>{isParentAccount ? 'My Child/Children' : 'Students'}</Text>
          {canEditStudents ? (
            <TouchableOpacity
              style={[styles.addStudentButton, styles.addStudentButtonInline]}
              onPress={() => navigation.navigate('StudentForm', { mode: 'add' })}
            >
              <Text style={styles.addStudentButtonText}>+ Add Student</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {!canEditStudents ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {isParentAccount
                ? 'This parent view only shows the learner(s) linked to your account. You can update medical/contact information from the learner profile.'
                : 'View-only student access: only principal/admin users can add or edit learners.'}
            </Text>
          </View>
        ) : null}

        <StudentAutocomplete
          students={visibleStudentPool}
          selectedStudentId={selectedStudentId}
          onSelect={setSelectedStudentId}
          onStudentChosen={(student) => {
            if (isParentAccount) {
              navigation.navigate('EmergencyProfile', { student });
              return;
            }

            navigation.navigate('StudentClassFolder', {
              className: getClassroomName(student),
              focusStudentId: String(student?.id || '').trim(),
              focusStudentName: getStudentFullName(student),
            });
          }}
          placeholder={isParentAccount ? 'Quick search your child' : 'Quick learner search across all classes'}
          helperText={isParentAccount ? 'Start typing your child name for instant access.' : ''}
        />

        {loading ? <Text style={styles.statusText}>Loading students...</Text> : null}
        {!loading && isBackgroundUpdating ? <Text style={styles.tapHint}>Updating...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {!loading && !errorMessage && isParentAccount && visibleStudentPool.length === 0 ? (
          <Text style={styles.statusText}>No learner has been linked to this parent account yet. Ask the principal to open Staff Access and select the child for this parent.</Text>
        ) : null}

          <ScrollView
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refreshStudents({ fromPullToRefresh: true })} />}
          >
            {!loading && !errorMessage && isParentAccount ? (
              orderedVisibleStudents.length === 0 ? (
                <Text style={styles.statusText}>No linked learner found for this parent account.</Text>
              ) : orderedVisibleStudents.map((student) => (
                <TouchableOpacity
                  key={student.id}
                  style={styles.studentItem}
                  onPress={() => navigation.navigate('EmergencyProfile', { student })}
                >
                  <View>
                    <Text style={styles.studentName}>{getStudentFullName(student)}</Text>
                    <Text style={styles.studentClassText}>{getClassroomName(student)}</Text>
                    <Text style={styles.tapHint}>Tap to open your child record</Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : !loading && !errorMessage && groupedStudents.length === 0 ? (
              <Text style={styles.statusText}>No learners found for this search.</Text>
            ) : groupedStudents.map((group) => (
              <TouchableOpacity
                key={group.className}
                style={styles.moduleCard}
                onPress={() => navigation.navigate('StudentClassFolder', { className: group.className })}
              >
                <View style={styles.folderHeaderRow}>
                  <View style={styles.folderTextWrap}>
                    <Text style={styles.moduleTitle}>{group.className}</Text>
                    <Text style={styles.moduleSubtitle}>{group.learners.length} learners • Tap to open</Text>
                  </View>
                  <Text style={styles.folderToggleText}>Open</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
    </SafeAreaView>
  );
}

function StudentClassFolderScreen({ route, navigation }) {
  const accessProfile = useAccessProfile();
  const className = route.params?.className || 'Class Folder';
  const focusStudentId = String(route.params?.focusStudentId || '').trim();
  const focusStudentName = String(route.params?.focusStudentName || '').trim();
  const canTakeAttendance = hasPermission(accessProfile, 'canTakeAttendance');
  const canLogIncidents = hasPermission(accessProfile, 'canLogIncidents');
  const canLogMedicine = hasPermission(accessProfile, 'canLogMedicine');
  const canLogGeneral = hasPermission(accessProfile, 'canLogGeneral');
  const [students, setStudents] = useState([]);
  const [attendanceEntries, setAttendanceEntries] = useState([]);
  const [savingAttendanceId, setSavingAttendanceId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [incidentStudent, setIncidentStudent] = useState(null);
  const [incidentLocation, setIncidentLocation] = useState('Playground');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentActionTaken, setIncidentActionTaken] = useState('');
  const [incidentWitness, setIncidentWitness] = useState('');
  const initialIncidentDate = getCurrentLocalDateString();
  const [incidentOccurredYear, setIncidentOccurredYear] = useState(initialIncidentDate.split('-')[0]);
  const [incidentOccurredMonth, setIncidentOccurredMonth] = useState(initialIncidentDate.split('-')[1]);
  const [incidentOccurredDay, setIncidentOccurredDay] = useState(initialIncidentDate.split('-')[2]);
  const [incidentOccurredTime, setIncidentOccurredTime] = useState(getCurrentLocalTimeString());
  const [showIncidentOccurredDatePicker, setShowIncidentOccurredDatePicker] = useState(false);
  const [incidentSaving, setIncidentSaving] = useState(false);
  const [medicineStudent, setMedicineStudent] = useState(null);
  const [medicineName, setMedicineName] = useState('');
  const [medicineDosage, setMedicineDosage] = useState('');
  const [medicineStaffMember, setMedicineStaffMember] = useState('');
  const initialMedicineDate = getCurrentLocalDateString();
  const [medicineOccurredYear, setMedicineOccurredYear] = useState(initialMedicineDate.split('-')[0]);
  const [medicineOccurredMonth, setMedicineOccurredMonth] = useState(initialMedicineDate.split('-')[1]);
  const [medicineOccurredDay, setMedicineOccurredDay] = useState(initialMedicineDate.split('-')[2]);
  const [medicineOccurredTime, setMedicineOccurredTime] = useState(getCurrentLocalTimeString());
  const [showMedicineOccurredDatePicker, setShowMedicineOccurredDatePicker] = useState(false);
  const [medicineSaving, setMedicineSaving] = useState(false);
  const [generalStudent, setGeneralStudent] = useState(null);
  const [generalSubject, setGeneralSubject] = useState('');
  const [generalNote, setGeneralNote] = useState('');
  const [generalStaffMember, setGeneralStaffMember] = useState('');
  const initialGeneralDate = getCurrentLocalDateString();
  const [generalOccurredYear, setGeneralOccurredYear] = useState(initialGeneralDate.split('-')[0]);
  const [generalOccurredMonth, setGeneralOccurredMonth] = useState(initialGeneralDate.split('-')[1]);
  const [generalOccurredDay, setGeneralOccurredDay] = useState(initialGeneralDate.split('-')[2]);
  const [generalOccurredTime, setGeneralOccurredTime] = useState(getCurrentLocalTimeString());
  const [showGeneralOccurredDatePicker, setShowGeneralOccurredDatePicker] = useState(false);
  const [generalSaving, setGeneralSaving] = useState(false);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const data = await loadStudentsFromDataStore();
      setStudents(Array.isArray(data) ? data : []);
      const attendanceData = await loadAttendanceFromDataStore(TODAY, Array.isArray(data) ? data : []);
      setAttendanceEntries(Array.isArray(attendanceData) ? attendanceData : []);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load the class folder.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useFocusEffect(
    useCallback(() => {
      fetchStudents();
    }, [fetchStudents]),
  );

  useEffect(() => {
    if (focusStudentId || focusStudentName) {
      setSearchQuery(focusStudentId || focusStudentName);
    }
  }, [focusStudentId, focusStudentName]);

  const visibleStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return students
      .filter((student) => {
        const matchesClass = getClassroomName(student) === className;
        const allowedStudent = canAccessStudent(accessProfile, student);
        const studentName = getStudentFullName(student).toLowerCase();
        const studentId = String(student.id || '').toLowerCase();
        return allowedStudent && matchesClass && (!query || studentName.includes(query) || studentId.includes(query));
      })
      .sort((a, b) => getStudentFullName(a).localeCompare(getStudentFullName(b)));
  }, [students, searchQuery, className, accessProfile]);

  const attendanceByStudentId = useMemo(
    () => new Map(attendanceEntries.map((entry) => [String(entry.studentId || '').trim(), entry])),
    [attendanceEntries],
  );

  const defaultAttendanceEntryForStudent = useCallback((student) => ({
    id: `${TODAY}_${String(student?.id || '').trim()}`,
    date: TODAY,
    studentId: String(student?.id || '').trim(),
    studentName: getStudentFullName(student),
    className: getClassroomName(student),
    status: 'Present',
    reason: '',
  }), []);

  const getAttendanceEntryForStudent = useCallback((student) => {
    const studentId = String(student?.id || '').trim();
    return attendanceByStudentId.get(studentId) || defaultAttendanceEntryForStudent(student);
  }, [attendanceByStudentId, defaultAttendanceEntryForStudent]);

  const statusStyleFor = (status) => {
    if (status === 'Late') {
      return styles.statusBadgeLate;
    }

    if (status === 'Absent') {
      return styles.statusBadgeAbsent;
    }

    return styles.statusBadgePresent;
  };

  const upsertAttendanceEntry = useCallback((nextEntry) => {
    setAttendanceEntries((currentEntries) => {
      const nextEntriesMap = new Map(currentEntries.map((entry) => [String(entry.studentId || '').trim(), entry]));
      nextEntriesMap.set(String(nextEntry.studentId || '').trim(), nextEntry);
      return Array.from(nextEntriesMap.values());
    });
  }, []);

  const handleQuickAttendanceStatus = async (student, status) => {
    if (!canTakeAttendance) {
      Alert.alert('Access Restricted', 'Your account can view attendance but cannot change it.');
      return;
    }

    const currentEntry = getAttendanceEntryForStudent(student);
    const reason = status === 'Absent'
      ? 'Marked absent in student folder.'
      : status === 'Late'
        ? 'Marked late in student folder.'
        : '';

    try {
      setSavingAttendanceId(String(student?.id || '').trim());
      const savedEntry = await saveAttendanceRecord(TODAY, currentEntry, status, reason);
      upsertAttendanceEntry(savedEntry);
    } catch (error) {
      Alert.alert('Update Failed', error.message || 'Could not update attendance.');
    } finally {
      setSavingAttendanceId('');
    }
  };

  const openIncidentModal = (student) => {
    if (!canLogIncidents) {
      Alert.alert('Access Restricted', 'Your account can view incidents but cannot create them.');
      return;
    }

    setIncidentStudent(student);
    setIncidentLocation('Playground');
    setIncidentDescription('');
    setIncidentActionTaken('');
    setIncidentWitness('');
    setIncidentOccurredYear(getCurrentLocalDateString().split('-')[0]);
    setIncidentOccurredMonth(getCurrentLocalDateString().split('-')[1]);
    setIncidentOccurredDay(getCurrentLocalDateString().split('-')[2]);
    setIncidentOccurredTime(getCurrentLocalTimeString());
  };

  const closeIncidentModal = () => {
    setIncidentStudent(null);
    setIncidentDescription('');
    setIncidentActionTaken('');
    setIncidentWitness('');
    setShowIncidentOccurredDatePicker(false);
  };

  const handleSaveIncident = async () => {
    if (!incidentStudent) {
      return;
    }

    if (!incidentLocation.trim() || !incidentDescription.trim() || !incidentActionTaken.trim() || !incidentWitness.trim()) {
      Alert.alert('Missing Details', 'Please complete location, description, action taken, and witness.');
      return;
    }

    const incidentOccurredDate = `${incidentOccurredYear}-${incidentOccurredMonth}-${incidentOccurredDay}`;
    const occurredAt = buildIncidentOccurredAt(incidentOccurredDate, incidentOccurredTime);
    if (!occurredAt) {
      Alert.alert('Time Required', 'Enter the incident time in 24-hour format, for example 14:30.');
      return;
    }

    if (new Date(occurredAt).getTime() > Date.now()) {
      Alert.alert('Date Not Allowed', 'The incident happened time cannot be in the future.');
      return;
    }

    try {
      setIncidentSaving(true);
      await saveIncidentRecord({
        studentId: String(incidentStudent.id || '').trim(),
        location: incidentLocation.trim(),
        description: incidentDescription.trim(),
        actionTaken: incidentActionTaken.trim(),
        witness: incidentWitness.trim(),
        occurredAt,
      }, incidentStudent);

      closeIncidentModal();
      Alert.alert('Saved', 'Incident recorded for this learner.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not save the incident.');
    } finally {
      setIncidentSaving(false);
    }
  };

  const openMedicineModal = (student) => {
    if (!canLogMedicine) {
      Alert.alert('Access Restricted', 'Your account can view medicine logs but cannot create them.');
      return;
    }

    setMedicineStudent(student);
    setMedicineName('');
    setMedicineDosage('');
    setMedicineStaffMember('');
    setMedicineOccurredYear(getCurrentLocalDateString().split('-')[0]);
    setMedicineOccurredMonth(getCurrentLocalDateString().split('-')[1]);
    setMedicineOccurredDay(getCurrentLocalDateString().split('-')[2]);
    setMedicineOccurredTime(getCurrentLocalTimeString());
  };

  const closeMedicineModal = () => {
    setMedicineStudent(null);
    setMedicineName('');
    setMedicineDosage('');
    setMedicineStaffMember('');
    setShowMedicineOccurredDatePicker(false);
  };

  const openGeneralModal = (student) => {
    if (!canLogGeneral) {
      Alert.alert('Access Restricted', 'Your account can view general logs but cannot create them.');
      return;
    }

    setGeneralStudent(student);
    setGeneralSubject('');
    setGeneralNote('');
    setGeneralStaffMember('');
    setGeneralOccurredYear(getCurrentLocalDateString().split('-')[0]);
    setGeneralOccurredMonth(getCurrentLocalDateString().split('-')[1]);
    setGeneralOccurredDay(getCurrentLocalDateString().split('-')[2]);
    setGeneralOccurredTime(getCurrentLocalTimeString());
  };

  const closeGeneralModal = () => {
    setGeneralStudent(null);
    setGeneralSubject('');
    setGeneralNote('');
    setGeneralStaffMember('');
    setShowGeneralOccurredDatePicker(false);
  };

  const handleSaveMedicine = async () => {
    if (!medicineStudent) {
      return;
    }

    if (!medicineName.trim() || !medicineDosage.trim() || !medicineStaffMember.trim()) {
      Alert.alert('Missing Details', 'Please complete medication, dosage, and staff member.');
      return;
    }

    const medicineOccurredDate = `${medicineOccurredYear}-${medicineOccurredMonth}-${medicineOccurredDay}`;
    const timeAdministered = buildIncidentOccurredAt(medicineOccurredDate, medicineOccurredTime);
    if (!timeAdministered) {
      Alert.alert('Time Required', 'Enter the medicine time in 24-hour format, for example 14:30.');
      return;
    }

    if (new Date(timeAdministered).getTime() > Date.now()) {
      Alert.alert('Date Not Allowed', 'The medicine time cannot be in the future.');
      return;
    }

    try {
      setMedicineSaving(true);
      const savedEntry = await saveMedicineLogRecord({
        studentId: String(medicineStudent.id || '').trim(),
        medicationName: medicineName.trim(),
        dosage: medicineDosage.trim(),
        staffMember: medicineStaffMember.trim(),
        timeAdministered,
      }, medicineStudent);

      closeMedicineModal();
      if (savedEntry?.allergyWarning) {
        Alert.alert('WARNING', 'This medication matches a recorded allergy. Please double-check before administration.');
      } else {
        Alert.alert('Saved', 'Medicine logged for this learner.');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not save the medicine log.');
    } finally {
      setMedicineSaving(false);
    }
  };

  const handleSaveGeneral = async () => {
    if (!generalStudent) {
      return;
    }

    if (!generalSubject.trim() || !generalNote.trim() || !generalStaffMember.trim()) {
      Alert.alert('Missing Details', 'Please complete subject, note, and staff member.');
      return;
    }

    const generalOccurredDate = `${generalOccurredYear}-${generalOccurredMonth}-${generalOccurredDay}`;
    const occurredAt = buildIncidentOccurredAt(generalOccurredDate, generalOccurredTime);
    if (!occurredAt) {
      Alert.alert('Time Required', 'Enter the communication time in 24-hour format, for example 14:30.');
      return;
    }

    if (new Date(occurredAt).getTime() > Date.now()) {
      Alert.alert('Date Not Allowed', 'The communication time cannot be in the future.');
      return;
    }

    try {
      setGeneralSaving(true);
      await saveGeneralLogRecord({
        studentId: String(generalStudent.id || '').trim(),
        subject: generalSubject.trim(),
        note: generalNote.trim(),
        staffMember: generalStaffMember.trim(),
        occurredAt,
      }, generalStudent);

      closeGeneralModal();
      Alert.alert('Saved', 'General communication logged for this learner.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not save the general log.');
    } finally {
      setGeneralSaving(false);
    }
  };

  const activeMedicineAllergyWarning = useMemo(
    () => doesMedicationTriggerAllergy(medicineName, medicineStudent?.allergies || ''),
    [medicineName, medicineStudent],
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>{className}</Text>
        <Text style={styles.subtitle}>Students in this class with quick daily logging</Text>
        <Text style={styles.helperText}>Use each learner card to set attendance status and quickly add incident, medicine, or general communication logs without leaving Students.</Text>

        <TextInput
          style={styles.searchInput}
          placeholder={`Search inside ${className}`}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {loading ? <Text style={styles.statusText}>Loading class folder...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {!loading && !errorMessage && visibleStudents.length === 0 ? (
          <Text style={styles.statusText}>No learners found in this class.</Text>
        ) : null}

        {visibleStudents.map((student) => {
          const attendanceEntry = getAttendanceEntryForStudent(student);
          const isSavingThisStudent = savingAttendanceId === String(student.id || '').trim();
          const isParentMarkedAbsent = attendanceEntry.status === 'Absent' && (
            attendanceEntry.parentReportedAbsent
            || String(attendanceEntry.reason || '').toLowerCase().includes(PARENT_ABSENT_REASON.toLowerCase())
          );

          return (
            <View key={student.id} style={styles.sectionCard}>
              <View style={[styles.statusDot, statusStyleFor(attendanceEntry.status)]} />
              <View style={styles.itemHeaderRow}>
                <TouchableOpacity onPress={() => navigation.navigate('EmergencyProfile', { student })}>
                  <Text style={styles.studentName}>{getStudentFullName(student)}</Text>
                  <Text style={styles.studentClassText}>{getClassroomName(student)}</Text>
                  {isParentMarkedAbsent ? <Text style={styles.tapHint}>Parent marked this learner absent today.</Text> : null}
                </TouchableOpacity>
              </View>

              <View style={styles.actionRow}>
                {[
                  { label: 'Late', value: 'Late' },
                  { label: 'Absent', value: 'Absent' },
                  { label: 'Clear', value: 'Present' },
                ].map(({ label, value }) => (
                  <TouchableOpacity
                    key={`${student.id}-${value}`}
                    style={[
                      styles.statusActionButton,
                      attendanceEntry.status === value && styles.statusActionButtonSelected,
                    ]}
                    onPress={() => handleQuickAttendanceStatus(student, value)}
                    disabled={isSavingThisStudent || !canTakeAttendance}
                  >
                    <Text style={[styles.statusActionButtonText, attendanceEntry.status === value && styles.selectedActionText]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.quickLogRow}>
                <TouchableOpacity
                  style={[styles.quickLogButton, !canLogIncidents && styles.saveStudentButtonDisabled]}
                  onPress={() => openIncidentModal(student)}
                  disabled={!canLogIncidents}
                >
                  <Text style={styles.quickLogButtonText}>Incident</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickLogButton, !canLogMedicine && styles.saveStudentButtonDisabled]}
                  onPress={() => openMedicineModal(student)}
                  disabled={!canLogMedicine}
                >
                  <Text style={styles.quickLogButtonText}>Medicine</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickLogButton, !canLogGeneral && styles.saveStudentButtonDisabled]}
                  onPress={() => openGeneralModal(student)}
                  disabled={!canLogGeneral}
                >
                  <Text style={styles.quickLogButtonText}>General</Text>
                </TouchableOpacity>
              </View>

              {isSavingThisStudent ? <Text style={styles.statusText}>Saving attendance...</Text> : null}
            </View>
          );
        })}
      </ScrollView>

      <Modal
        visible={Boolean(incidentStudent)}
        transparent
        animationType="fade"
        onRequestClose={closeIncidentModal}
      >
        <TouchableWithoutFeedback onPress={closeIncidentModal}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Log Incident</Text>
                <Text style={styles.modalText}>{incidentStudent ? getStudentFullName(incidentStudent) : ''}</Text>

                <TextInput
                  style={styles.formInput}
                  placeholder="Location"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={incidentLocation}
                  onChangeText={setIncidentLocation}
                />
                {Platform.OS !== 'web' ? (
                  <View style={styles.compactDateFieldWrapper}>
                    <Text style={styles.compactDateLabel}>When It Happened</Text>
                    <TouchableOpacity style={styles.compactDateField} onPress={() => setShowIncidentOccurredDatePicker(true)}>
                      <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(incidentOccurredYear, incidentOccurredMonth, incidentOccurredDay)}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TextInput
                  style={styles.formInput}
                  placeholder="Time happened (HH:MM)"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={incidentOccurredTime}
                  onChangeText={setIncidentOccurredTime}
                />
                <TextInput
                  style={[styles.formInput, styles.reasonInput]}
                  placeholder="Description"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={incidentDescription}
                  onChangeText={setIncidentDescription}
                  multiline
                />
                <TextInput
                  style={styles.formInput}
                  placeholder="Action Taken"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={incidentActionTaken}
                  onChangeText={setIncidentActionTaken}
                />
                <TextInput
                  style={styles.formInput}
                  placeholder="Witness"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={incidentWitness}
                  onChangeText={setIncidentWitness}
                />

                <View style={styles.modalButtonsRow}>
                  <TouchableOpacity style={styles.modalButtonSecondary} onPress={closeIncidentModal}>
                    <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButtonPrimary, incidentSaving && styles.saveStudentButtonDisabled]}
                    onPress={handleSaveIncident}
                    disabled={incidentSaving}
                  >
                    <Text style={styles.modalButtonPrimaryText}>{incidentSaving ? 'Saving...' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>

                <CompactDatePickerModal
                  visible={showIncidentOccurredDatePicker}
                  onClose={() => setShowIncidentOccurredDatePicker(false)}
                  onDateSelect={(y, m, d) => {
                    setIncidentOccurredYear(y);
                    setIncidentOccurredMonth(m);
                    setIncidentOccurredDay(d);
                  }}
                  currentYear={incidentOccurredYear}
                  currentMonth={incidentOccurredMonth}
                  currentDay={incidentOccurredDay}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={Boolean(medicineStudent)}
        transparent
        animationType="fade"
        onRequestClose={closeMedicineModal}
      >
        <TouchableWithoutFeedback onPress={closeMedicineModal}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Log Medicine</Text>
                <Text style={styles.modalText}>{medicineStudent ? getStudentFullName(medicineStudent) : ''}</Text>

                {activeMedicineAllergyWarning ? (
                  <View style={styles.warningCard}>
                    <Text style={styles.warningText}>WARNING: Medication may conflict with recorded allergy.</Text>
                  </View>
                ) : null}

                <TextInput
                  style={styles.formInput}
                  placeholder="Medication Name"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={medicineName}
                  onChangeText={setMedicineName}
                />
                {Platform.OS !== 'web' ? (
                  <View style={styles.compactDateFieldWrapper}>
                    <Text style={styles.compactDateLabel}>When It Was Given</Text>
                    <TouchableOpacity style={styles.compactDateField} onPress={() => setShowMedicineOccurredDatePicker(true)}>
                      <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(medicineOccurredYear, medicineOccurredMonth, medicineOccurredDay)}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TextInput
                  style={styles.formInput}
                  placeholder="Time given (HH:MM)"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={medicineOccurredTime}
                  onChangeText={setMedicineOccurredTime}
                />
                <TextInput
                  style={styles.formInput}
                  placeholder="Dosage"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={medicineDosage}
                  onChangeText={setMedicineDosage}
                />
                <TextInput
                  style={styles.formInput}
                  placeholder="Staff Member"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={medicineStaffMember}
                  onChangeText={setMedicineStaffMember}
                />

                <View style={styles.modalButtonsRow}>
                  <TouchableOpacity style={styles.modalButtonSecondary} onPress={closeMedicineModal}>
                    <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButtonPrimary, medicineSaving && styles.saveStudentButtonDisabled]}
                    onPress={handleSaveMedicine}
                    disabled={medicineSaving}
                  >
                    <Text style={styles.modalButtonPrimaryText}>{medicineSaving ? 'Saving...' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>

                <CompactDatePickerModal
                  visible={showMedicineOccurredDatePicker}
                  onClose={() => setShowMedicineOccurredDatePicker(false)}
                  onDateSelect={(y, m, d) => {
                    setMedicineOccurredYear(y);
                    setMedicineOccurredMonth(m);
                    setMedicineOccurredDay(d);
                  }}
                  currentYear={medicineOccurredYear}
                  currentMonth={medicineOccurredMonth}
                  currentDay={medicineOccurredDay}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={Boolean(generalStudent)}
        transparent
        animationType="fade"
        onRequestClose={closeGeneralModal}
      >
        <TouchableWithoutFeedback onPress={closeGeneralModal}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>General Communication</Text>
                <Text style={styles.modalText}>{generalStudent ? getStudentFullName(generalStudent) : ''}</Text>

                <TextInput
                  style={styles.formInput}
                  placeholder="Subject"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={generalSubject}
                  onChangeText={setGeneralSubject}
                />
                {Platform.OS !== 'web' ? (
                  <View style={styles.compactDateFieldWrapper}>
                    <Text style={styles.compactDateLabel}>When It Happened</Text>
                    <TouchableOpacity style={styles.compactDateField} onPress={() => setShowGeneralOccurredDatePicker(true)}>
                      <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(generalOccurredYear, generalOccurredMonth, generalOccurredDay)}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TextInput
                  style={styles.formInput}
                  placeholder="Time happened (HH:MM)"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={generalOccurredTime}
                  onChangeText={setGeneralOccurredTime}
                />
                <TextInput
                  style={[styles.formInput, styles.reasonInput]}
                  placeholder="Note"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={generalNote}
                  onChangeText={setGeneralNote}
                  multiline
                />
                <TextInput
                  style={styles.formInput}
                  placeholder="Staff Member"
                  placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                  value={generalStaffMember}
                  onChangeText={setGeneralStaffMember}
                />

                <View style={styles.modalButtonsRow}>
                  <TouchableOpacity style={styles.modalButtonSecondary} onPress={closeGeneralModal}>
                    <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButtonPrimary, generalSaving && styles.saveStudentButtonDisabled]}
                    onPress={handleSaveGeneral}
                    disabled={generalSaving}
                  >
                    <Text style={styles.modalButtonPrimaryText}>{generalSaving ? 'Saving...' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>

                <CompactDatePickerModal
                  visible={showGeneralOccurredDatePicker}
                  onClose={() => setShowGeneralOccurredDatePicker(false)}
                  onDateSelect={(y, m, d) => {
                    setGeneralOccurredYear(y);
                    setGeneralOccurredMonth(m);
                    setGeneralOccurredDay(d);
                  }}
                  currentYear={generalOccurredYear}
                  currentMonth={generalOccurredMonth}
                  currentDay={generalOccurredDay}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

function EmergencyProfileScreen({ route, navigation }) {
  const accessProfile = useAccessProfile();
  const canEditStudents = hasPermission(accessProfile, 'canEditStudents');
  const canEditOwnChildMedicalInfo = hasPermission(accessProfile, 'canEditOwnChildMedicalInfo');
  const canExportReports = hasPermission(accessProfile, 'canExportReports');
  const isParentAccount = isParentRole(accessProfile);
  const { student } = route.params;
  const [isMedicalAidVisible, setIsMedicalAidVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState(null);
  const [parentAbsentSaving, setParentAbsentSaving] = useState(false);
  const [showParentAbsentDatePicker, setShowParentAbsentDatePicker] = useState(false);
  const [schoolMedicalVaultPassword, setSchoolMedicalVaultPassword] = useState('');
  const [schoolEditDataPassword, setSchoolEditDataPassword] = useState('');
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [incidentHistory, setIncidentHistory] = useState([]);
  const [medicineHistory, setMedicineHistory] = useState([]);
  const [generalHistory, setGeneralHistory] = useState([]);
  const [activeHistoryModal, setActiveHistoryModal] = useState('');
  const [historyModalToRestore, setHistoryModalToRestore] = useState('');
  const [isEditAuthModalVisible, setIsEditAuthModalVisible] = useState(false);
  const [editAuthInput, setEditAuthInput] = useState('');
  const [editAuthError, setEditAuthError] = useState('');
  const [pendingEditType, setPendingEditType] = useState('');
  const [entryBeingEdited, setEntryBeingEdited] = useState(null);
  const [isEditEntryModalVisible, setIsEditEntryModalVisible] = useState(false);
  const [isSavingEntryEdit, setIsSavingEntryEdit] = useState(false);
  const [editStatus, setEditStatus] = useState('Absent');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editActionTaken, setEditActionTaken] = useState('');
  const [editWitness, setEditWitness] = useState('');
  const [editMedicationName, setEditMedicationName] = useState('');
  const [editDosage, setEditDosage] = useState('');
  const [editStaffMember, setEditStaffMember] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editNote, setEditNote] = useState('');
  const emergencyContacts = Array.isArray(student.emergencyContacts) ? student.emergencyContacts : [];
  const allergies = String(student.allergies || '').trim().toLowerCase();
  const hasCriticalAllergy = allergies && allergies !== 'none' && allergies !== 'no known allergies';
  const canOpenThisStudent = canAccessStudent(accessProfile, student);
  const canUpdateMedicalInfo = canEditStudents || (canEditOwnChildMedicalInfo && canOpenThisStudent);
  const currentYear = parseInt(TODAY.split('-')[0], 10);
  const currentMonth = parseInt(TODAY.split('-')[1], 10);
  const currentDay = parseInt(TODAY.split('-')[2], 10);
  const [parentAbsentYear, setParentAbsentYear] = useState(String(currentYear));
  const [parentAbsentMonth, setParentAbsentMonth] = useState(String(currentMonth).padStart(2, '0'));
  const [parentAbsentDay, setParentAbsentDay] = useState(String(currentDay).padStart(2, '0'));
  const parentAbsentDate = `${parentAbsentYear}-${parentAbsentMonth}-${parentAbsentDay}`;
  const parentAbsentEntry = attendanceHistory.find(
    (entry) => String(entry.date || '').trim() === parentAbsentDate && String(entry.status || '').trim() === 'Absent',
  );
  const hasParentMarkedAbsentForDate = Boolean(parentAbsentEntry?.parentReportedAbsent);

  const refreshStudentAttendanceHistory = useCallback(async () => {
    if (!student?.id) {
      setAttendanceHistory([]);
      return;
    }

    const normalizedStudentId = String(student.id || '').trim();
    const scopedAttendance = await loadAttendanceHistoryForStudentFromDataStore(normalizedStudentId);

    setAttendanceHistory(
      scopedAttendance.filter((entry) => {
        const entryStatus = String(entry.status || '').trim();
        return String(entry.studentId || '').trim() === normalizedStudentId && ['Absent', 'Late'].includes(entryStatus);
      }),
    );
  }, [isParentAccount, student?.id, accessProfile]);

  const exportLearnerHistory = useCallback(async () => {
    const escapeHtml = (value) => String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    const attendanceRows = attendanceHistory.map((entry) => `
      <tr>
        <td>${escapeHtml(entry.date || formatDateTime(entry.createdAt))}</td>
        <td>${escapeHtml(entry.status || '')}</td>
        <td>${escapeHtml(entry.reason || 'Not recorded')}</td>
      </tr>
    `).join('');

    const incidentRows = incidentHistory.map((entry) => `
      <tr>
        <td>${escapeHtml(formatDateTime(entry.occurredAt || entry.timestamp))}</td>
        <td>${escapeHtml(formatDateTime(entry.createdAt || entry.timestamp))}</td>
        <td>${escapeHtml(entry.location || 'Incident')}</td>
        <td>${escapeHtml(entry.description || '')}</td>
        <td>${escapeHtml(entry.actionTaken || 'Not recorded')}</td>
      </tr>
    `).join('');

    const medicineRows = medicineHistory.map((entry) => `
      <tr>
        <td>${escapeHtml(formatDateTime(entry.timeAdministered))}</td>
        <td>${escapeHtml(formatDateTime(entry.createdAt || entry.timeAdministered))}</td>
        <td>${escapeHtml(entry.medicationName || 'Medication')}</td>
        <td>${escapeHtml(entry.dosage || 'Not recorded')}</td>
        <td>${escapeHtml(entry.staffMember || 'Not recorded')}</td>
      </tr>
    `).join('');

    const generalRows = generalHistory.map((entry) => `
      <tr>
        <td>${escapeHtml(formatDateTime(entry.occurredAt || entry.timestamp))}</td>
        <td>${escapeHtml(formatDateTime(entry.createdAt || entry.timestamp))}</td>
        <td>${escapeHtml(entry.subject || 'General communication')}</td>
        <td>${escapeHtml(entry.note || 'Not recorded')}</td>
        <td>${escapeHtml(entry.staffMember || 'Not recorded')}</td>
      </tr>
    `).join('');

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; color: #102A43; padding: 18px; }
            h1 { margin-bottom: 4px; font-size: 22px; }
            h2 { margin-top: 18px; margin-bottom: 8px; font-size: 16px; }
            p { margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #D9E2EC; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; }
            th { background: #F0F4F8; }
          </style>
        </head>
        <body>
          <h1>Learner History Export</h1>
          <p><strong>Learner:</strong> ${escapeHtml(getStudentFullName(student))}</p>
          <p><strong>Class:</strong> ${escapeHtml(getClassroomName(student))}</p>
          <p><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString())}</p>

          <h2>Attendance (Absent and Late only)</h2>
          ${attendanceRows ? `<table><thead><tr><th>Date</th><th>Status</th><th>Reason</th></tr></thead><tbody>${attendanceRows}</tbody></table>` : '<p>No records found.</p>'}

          <h2>Incident History</h2>
          ${incidentRows ? `<table><thead><tr><th>Happened</th><th>Logged</th><th>Location</th><th>Description</th><th>Action Taken</th></tr></thead><tbody>${incidentRows}</tbody></table>` : '<p>No records found.</p>'}

          <h2>Medicine Log History</h2>
          ${medicineRows ? `<table><thead><tr><th>Given</th><th>Logged</th><th>Medication</th><th>Dosage</th><th>Staff Member</th></tr></thead><tbody>${medicineRows}</tbody></table>` : '<p>No records found.</p>'}

          <h2>General Communication History</h2>
          ${generalRows ? `<table><thead><tr><th>Happened</th><th>Logged</th><th>Subject</th><th>Note</th><th>Staff Member</th></tr></thead><tbody>${generalRows}</tbody></table>` : '<p>No records found.</p>'}
        </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const printHtml = html.replace('</body>', '<script>window.print();<\/script></body>');
        const blob = new Blob([printHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        const file = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Export Learner History',
            UTI: 'com.adobe.pdf',
          });
        } else {
          await Linking.openURL(file.uri);
        }
      }
    } catch (error) {
      Alert.alert('Export Failed', error.message || 'Could not export learner history.');
    }
  }, [attendanceHistory, incidentHistory, medicineHistory, generalHistory, student]);

  const handleDial = async (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert('Missing Number', 'No phone number was saved for this contact.');
      return;
    }

    const dialUrl = `tel:${phoneNumber}`;
    const supported = await Linking.canOpenURL(dialUrl);
    if (!supported) {
      Alert.alert('Dial Failed', 'This device cannot open the phone dialer.');
      return;
    }

    await Linking.openURL(dialUrl);
  };

  const handleToggleMedicalAid = () => {
    if (!isMedicalAidVisible) {
      setIsPinModalVisible(true);
      return;
    }

    setIsMedicalAidVisible((current) => !current);
  };

  const handleVerifyPin = () => {
    const expectedPin = String(schoolMedicalVaultPassword || student.medicalPin || '1234').trim();
    if (pinInput !== expectedPin) {
      setPinError('Incorrect password. Please try again.');
      return;
    }

    setIsMedicalAidVisible(true);
    setPinInput('');
    setPinError('');
    setIsPinModalVisible(false);
  };

  const handleCancelPin = () => {
    setPinInput('');
    setPinError('');
    setIsPinModalVisible(false);
  };

  const handleParentReportAbsentForDate = () => {
    if (!isParentAccount || !canOpenThisStudent || !student?.id) {
      return;
    }

    if (parentAbsentDate !== getCurrentLocalDateString()) {
      Alert.alert('Date Not Allowed', 'Attendance locks at midnight. Parents can only submit absence notices for today.');
      return;
    }

    Alert.alert(
      'Mark Child Absent',
      `Confirm that ${getStudentFullName(student)} will be absent on ${parentAbsentDate}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              setParentAbsentSaving(true);

              const parentReason = `Parent marked absent in app for ${parentAbsentDate}.`;
              const attendanceEntry = {
                id: `${parentAbsentDate}_${String(student.id || '').trim()}`,
                date: parentAbsentDate,
                studentId: String(student.id || '').trim(),
                studentName: getStudentFullName(student),
                className: getClassroomName(student),
                status: 'Absent',
                reason: parentReason,
                parentReportedAbsent: true,
                parentReportedAt: new Date().toISOString(),
                parentReportedByUid: String(accessProfile?.uid || '').trim(),
                parentReportedByEmail: String(accessProfile?.email || '').trim(),
              };

              await saveAttendanceRecord(parentAbsentDate, attendanceEntry, 'Absent', parentReason);
              await refreshStudentAttendanceHistory();

              Alert.alert('Saved', `Your absence notice for ${parentAbsentDate} was shared with staff.`);
            } catch (error) {
              Alert.alert('Could Not Save', error.message || 'Could not send the absence notice.');
            } finally {
              setParentAbsentSaving(false);
            }
          },
        },
      ],
    );
  };

  const handleRefreshHistory = async () => {
    if (!student?.id) return;
    setHistoryRefreshing(true);
    setHistoryLoadError(null);
    try {
      const normalizedStudentId = String(student.id || '').trim();
      const [attendanceData, incidentData, medicineData, generalData] = await Promise.all([
        loadAttendanceHistoryForStudentFromDataStore(normalizedStudentId),
        loadIncidentsForStudentFromDataStore(normalizedStudentId),
        loadMedicineLogsForStudentFromDataStore(normalizedStudentId),
        loadGeneralLogsForStudentFromDataStore(normalizedStudentId),
      ]);

      const scopedAttendance = isParentAccount ? filterRecordsByAccess(attendanceData, accessProfile) : attendanceData;
      const scopedIncidents = isParentAccount ? filterRecordsByAccess(incidentData, accessProfile) : incidentData;
      const scopedMedicine = isParentAccount ? filterRecordsByAccess(medicineData, accessProfile) : medicineData;
      const scopedGeneral = isParentAccount ? filterRecordsByAccess(generalData, accessProfile) : generalData;

      const filteredAttendance = scopedAttendance.filter((entry) => {
        const entryStatus = String(entry.status || '').trim();
        return String(entry.studentId || '').trim() === normalizedStudentId && ['Absent', 'Late'].includes(entryStatus);
      });
      const filteredIncidents = scopedIncidents.filter((entry) => String(entry.studentId || '').trim() === normalizedStudentId);
      const filteredMedicine = scopedMedicine.filter((entry) => String(entry.studentId || '').trim() === normalizedStudentId);
      const filteredGeneral = scopedGeneral.filter((entry) => String(entry.studentId || '').trim() === normalizedStudentId);

      await Promise.all([
        saveHistoryToCache(normalizedStudentId, 'attendance', filteredAttendance),
        saveHistoryToCache(normalizedStudentId, 'incidents', filteredIncidents),
        saveHistoryToCache(normalizedStudentId, 'medicine', filteredMedicine),
        saveHistoryToCache(normalizedStudentId, 'general', filteredGeneral),
      ]);

      setAttendanceHistory(filteredAttendance);
      setIncidentHistory(filteredIncidents);
      setMedicineHistory(filteredMedicine);
      setGeneralHistory(filteredGeneral);
      setHistoryLoadError(null);
    } catch (error) {
      console.warn('Could not refresh history.', error);
      setHistoryLoadError(true);
    } finally {
      setHistoryRefreshing(false);
    }
  };

  const handleDeleteStudent = () => {
    if (!canEditStudents) {
      Alert.alert('Access Restricted', 'Only principal/admin users can remove learners.');
      return;
    }

    const resolvedStudentId = String(student?.id || student?.studentId || '').trim();
    if (!resolvedStudentId) {
      Alert.alert('Could Not Remove', 'This learner record is missing an ID, so it cannot be removed.');
      return;
    }

    const removeStudentNow = async () => {
      try {
        await deleteStudentRecord(resolvedStudentId);
        Alert.alert('Deleted', `${getStudentFullName(student)} has been removed.`);
        navigation.navigate('StudentDirectory');
      } catch (error) {
        Alert.alert('Error', error.message || 'Could not delete student.');
      }
    };

    const promptMessage = `Are you sure you want to delete ${getStudentFullName(student)} from the system? This action cannot be undone.`;
    if (Platform.OS === 'web') {
      const shouldDelete = typeof window !== 'undefined' ? window.confirm(promptMessage) : true;
      if (shouldDelete) {
        void removeStudentNow();
      }
      return;
    }

    Alert.alert(
      'Delete Student',
      promptMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void removeStudentNow();
          },
        },
      ],
    );
  };

  const handleParentUndoAbsentForDate = () => {
    if (!isParentAccount || !canOpenThisStudent || !student?.id || !hasParentMarkedAbsentForDate) {
      return;
    }

    if (parentAbsentDate !== getCurrentLocalDateString()) {
      Alert.alert('Date Locked', 'Attendance locks at midnight. This absence notice can no longer be changed.');
      return;
    }

    Alert.alert(
      'Undo Absent Notice',
      `Remove absence notice for ${getStudentFullName(student)} on ${parentAbsentDate}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          onPress: async () => {
            try {
              setParentAbsentSaving(true);

              const fallbackEntry = {
                id: `${parentAbsentDate}_${String(student.id || '').trim()}`,
                date: parentAbsentDate,
                studentId: String(student.id || '').trim(),
                studentName: getStudentFullName(student),
                className: getClassroomName(student),
                status: 'Absent',
                reason: '',
                parentReportedAbsent: true,
              };

              await saveAttendanceRecord(parentAbsentDate, parentAbsentEntry || fallbackEntry, 'Present', '');
              await refreshStudentAttendanceHistory();

              Alert.alert('Updated', `Absence notice for ${parentAbsentDate} was removed.`);
            } catch (error) {
              Alert.alert('Could Not Undo', error.message || 'Could not remove the absence notice.');
            } finally {
              setParentAbsentSaving(false);
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!canOpenThisStudent) {
      Alert.alert('Access Restricted', 'This account can only open the learner profile linked to it.');
      navigation.goBack();
    }
  }, [canOpenThisStudent, navigation]);

  useEffect(() => {
    let isMounted = true;

    const loadSchoolVaultPassword = async () => {
      try {
        const schoolConfig = await getCurrentSchoolConfig();
        if (!isMounted) return;
        setSchoolMedicalVaultPassword(String(schoolConfig?.medicalVaultPassword || '').trim());
        setSchoolEditDataPassword(String(schoolConfig?.editDataPassword || '').trim());
      } catch (_error) {
        if (isMounted) {
          setSchoolMedicalVaultPassword('');
          setSchoolEditDataPassword('');
        }
      }
    };

    loadSchoolVaultPassword();
    return () => {
      isMounted = false;
    };
  }, [accessProfile?.schoolId]);

  useEffect(() => {
    let isActive = true;

    const loadParentHistory = async (isRefresh = false) => {
      if (!student?.id) {
        setAttendanceHistory([]);
        setIncidentHistory([]);
        setMedicineHistory([]);
        setGeneralHistory([]);
        if (!isRefresh) setHistoryLoading(false);
        if (isRefresh) setHistoryRefreshing(false);
        return;
      }

      if (!isRefresh) setHistoryLoading(true);
      if (isRefresh) setHistoryRefreshing(true);
      setHistoryLoadError(null);

      try {
        const normalizedStudentId = String(student.id || '').trim();

        // Load from cache first (optimistic)
        const [cachedAttendance, cachedIncidents, cachedMedicine, cachedGeneral] = await Promise.all([
          loadHistoryFromCache(normalizedStudentId, 'attendance'),
          loadHistoryFromCache(normalizedStudentId, 'incidents'),
          loadHistoryFromCache(normalizedStudentId, 'medicine'),
          loadHistoryFromCache(normalizedStudentId, 'general'),
        ]);

        if (isActive) {
          setAttendanceHistory(cachedAttendance);
          setIncidentHistory(cachedIncidents);
          setMedicineHistory(cachedMedicine);
          setGeneralHistory(cachedGeneral);
        }

        // Fetch fresh data in background
        const [attendanceData, incidentData, medicineData, generalData] = await Promise.all([
          loadAttendanceHistoryForStudentFromDataStore(normalizedStudentId),
          loadIncidentsForStudentFromDataStore(normalizedStudentId),
          loadMedicineLogsForStudentFromDataStore(normalizedStudentId),
          loadGeneralLogsForStudentFromDataStore(normalizedStudentId),
        ]);

        if (!isActive) return;

        const scopedAttendance = isParentAccount ? filterRecordsByAccess(attendanceData, accessProfile) : attendanceData;
        const scopedIncidents = isParentAccount ? filterRecordsByAccess(incidentData, accessProfile) : incidentData;
        const scopedMedicine = isParentAccount ? filterRecordsByAccess(medicineData, accessProfile) : medicineData;
        const scopedGeneral = isParentAccount ? filterRecordsByAccess(generalData, accessProfile) : generalData;

        const filteredAttendance = scopedAttendance.filter((entry) => {
          const entryStatus = String(entry.status || '').trim();
          return String(entry.studentId || '').trim() === normalizedStudentId && ['Absent', 'Late'].includes(entryStatus);
        });
        const filteredIncidents = scopedIncidents.filter((entry) => String(entry.studentId || '').trim() === normalizedStudentId);
        const filteredMedicine = scopedMedicine.filter((entry) => String(entry.studentId || '').trim() === normalizedStudentId);
        const filteredGeneral = scopedGeneral.filter((entry) => String(entry.studentId || '').trim() === normalizedStudentId);

        // Cache the fresh data
        await Promise.all([
          saveHistoryToCache(normalizedStudentId, 'attendance', filteredAttendance),
          saveHistoryToCache(normalizedStudentId, 'incidents', filteredIncidents),
          saveHistoryToCache(normalizedStudentId, 'medicine', filteredMedicine),
          saveHistoryToCache(normalizedStudentId, 'general', filteredGeneral),
        ]);

        // Update UI with fresh data
        if (isActive) {
          setAttendanceHistory(filteredAttendance);
          setIncidentHistory(filteredIncidents);
          setMedicineHistory(filteredMedicine);
          setGeneralHistory(filteredGeneral);
          setHistoryLoadError(null);
        }
      } catch (error) {
        console.warn('Could not load parent history view.', error);
        if (isActive) {
          setHistoryLoadError(true);
        }
      } finally {
        if (isActive) {
          if (!isRefresh) setHistoryLoading(false);
          if (isRefresh) setHistoryRefreshing(false);
        }
      }
    };

    loadParentHistory(false);
    return () => {
      isActive = false;
    };
  }, [isParentAccount, student?.id, accessProfile]);

  const getDateAndTimeParts = (value) => {
    const fallbackDate = getCurrentLocalDateString();
    const fallbackTime = getCurrentLocalTimeString();
    if (!value) {
      return { date: fallbackDate, time: fallbackTime };
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return { date: fallbackDate, time: fallbackTime };
    }

    const datePart = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    const timePart = `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
    return { date: datePart, time: timePart };
  };

  const closeEditAuthModal = () => {
    setIsEditAuthModalVisible(false);
    setEditAuthInput('');
    setEditAuthError('');
    setPendingEditType('');
    setEntryBeingEdited(null);
    if (historyModalToRestore) {
      setActiveHistoryModal(historyModalToRestore);
      setHistoryModalToRestore('');
    }
  };

  const closeEditEntryModal = () => {
    const modalKeyToRestore = historyModalToRestore;
    setIsEditEntryModalVisible(false);
    setEntryBeingEdited(null);
    setPendingEditType('');
    setEditStatus('Absent');
    setEditDate('');
    setEditTime('');
    setEditReason('');
    setEditLocation('');
    setEditDescription('');
    setEditActionTaken('');
    setEditWitness('');
    setEditMedicationName('');
    setEditDosage('');
    setEditStaffMember('');
    setEditSubject('');
    setEditNote('');
    if (modalKeyToRestore) {
      setActiveHistoryModal(modalKeyToRestore);
      setHistoryModalToRestore('');
    }
  };

  const populateEntryEditForm = (entryType, entry) => {
    const rawDateTime = entryType === 'medicine'
      ? (entry?.timeAdministered || entry?.createdAt)
      : (entry?.occurredAt || entry?.timestamp || entry?.createdAt);
    const { date, time } = getDateAndTimeParts(rawDateTime);
    setPendingEditType(entryType);
    setEntryBeingEdited(entry);
    setEditDate(date);
    setEditTime(time);

    if (entryType === 'attendance') {
      const normalizedStatus = String(entry?.status || 'Absent').trim();
      setEditStatus(['Absent', 'Late'].includes(normalizedStatus) ? normalizedStatus : 'Absent');
      setEditReason(String(entry?.reason || '').trim());
      setEditDate(String(entry?.date || date).trim());
    } else if (entryType === 'incidents') {
      setEditLocation(String(entry?.location || '').trim());
      setEditDescription(String(entry?.description || '').trim());
      setEditActionTaken(String(entry?.actionTaken || '').trim());
      setEditWitness(String(entry?.witness || '').trim());
    } else if (entryType === 'medicine') {
      setEditMedicationName(String(entry?.medicationName || '').trim());
      setEditDosage(String(entry?.dosage || '').trim());
      setEditStaffMember(String(entry?.staffMember || '').trim());
    } else if (entryType === 'general') {
      setEditSubject(String(entry?.subject || '').trim());
      setEditNote(String(entry?.note || '').trim());
      setEditStaffMember(String(entry?.staffMember || '').trim());
    }

    setIsEditEntryModalVisible(true);
  };

  const handleRequestEntryEdit = (entryType, entry) => {
    const expectedPassword = String(schoolEditDataPassword || '').trim();
    if (!expectedPassword) {
      Alert.alert('Set Password First', 'Principal/admin must set Learner History Edit Password in Profile & Settings before edits are allowed.');
      return;
    }

    const currentHistoryModal = String(activeHistoryModal || '').trim();
    if (currentHistoryModal) {
      setHistoryModalToRestore(currentHistoryModal);
      setActiveHistoryModal('');
    }

    setPendingEditType(entryType);
    setEntryBeingEdited(entry);
    setEditAuthInput('');
    setEditAuthError('');
    setTimeout(() => {
      setIsEditAuthModalVisible(true);
    }, 50);
  };

  const handleVerifyEditPassword = () => {
    const expectedPassword = String(schoolEditDataPassword || '').trim();
    if (editAuthInput.trim() !== expectedPassword) {
      setEditAuthError('Incorrect password. Please try again.');
      return;
    }

    const nextType = pendingEditType;
    const nextEntry = entryBeingEdited;
    setIsEditAuthModalVisible(false);
    setEditAuthInput('');
    setEditAuthError('');
    if (nextType && nextEntry) {
      populateEntryEditForm(nextType, nextEntry);
    }
  };

  const handleSaveEditedEntry = async () => {
    if (!entryBeingEdited?.id || !pendingEditType) {
      return;
    }

    try {
      setIsSavingEntryEdit(true);

      if (pendingEditType === 'attendance') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
          Alert.alert('Invalid Date', 'Use date format YYYY-MM-DD.');
          return;
        }

        const nextStatus = ['Absent', 'Late'].includes(editStatus) ? editStatus : 'Absent';
        const updatedEntry = await updateAttendanceHistoryEntry(entryBeingEdited.id, {
          date: editDate,
          status: nextStatus,
          reason: String(editReason || '').trim(),
        });

        setAttendanceHistory((current) => current
          .map((item) => (item.id === updatedEntry.id ? updatedEntry : item))
          .filter((item) => ['Absent', 'Late'].includes(String(item?.status || '').trim())));
      }

      if (pendingEditType === 'incidents') {
        const occurredAt = buildIncidentOccurredAt(editDate, editTime);
        if (!occurredAt) {
          Alert.alert('Invalid Time', 'Enter a valid date and time in 24-hour format (HH:MM).');
          return;
        }

        const updatedEntry = await updateIncidentHistoryEntry(entryBeingEdited.id, {
          location: String(editLocation || '').trim(),
          description: String(editDescription || '').trim(),
          actionTaken: String(editActionTaken || '').trim(),
          witness: String(editWitness || '').trim(),
          occurredAt,
        });
        setIncidentHistory((current) => current.map((item) => (item.id === updatedEntry.id ? updatedEntry : item)));
      }

      if (pendingEditType === 'medicine') {
        const timeAdministered = buildIncidentOccurredAt(editDate, editTime);
        if (!timeAdministered) {
          Alert.alert('Invalid Time', 'Enter a valid date and time in 24-hour format (HH:MM).');
          return;
        }

        const updatedEntry = await updateMedicineHistoryEntry(entryBeingEdited.id, {
          medicationName: String(editMedicationName || '').trim(),
          dosage: String(editDosage || '').trim(),
          staffMember: String(editStaffMember || '').trim(),
          timeAdministered,
        });
        setMedicineHistory((current) => current.map((item) => (item.id === updatedEntry.id ? updatedEntry : item)));
      }

      if (pendingEditType === 'general') {
        const occurredAt = buildIncidentOccurredAt(editDate, editTime);
        if (!occurredAt) {
          Alert.alert('Invalid Time', 'Enter a valid date and time in 24-hour format (HH:MM).');
          return;
        }

        const updatedEntry = await updateGeneralHistoryEntry(entryBeingEdited.id, {
          subject: String(editSubject || '').trim(),
          note: String(editNote || '').trim(),
          staffMember: String(editStaffMember || '').trim(),
          occurredAt,
        });
        setGeneralHistory((current) => current.map((item) => (item.id === updatedEntry.id ? updatedEntry : item)));
      }

      closeEditEntryModal();
      Alert.alert('Updated', 'Entry updated successfully.');
    } catch (error) {
      Alert.alert('Update Failed', error.message || 'Could not update this entry.');
    } finally {
      setIsSavingEntryEdit(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.profileName}>{getStudentFullName(student)}</Text>

        {canUpdateMedicalInfo ? (
          <TouchableOpacity
            style={styles.editStudentButton}
            onPress={() => navigation.navigate('StudentForm', { mode: canEditStudents ? 'edit' : 'parent-edit', student })}
          >
            <Text style={styles.editStudentButtonText}>{canEditStudents ? 'Edit Student' : 'Update Medical Info'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>This account can view the learner profile but cannot edit student details.</Text>
          </View>
        )}

        {canEditStudents ? (
          <TouchableOpacity style={styles.modalButtonSecondary} onPress={handleDeleteStudent}>
            <Text style={styles.modalButtonSecondaryText}>Remove Student</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contact Details</Text>
          {emergencyContacts.map((contact, index) => (
            <TouchableOpacity
              key={`${contact.number || 'contact'}-${index}`}
              style={styles.contactButton}
              onPress={() => handleDial(contact.number)}
            >
              <Text style={styles.contactButtonText}>
                Call {contact.name || `Emergency Contact ${index + 1}`}: {formatPhoneForDisplay(contact.number)}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.contactButton, styles.doctorButton]}
            onPress={() => handleDial(student.doctorContact)}
          >
            <Text style={styles.contactButtonText}>Call Doctor: {formatPhoneForDisplay(student.doctorContact)}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, hasCriticalAllergy ? styles.allergyAlertCard : styles.noAllergyCard]}>
          <Text style={styles.sectionTitle}>Allergies</Text>
          <Text style={styles.allergyText}>{student.allergies || 'None reported'}</Text>
        </View>

        {isParentAccount ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Attendance Notice</Text>
            <Text style={styles.infoText}>Attendance notices are only open for today and lock automatically at 12:00 AM.</Text>
            <View style={styles.compactDateFieldWrapper}>
              <Text style={styles.compactDateLabel}>Absent Date</Text>
              <TouchableOpacity
                style={styles.compactDateField}
                onPress={() => setShowParentAbsentDatePicker(true)}
              >
                <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(parentAbsentYear, parentAbsentMonth, parentAbsentDay)}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.editStudentButton, (hasParentMarkedAbsentForDate || parentAbsentDate !== getCurrentLocalDateString()) && styles.moduleCardDisabled]}
              onPress={handleParentReportAbsentForDate}
              disabled={parentAbsentSaving || hasParentMarkedAbsentForDate || parentAbsentDate !== getCurrentLocalDateString()}
            >
              <Text style={styles.editStudentButtonText}>
                {parentAbsentSaving
                  ? 'Saving absence...'
                  : hasParentMarkedAbsentForDate
                    ? 'Absent for selected date submitted'
                    : parentAbsentDate !== getCurrentLocalDateString()
                      ? 'Only today can be submitted'
                      : 'Child Will Be Absent'}
              </Text>
            </TouchableOpacity>
            {parentAbsentDate !== getCurrentLocalDateString() ? (
              <Text style={styles.tapHint}>Past and future attendance dates are locked for parent updates.</Text>
            ) : null}
            {hasParentMarkedAbsentForDate ? (
              <>
                <Text style={styles.tapHint}>Staff can now see this for {parentAbsentDate} under attendance.</Text>
                <TouchableOpacity
                  style={styles.undoAbsentButton}
                  onPress={handleParentUndoAbsentForDate}
                  disabled={parentAbsentSaving || parentAbsentDate !== getCurrentLocalDateString()}
                >
                  <Text style={styles.undoAbsentButtonText}>{parentAbsentSaving ? 'Updating...' : 'Undo Absent for Selected Date'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <CompactDatePickerModal
              visible={showParentAbsentDatePicker}
              onClose={() => setShowParentAbsentDatePicker(false)}
              onDateSelect={(y, m, d) => {
                setParentAbsentYear(y);
                setParentAbsentMonth(m);
                setParentAbsentDay(d);
              }}
              currentYear={parentAbsentYear}
              currentMonth={parentAbsentMonth}
              currentDay={parentAbsentDay}
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Medical Aid Vault</Text>
          <Text style={styles.vaultText}>
            Provider: {isMedicalAidVisible ? student.medicalAidName || 'Not recorded' : '********'}
          </Text>
          <Text style={styles.vaultText}>
            Plan: {isMedicalAidVisible ? student.medicalAidPlan || 'Not recorded' : '********'}
          </Text>
          <Text style={styles.vaultText}>
            Number: {isMedicalAidVisible ? student.medicalAidNumber || 'Not recorded' : '************'}
          </Text>
          <Text style={styles.vaultText}>
            Main Member: {isMedicalAidVisible ? student.mainMemberName || 'Not recorded' : '********'}
          </Text>
          <Text style={styles.vaultText}>
            Main Member ID: {isMedicalAidVisible ? student.mainMemberIdNumber || 'Not recorded' : '************'}
          </Text>
          <Text style={styles.vaultText}>
            Child ID: {isMedicalAidVisible ? student.childId || 'Not recorded' : '********'}
          </Text>
          <Text style={styles.vaultText}>
            Child Dependency Code: {isMedicalAidVisible ? student.childDependencyCode || 'Not recorded' : '********'}
          </Text>

          <TouchableOpacity style={styles.vaultToggleButton} onPress={handleToggleMedicalAid}>
            <Text style={styles.vaultToggleButtonText}>
              {isMedicalAidVisible ? 'Hide Medical Aid' : 'Show Medical Aid'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Learner History</Text>
          <Text style={styles.infoText}>{"Open a category to view that learner's detailed history without scrolling through every record on this page."}</Text>
          {[
            { key: 'attendance', label: `Attendance (${attendanceHistory.length})` },
            { key: 'incidents', label: `Incident (${incidentHistory.length})` },
            { key: 'medicine', label: `Medicine (${medicineHistory.length})` },
            { key: 'general', label: `General Communication (${generalHistory.length})` },
          ].map((item) => (
            <TouchableOpacity key={item.key} style={styles.reportButton} onPress={() => setActiveHistoryModal(item.key)}>
              <Text style={styles.saveStudentButtonText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.reportButton, !canExportReports && styles.saveStudentButtonDisabled]}
          onPress={exportLearnerHistory}
          disabled={!canExportReports}
        >
          <Text style={styles.saveStudentButtonText}>
            {canExportReports ? 'Export Learner History' : 'Export not available for your role'}
          </Text>
        </TouchableOpacity>

        <LearnerHistoryModal
          visible={activeHistoryModal === 'attendance'}
          title="Attendance History"
          emptyText="No late or absent records yet."
          loading={historyLoading}
          refreshing={historyRefreshing}
          hasError={historyLoadError}
          onClose={() => setActiveHistoryModal('')}
          onRefresh={handleRefreshHistory}
        >
          {!historyLoading && attendanceHistory.length > 0 ? attendanceHistory.map((entry) => (
            <View key={entry.id} style={styles.timelineCard}>
              <View style={styles.timelineCardHeader}>
                <Text style={styles.studentName}>{entry.status}</Text>
                <TouchableOpacity style={styles.timelineEditButton} onPress={() => handleRequestEntryEdit('attendance', entry)}>
                  <Text style={styles.timelineEditButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.timelineMeta}>{entry.date || formatDateTime(entry.createdAt)} • {entry.className || getClassroomName(student)}</Text>
              {entry.reason ? <Text style={styles.timelineText}>Reason: {entry.reason}</Text> : null}
            </View>
          )) : null}
        </LearnerHistoryModal>

        <LearnerHistoryModal
          visible={activeHistoryModal === 'incidents'}
          title="Incident History"
          emptyText="No incident records yet."
          loading={historyLoading}
          refreshing={historyRefreshing}
          hasError={historyLoadError}
          onClose={() => setActiveHistoryModal('')}
          onRefresh={handleRefreshHistory}
        >
          {!historyLoading && incidentHistory.length > 0 ? incidentHistory.map((entry) => (
            <View key={entry.id} style={styles.timelineCard}>
              <View style={styles.timelineCardHeader}>
                <Text style={styles.studentName}>{entry.location || 'Incident'}</Text>
                <TouchableOpacity style={styles.timelineEditButton} onPress={() => handleRequestEntryEdit('incidents', entry)}>
                  <Text style={styles.timelineEditButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.timelineMeta}>Happened: {formatDateTime(entry.occurredAt || entry.timestamp)}</Text>
              <Text style={styles.tapHint}>Logged: {formatDateTime(entry.createdAt || entry.timestamp)}</Text>
              <Text style={styles.timelineText}>{entry.description}</Text>
              <Text style={styles.tapHint}>Action taken: {entry.actionTaken || 'Not recorded'}</Text>
            </View>
          )) : null}
        </LearnerHistoryModal>

        <LearnerHistoryModal
          visible={activeHistoryModal === 'medicine'}
          title="Medicine History"
          emptyText="No medicine entries yet."
          loading={historyLoading}
          refreshing={historyRefreshing}
          hasError={historyLoadError}
          onClose={() => setActiveHistoryModal('')}
          onRefresh={handleRefreshHistory}
        >
          {!historyLoading && medicineHistory.length > 0 ? medicineHistory.map((entry) => (
            <View key={entry.id} style={styles.timelineCard}>
              <View style={styles.timelineCardHeader}>
                <Text style={styles.studentName}>{entry.medicationName || 'Medication'}</Text>
                <TouchableOpacity style={styles.timelineEditButton} onPress={() => handleRequestEntryEdit('medicine', entry)}>
                  <Text style={styles.timelineEditButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.timelineMeta}>Given: {formatDateTime(entry.timeAdministered)}</Text>
              <Text style={styles.tapHint}>Logged: {formatDateTime(entry.createdAt || entry.timeAdministered)}</Text>
              <Text style={styles.timelineText}>Dosage: {entry.dosage || 'Not recorded'}</Text>
              <Text style={styles.tapHint}>Staff member: {entry.staffMember || 'Not recorded'}</Text>
            </View>
          )) : null}
        </LearnerHistoryModal>

        <LearnerHistoryModal
          visible={activeHistoryModal === 'general'}
          title="General Communication History"
          emptyText="No general communication entries yet."
          loading={historyLoading}
          refreshing={historyRefreshing}
          hasError={historyLoadError}
          onClose={() => setActiveHistoryModal('')}
          onRefresh={handleRefreshHistory}
        >
          {!historyLoading && generalHistory.length > 0 ? generalHistory.map((entry) => (
            <View key={entry.id} style={styles.timelineCard}>
              <View style={styles.timelineCardHeader}>
                <Text style={styles.studentName}>{entry.subject || 'General communication'}</Text>
                <TouchableOpacity style={styles.timelineEditButton} onPress={() => handleRequestEntryEdit('general', entry)}>
                  <Text style={styles.timelineEditButtonText}>Edit</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.timelineMeta}>Happened: {formatDateTime(entry.occurredAt || entry.timestamp)}</Text>
              <Text style={styles.tapHint}>Logged: {formatDateTime(entry.createdAt || entry.timestamp)}</Text>
              <Text style={styles.timelineText}>{entry.note || 'Not recorded'}</Text>
              <Text style={styles.tapHint}>Staff member: {entry.staffMember || 'Not recorded'}</Text>
            </View>
          )) : null}
        </LearnerHistoryModal>

        <Modal
          visible={isEditAuthModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeEditAuthModal}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Enter Edit Password</Text>
              <Text style={styles.modalText}>Enter the shared Learner History Edit Password to continue.</Text>

              <TextInput
                style={styles.pinInput}
                value={editAuthInput}
                onChangeText={(text) => {
                  setEditAuthInput(text);
                  setEditAuthError('');
                }}
                placeholder="Edit data password"
                secureTextEntry
                autoCapitalize="none"
              />

              {editAuthError ? <Text style={styles.errorText}>{editAuthError}</Text> : null}

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={styles.modalButtonSecondary} onPress={closeEditAuthModal}>
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleVerifyEditPassword}>
                  <Text style={styles.modalButtonPrimaryText}>Verify</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isEditEntryModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeEditEntryModal}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Entry</Text>
              <ScrollView
                style={styles.modalScrollContent}
                contentContainerStyle={styles.modalScrollContentInner}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {pendingEditType === 'attendance' ? (
                  <>
                    <Text style={styles.formSectionLabel}>Status</Text>
                    <View style={styles.actionRow}>
                      {['Absent', 'Late'].map((value) => (
                        <TouchableOpacity
                          key={value}
                          style={[
                            styles.statusActionButton,
                            editStatus === value && styles.statusActionButtonSelected,
                          ]}
                          onPress={() => setEditStatus(value)}
                        >
                          <Text style={[styles.statusActionButtonText, editStatus === value && styles.selectedActionText]}>{value}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Date (YYYY-MM-DD)"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editDate}
                      onChangeText={setEditDate}
                      autoCapitalize="none"
                    />
                    <TextInput
                      style={[styles.formInput, styles.reasonInput]}
                      placeholder="Reason"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editReason}
                      onChangeText={setEditReason}
                      multiline
                    />
                  </>
                ) : null}

                {pendingEditType === 'incidents' ? (
                  <>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Location"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editLocation}
                      onChangeText={setEditLocation}
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Date happened (YYYY-MM-DD)"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editDate}
                      onChangeText={setEditDate}
                      autoCapitalize="none"
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Time happened (HH:MM)"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editTime}
                      onChangeText={setEditTime}
                    />
                    <TextInput
                      style={[styles.formInput, styles.reasonInput]}
                      placeholder="Description"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editDescription}
                      onChangeText={setEditDescription}
                      multiline
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Action taken"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editActionTaken}
                      onChangeText={setEditActionTaken}
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Witness"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editWitness}
                      onChangeText={setEditWitness}
                    />
                  </>
                ) : null}

                {pendingEditType === 'medicine' ? (
                  <>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Medication name"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editMedicationName}
                      onChangeText={setEditMedicationName}
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Date given (YYYY-MM-DD)"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editDate}
                      onChangeText={setEditDate}
                      autoCapitalize="none"
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Time given (HH:MM)"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editTime}
                      onChangeText={setEditTime}
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Dosage"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editDosage}
                      onChangeText={setEditDosage}
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Staff member"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editStaffMember}
                      onChangeText={setEditStaffMember}
                    />
                  </>
                ) : null}

                {pendingEditType === 'general' ? (
                  <>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Subject"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editSubject}
                      onChangeText={setEditSubject}
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Date happened (YYYY-MM-DD)"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editDate}
                      onChangeText={setEditDate}
                      autoCapitalize="none"
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Time happened (HH:MM)"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editTime}
                      onChangeText={setEditTime}
                    />
                    <TextInput
                      style={[styles.formInput, styles.reasonInput]}
                      placeholder="Note"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editNote}
                      onChangeText={setEditNote}
                      multiline
                    />
                    <TextInput
                      style={styles.formInput}
                      placeholder="Staff member"
                      placeholderTextColor={FORM_PLACEHOLDER_COLOR}
                      value={editStaffMember}
                      onChangeText={setEditStaffMember}
                    />
                  </>
                ) : null}
              </ScrollView>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={styles.modalButtonSecondary} onPress={closeEditEntryModal}>
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButtonPrimary, isSavingEntryEdit && styles.saveStudentButtonDisabled]}
                  onPress={handleSaveEditedEntry}
                  disabled={isSavingEntryEdit}
                >
                  <Text style={styles.modalButtonPrimaryText}>{isSavingEntryEdit ? 'Saving...' : 'Save Changes'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isPinModalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCancelPin}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Enter Password</Text>
              <Text style={styles.modalText}>Enter your Medical Aid Vault password to view medical aid details.</Text>

              <TextInput
                style={styles.pinInput}
                value={pinInput}
                onChangeText={(text) => {
                  setPinInput(text);
                  setPinError('');
                }}
                placeholder="Vault password"
                secureTextEntry
                autoCapitalize="none"
              />

              {pinError ? <Text style={styles.errorText}>{pinError}</Text> : null}

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={styles.modalButtonSecondary} onPress={handleCancelPin}>
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleVerifyPin}>
                  <Text style={styles.modalButtonPrimaryText}>Verify</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

function AttendanceRegisterScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const canTakeAttendance = hasPermission(accessProfile, 'canTakeAttendance');
  const [entries, setEntries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const studentData = await loadStudentsFromDataStore();
      const nextEntries = await loadAttendanceFromDataStore(TODAY, studentData);
      setEntries(Array.isArray(nextEntries) ? nextEntries : []);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load the attendance register.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useFocusEffect(
    useCallback(() => {
      fetchAttendance();
    }, [fetchAttendance]),
  );

  useEffect(() => {
    if (!canTakeAttendance) {
      Alert.alert('Access Restricted', 'Your account does not have permission to open Attendance.');
      navigation.goBack();
    }
  }, [canTakeAttendance, navigation]);

  const groupedEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filteredEntries = entries.filter((entry) => {
      const studentName = String(entry.studentName || '').toLowerCase();
      const studentId = String(entry.studentId || '').toLowerCase();
      const className = getClassroomName(entry).toLowerCase();
      return !query || studentName.includes(query) || studentId.includes(query) || className.includes(query);
    });

    const grouped = filteredEntries.reduce((accumulator, entry) => {
      const className = getClassroomName(entry);
      if (!accumulator[className]) {
        accumulator[className] = [];
      }
      accumulator[className].push(entry);
      return accumulator;
    }, {});

    return Object.entries(grouped).map(([className, learners]) => ({
      className,
      learners,
    }));
  }, [entries, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>Daily Attendance</Text>
        <Text style={styles.subtitle}>Date: {TODAY}</Text>
        <Text style={styles.helperText}>Tap a class folder to go inside it and update attendance for that group.</Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Search any learner, ID, or class"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {loading ? <Text style={styles.statusText}>Loading register...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {!loading && !errorMessage && groupedEntries.length === 0 ? <Text style={styles.statusText}>No learners found for this search.</Text> : null}

        {groupedEntries.map((group) => (
          <TouchableOpacity
            key={group.className}
            style={styles.moduleCard}
            onPress={() => navigation.navigate('AttendanceClassFolder', { className: group.className, date: TODAY })}
          >
            <View style={styles.folderHeaderRow}>
              <View style={styles.folderTextWrap}>
                <Text style={styles.moduleTitle}>{group.className}</Text>
                <Text style={styles.moduleSubtitle}>{group.learners.length} learners • Tap to open</Text>
              </View>
              <Text style={styles.folderToggleText}>Open</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function AttendanceClassFolderScreen({ route, navigation }) {
  const accessProfile = useAccessProfile();
  const canTakeAttendance = hasPermission(accessProfile, 'canTakeAttendance');
  const className = route.params?.className || 'Attendance Folder';
  const registerDate = route.params?.date || TODAY;
  const isAttendanceLocked = !isAttendanceDateEditable(registerDate);
  const [entries, setEntries] = useState([]);
  const [notes, setNotes] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [savingStudentId, setSavingStudentId] = useState('');

  useEffect(() => {
    if (!canTakeAttendance) {
      Alert.alert('Access Restricted', 'Your account does not have permission to open Attendance.');
      navigation.goBack();
    }
  }, [canTakeAttendance, navigation]);

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const studentData = await loadStudentsFromDataStore();
      const nextEntries = await loadAttendanceFromDataStore(registerDate, studentData);
      setEntries(Array.isArray(nextEntries) ? nextEntries : []);

      const nextNotes = {};
      nextEntries.forEach((entry) => {
        nextNotes[entry.studentId] = entry.reason || '';
      });
      setNotes(nextNotes);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load the class attendance folder.');
    } finally {
      setLoading(false);
    }
  }, [registerDate]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useFocusEffect(
    useCallback(() => {
      fetchAttendance();
    }, [fetchAttendance]),
  );

  const visibleEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesClass = getClassroomName(entry) === className;
      const studentName = String(entry.studentName || '').toLowerCase();
      const studentId = String(entry.studentId || '').toLowerCase();
      return matchesClass && (!query || studentName.includes(query) || studentId.includes(query));
    });
  }, [entries, searchQuery, className]);

  const handleStatusUpdate = async (entry, status) => {
    const reason = String(notes[entry.studentId] || '').trim();

    try {
      setSavingStudentId(entry.studentId);
      const updatedEntry = await saveAttendanceRecord(registerDate, entry, status, reason);

      setEntries((currentEntries) => currentEntries.map((currentEntry) => (
        currentEntry.studentId === entry.studentId ? updatedEntry : currentEntry
      )));
    } catch (error) {
      Alert.alert('Update Failed', error.message || 'Could not update attendance.');
    } finally {
      setSavingStudentId('');
    }
  };

  const statusStyleFor = (status) => {
    if (status === 'Late') {
      return styles.statusBadgeLate;
    }

    if (status === 'Absent') {
      return styles.statusBadgeAbsent;
    }

    return styles.statusBadgePresent;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>{className}</Text>
        <Text style={styles.subtitle}>Attendance for {registerDate}</Text>
        <Text style={styles.helperText}>Present is assumed. Only `Late` or `Absent` entries are logged.</Text>

        <TextInput
          style={styles.searchInput}
          placeholder={`Search inside ${className}`}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {loading ? <Text style={styles.statusText}>Loading class attendance...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {!canTakeAttendance ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>This account can view attendance but cannot change it.</Text>
          </View>
        ) : null}
        {canTakeAttendance && isAttendanceLocked ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>Attendance for {registerDate} is locked. Changes are only allowed until 12:00 AM on that date.</Text>
          </View>
        ) : null}
        {!loading && !errorMessage && visibleEntries.length === 0 ? (
          <Text style={styles.statusText}>No learners found in this class.</Text>
        ) : null}

        {visibleEntries.map((entry) => (
          <View key={entry.studentId} style={styles.sectionCard}>
            <View style={styles.itemHeaderRow}>
              <View>
                <Text style={styles.studentName}>{entry.studentName}</Text>
                <Text style={styles.studentClassText}>{entry.studentId} • {getClassroomName(entry)}</Text>
                {entry.status === 'Absent' && (
                  entry.parentReportedAbsent
                  || String(entry.reason || '').toLowerCase().includes(PARENT_ABSENT_REASON.toLowerCase())
                ) ? (
                  <Text style={styles.tapHint}>Parent marked this learner absent today.</Text>
                ) : null}
              </View>
              <View style={[styles.statusBadge, statusStyleFor(entry.status)]}>
                <Text style={styles.statusBadgeText}>{entry.status}</Text>
              </View>
            </View>

            <TextInput
              style={[styles.formInput, styles.reasonInput]}
              placeholder="Reason for late arrival or absence"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={notes[entry.studentId] ?? ''}
              editable={!isAttendanceLocked && canTakeAttendance}
              onChangeText={(text) => setNotes((currentNotes) => ({
                ...currentNotes,
                [entry.studentId]: text,
              }))}
            />

            <View style={styles.actionRow}>
              {[
                { label: 'Late', value: 'Late' },
                { label: 'Absent', value: 'Absent' },
                { label: 'Clear', value: 'Present' },
              ].map(({ label, value }) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.statusActionButton,
                    entry.status === value && styles.statusActionButtonSelected,
                  ]}
                  onPress={() => handleStatusUpdate(entry, value)}
                  disabled={savingStudentId === entry.studentId || !canTakeAttendance || isAttendanceLocked}
                >
                  <Text style={[styles.statusActionButtonText, entry.status === value && styles.selectedActionText]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {savingStudentId === entry.studentId ? <Text style={styles.statusText}>Saving update...</Text> : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function IncidentRegisterScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const canLogIncidents = hasPermission(accessProfile, 'canLogIncidents');
  const initialIncidentDate = getCurrentLocalDateString();
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [location, setLocation] = useState('Playground');
  const [description, setDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [witness, setWitness] = useState('');
  const [occurredYear, setOccurredYear] = useState(initialIncidentDate.split('-')[0]);
  const [occurredMonth, setOccurredMonth] = useState(initialIncidentDate.split('-')[1]);
  const [occurredDay, setOccurredDay] = useState(initialIncidentDate.split('-')[2]);
  const [occurredTime, setOccurredTime] = useState(getCurrentLocalTimeString());
  const [showOccurredDatePicker, setShowOccurredDatePicker] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId],
  );

  useEffect(() => {
    if (!canLogIncidents) {
      Alert.alert('Access Restricted', 'Your account does not have permission to open Incidents.');
      navigation.goBack();
    }
  }, [canLogIncidents, navigation]);

  const fetchIncidentData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const [studentData, incidentData] = await Promise.all([
        loadStudentsFromDataStore(),
        loadIncidentsFromDataStore(),
      ]);

      const nextStudents = Array.isArray(studentData) ? studentData : [];
      setStudents(nextStudents);
      setIncidents(Array.isArray(incidentData) ? incidentData : []);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load incident records.');
    } finally {
      setLoading(false);
    }
  }, [selectedStudentId]);

  useEffect(() => {
    fetchIncidentData();
  }, [fetchIncidentData]);

  useFocusEffect(
    useCallback(() => {
      fetchIncidentData();
    }, [fetchIncidentData]),
  );

  const handleSubmit = async () => {
    if (!canLogIncidents) {
      Alert.alert('Access Restricted', 'Your account can view incidents but cannot create them.');
      return;
    }

    if (!location.trim() || !description.trim() || !actionTaken.trim() || !witness.trim()) {
      Alert.alert('Missing Details', 'Please complete location, description, action taken, and witness.');
      return;
    }

    const incidentOccurredDate = `${occurredYear}-${occurredMonth}-${occurredDay}`;
    const occurredAt = buildIncidentOccurredAt(incidentOccurredDate, occurredTime);
    if (!occurredAt) {
      Alert.alert('Time Required', 'Enter the incident time in 24-hour format, for example 14:30.');
      return;
    }

    if (new Date(occurredAt).getTime() > Date.now()) {
      Alert.alert('Date Not Allowed', 'The incident happened time cannot be in the future.');
      return;
    }

    try {
      setIsSaving(true);
      const savedIncident = await saveIncidentRecord({
        studentId: selectedStudentId,
        location: location.trim(),
        description: description.trim(),
        actionTaken: actionTaken.trim(),
        witness: witness.trim(),
        occurredAt,
      }, selectedStudent);

      setIncidents((currentIncidents) => [savedIncident, ...currentIncidents]);
      setDescription('');
      setActionTaken('');
      setWitness('');
      setOccurredYear(getCurrentLocalDateString().split('-')[0]);
      setOccurredMonth(getCurrentLocalDateString().split('-')[1]);
      setOccurredDay(getCurrentLocalDateString().split('-')[2]);
      setOccurredTime(getCurrentLocalTimeString());
      Alert.alert('Saved', 'Incident recorded and saved to Firestore.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not save the incident.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>Incident / Accident Register</Text>
        <Text style={styles.subtitle}>Read-only after saving for compliance</Text>

        <Text style={styles.formSectionLabel}>Learner</Text>
        <StudentAutocomplete
          students={students}
          selectedStudentId={selectedStudentId}
          onSelect={setSelectedStudentId}
          placeholder="Search learner for incident report"
          helperText="Search by learner name or ID instead of scrolling through the full list."
        />

        <TextInput
          style={styles.formInput}
          placeholder="Location (e.g. Playground, Classroom)"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={location}
          onChangeText={setLocation}
        />
        <View style={styles.compactDateFieldWrapper}>
          <Text style={styles.compactDateLabel}>When It Happened</Text>
          <TouchableOpacity style={styles.compactDateField} onPress={() => setShowOccurredDatePicker(true)}>
            <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(occurredYear, occurredMonth, occurredDay)}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.formInput}
          placeholder="Time happened (HH:MM)"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={occurredTime}
          onChangeText={setOccurredTime}
        />
        <TextInput
          style={[styles.formInput, styles.reasonInput]}
          placeholder="Description of incident"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <TextInput
          style={styles.formInput}
          placeholder="Action Taken (e.g. First aid, Parent called)"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={actionTaken}
          onChangeText={setActionTaken}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Witness"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={witness}
          onChangeText={setWitness}
        />

        <TouchableOpacity
          style={[styles.saveStudentButton, (isSaving || !canLogIncidents) && styles.saveStudentButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving || !canLogIncidents}
        >
          <Text style={styles.saveStudentButtonText}>
            {!canLogIncidents ? 'View-only incident access' : isSaving ? 'Saving...' : 'Save Incident Record'}
          </Text>
        </TouchableOpacity>

        {loading ? <Text style={styles.statusText}>Loading incident records...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <CompactDatePickerModal
          visible={showOccurredDatePicker}
          onClose={() => setShowOccurredDatePicker(false)}
          onDateSelect={(y, m, d) => {
            setOccurredYear(y);
            setOccurredMonth(m);
            setOccurredDay(d);
          }}
          currentYear={occurredYear}
          currentMonth={occurredMonth}
          currentDay={occurredDay}
        />

        <Text style={styles.sectionTitle}>Recent Incidents</Text>
        {incidents.map((incident) => (
          <View key={incident.id} style={styles.timelineCard}>
            <Text style={styles.studentName}>{incident.studentName || 'General incident'}</Text>
            <Text style={styles.timelineMeta}>Happened: {formatDateTime(incident.occurredAt || incident.timestamp)} • {incident.location}</Text>
            <Text style={styles.tapHint}>Logged: {formatDateTime(incident.createdAt || incident.timestamp)}</Text>
            <Text style={styles.timelineText}>{incident.description}</Text>
            <Text style={styles.tapHint}>Action Taken: {incident.actionTaken}</Text>
            <Text style={styles.tapHint}>Witness: {incident.witness}</Text>
            <Text style={styles.lockText}>Locked record - editing disabled</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function MedicineAdministrationScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const canLogMedicine = hasPermission(accessProfile, 'canLogMedicine');
  const initialMedicineDate = getCurrentLocalDateString();
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [staffMember, setStaffMember] = useState('');
  const [administeredYear, setAdministeredYear] = useState(initialMedicineDate.split('-')[0]);
  const [administeredMonth, setAdministeredMonth] = useState(initialMedicineDate.split('-')[1]);
  const [administeredDay, setAdministeredDay] = useState(initialMedicineDate.split('-')[2]);
  const [administeredTime, setAdministeredTime] = useState(getCurrentLocalTimeString());
  const [showAdministeredDatePicker, setShowAdministeredDatePicker] = useState(false);
  const [medicineLogs, setMedicineLogs] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId],
  );

  const hasAllergyWarning = useMemo(
    () => doesMedicationTriggerAllergy(medicationName, selectedStudent?.allergies || ''),
    [medicationName, selectedStudent],
  );

  useEffect(() => {
    if (!canLogMedicine) {
      Alert.alert('Access Restricted', 'Your account does not have permission to open Medicine.');
      navigation.goBack();
    }
  }, [canLogMedicine, navigation]);

  const fetchMedicineData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const [studentData, logData] = await Promise.all([
        loadStudentsFromDataStore(),
        loadMedicineLogsFromDataStore(),
      ]);

      const nextStudents = Array.isArray(studentData) ? studentData : [];
      setStudents(nextStudents);
      setMedicineLogs(Array.isArray(logData) ? logData : []);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load medicine logs.');
    } finally {
      setLoading(false);
    }
  }, [selectedStudentId]);

  useEffect(() => {
    fetchMedicineData();
  }, [fetchMedicineData]);

  useFocusEffect(
    useCallback(() => {
      fetchMedicineData();
    }, [fetchMedicineData]),
  );

  const handleSubmit = async () => {
    if (!canLogMedicine) {
      Alert.alert('Access Restricted', 'Your account can view medicine logs but cannot create them.');
      return;
    }

    if (!selectedStudentId || !medicationName.trim() || !dosage.trim() || !staffMember.trim()) {
      Alert.alert('Missing Details', 'Please select a learner and complete all medicine fields.');
      return;
    }

    const medicineOccurredDate = `${administeredYear}-${administeredMonth}-${administeredDay}`;
    const timeAdministered = buildIncidentOccurredAt(medicineOccurredDate, administeredTime);
    if (!timeAdministered) {
      Alert.alert('Time Required', 'Enter the medicine time in 24-hour format, for example 14:30.');
      return;
    }

    if (new Date(timeAdministered).getTime() > Date.now()) {
      Alert.alert('Date Not Allowed', 'The medicine time cannot be in the future.');
      return;
    }

    try {
      setIsSaving(true);
      const savedEntry = await saveMedicineLogRecord({
        studentId: selectedStudentId,
        medicationName: medicationName.trim(),
        dosage: dosage.trim(),
        staffMember: staffMember.trim(),
        timeAdministered,
      }, selectedStudent);

      setMedicineLogs((currentLogs) => [savedEntry, ...currentLogs]);
      setMedicationName('');
      setDosage('');
      setStaffMember('');
      setAdministeredYear(getCurrentLocalDateString().split('-')[0]);
      setAdministeredMonth(getCurrentLocalDateString().split('-')[1]);
      setAdministeredDay(getCurrentLocalDateString().split('-')[2]);
      setAdministeredTime(getCurrentLocalTimeString());

      if (savedEntry?.allergyWarning) {
        Alert.alert('WARNING', 'This medication matches a recorded allergy. Please double-check before administration.');
      } else {
        Alert.alert('Saved', 'Medicine administration logged in Firestore.');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not save the medicine log.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>Medicine Administration</Text>
        <Text style={styles.subtitle}>Track medication safely with allergy checks</Text>

        <Text style={styles.formSectionLabel}>Learner</Text>
        <StudentAutocomplete
          students={students}
          selectedStudentId={selectedStudentId}
          onSelect={setSelectedStudentId}
          placeholder="Search learner for medicine log"
          helperText="Search by learner name or ID to quickly select the right child."
        />

        {hasAllergyWarning ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              WARNING: {selectedStudent?.allergies || 'Recorded allergy'} may conflict with {medicationName || 'this medication'}.
            </Text>
          </View>
        ) : null}

        <TextInput
          style={styles.formInput}
          placeholder="Medication Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={medicationName}
          onChangeText={setMedicationName}
        />
        <View style={styles.compactDateFieldWrapper}>
          <Text style={styles.compactDateLabel}>When It Was Given</Text>
          <TouchableOpacity style={styles.compactDateField} onPress={() => setShowAdministeredDatePicker(true)}>
            <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(administeredYear, administeredMonth, administeredDay)}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.formInput}
          placeholder="Time given (HH:MM)"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={administeredTime}
          onChangeText={setAdministeredTime}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Dosage (e.g. 5ml)"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={dosage}
          onChangeText={setDosage}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Staff Member"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={staffMember}
          onChangeText={setStaffMember}
        />

        <TouchableOpacity
          style={[styles.saveStudentButton, (isSaving || !canLogMedicine) && styles.saveStudentButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving || !canLogMedicine}
        >
          <Text style={styles.saveStudentButtonText}>
            {!canLogMedicine ? 'View-only medicine access' : isSaving ? 'Saving...' : 'Save Medicine Log'}
          </Text>
        </TouchableOpacity>

        {loading ? <Text style={styles.statusText}>Loading medicine records...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <CompactDatePickerModal
          visible={showAdministeredDatePicker}
          onClose={() => setShowAdministeredDatePicker(false)}
          onDateSelect={(y, m, d) => {
            setAdministeredYear(y);
            setAdministeredMonth(m);
            setAdministeredDay(d);
          }}
          currentYear={administeredYear}
          currentMonth={administeredMonth}
          currentDay={administeredDay}
        />

        <Text style={styles.sectionTitle}>Recent Medicine Logs</Text>
        {medicineLogs.map((entry) => (
          <View key={entry.id} style={styles.timelineCard}>
            <Text style={styles.studentName}>{entry.studentName || entry.studentId}</Text>
            <Text style={styles.timelineMeta}>Given: {formatDateTime(entry.timeAdministered)}</Text>
            <Text style={styles.tapHint}>Logged: {formatDateTime(entry.createdAt || entry.timeAdministered)}</Text>
            <Text style={styles.timelineText}>{entry.medicationName} - {entry.dosage}</Text>
            <Text style={styles.tapHint}>Given by: {entry.staffMember}</Text>
            {entry.allergyWarning ? <Text style={styles.warningText}>WARNING flagged against allergy record</Text> : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function GeneralCommunicationScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const canLogGeneral = hasPermission(accessProfile, 'canLogGeneral');
  const initialGeneralDate = getCurrentLocalDateString();
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  const [staffMember, setStaffMember] = useState('');
  const [generalOccurredYear, setGeneralOccurredYear] = useState(initialGeneralDate.split('-')[0]);
  const [generalOccurredMonth, setGeneralOccurredMonth] = useState(initialGeneralDate.split('-')[1]);
  const [generalOccurredDay, setGeneralOccurredDay] = useState(initialGeneralDate.split('-')[2]);
  const [generalOccurredTime, setGeneralOccurredTime] = useState(getCurrentLocalTimeString());
  const [showGeneralOccurredDatePicker, setShowGeneralOccurredDatePicker] = useState(false);
  const [generalLogs, setGeneralLogs] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId],
  );

  useEffect(() => {
    if (!canLogGeneral) {
      Alert.alert('Access Restricted', 'Your account does not have permission to open General logs.');
      navigation.goBack();
    }
  }, [canLogGeneral, navigation]);

  const fetchGeneralData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const [studentData, logData] = await Promise.all([
        loadStudentsFromDataStore(),
        loadGeneralLogsFromDataStore(),
      ]);

      const nextStudents = Array.isArray(studentData) ? studentData : [];
      setStudents(nextStudents);
      setGeneralLogs(Array.isArray(logData) ? logData : []);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load general logs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGeneralData();
  }, [fetchGeneralData]);

  useFocusEffect(
    useCallback(() => {
      fetchGeneralData();
    }, [fetchGeneralData]),
  );

  const handleSubmit = async () => {
    if (!canLogGeneral) {
      Alert.alert('Access Restricted', 'Your account can view general logs but cannot create them.');
      return;
    }

    if (!selectedStudentId || !subject.trim() || !note.trim() || !staffMember.trim()) {
      Alert.alert('Missing Details', 'Please select a learner and complete all general log fields.');
      return;
    }

    const generalOccurredDate = `${generalOccurredYear}-${generalOccurredMonth}-${generalOccurredDay}`;
    const occurredAt = buildIncidentOccurredAt(generalOccurredDate, generalOccurredTime);
    if (!occurredAt) {
      Alert.alert('Time Required', 'Enter the communication time in 24-hour format, for example 14:30.');
      return;
    }

    if (new Date(occurredAt).getTime() > Date.now()) {
      Alert.alert('Date Not Allowed', 'The communication time cannot be in the future.');
      return;
    }

    try {
      setIsSaving(true);
      const savedEntry = await saveGeneralLogRecord({
        studentId: selectedStudentId,
        subject: subject.trim(),
        note: note.trim(),
        staffMember: staffMember.trim(),
        occurredAt,
      }, selectedStudent);

      setGeneralLogs((currentLogs) => [savedEntry, ...currentLogs]);
      setSubject('');
      setNote('');
      setStaffMember('');
      setGeneralOccurredYear(getCurrentLocalDateString().split('-')[0]);
      setGeneralOccurredMonth(getCurrentLocalDateString().split('-')[1]);
      setGeneralOccurredDay(getCurrentLocalDateString().split('-')[2]);
      setGeneralOccurredTime(getCurrentLocalTimeString());
      Alert.alert('Saved', 'General communication logged in Firestore.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not save the general log.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>General Communication</Text>
        <Text style={styles.subtitle}>Track parent or staff communication linked to a learner</Text>

        <Text style={styles.formSectionLabel}>Learner</Text>
        <StudentAutocomplete
          students={students}
          selectedStudentId={selectedStudentId}
          onSelect={setSelectedStudentId}
          placeholder="Search learner for general log"
          helperText="Search by learner name or ID to quickly select the right child."
        />

        <TextInput
          style={styles.formInput}
          placeholder="Subject"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={subject}
          onChangeText={setSubject}
        />
        <View style={styles.compactDateFieldWrapper}>
          <Text style={styles.compactDateLabel}>When It Happened</Text>
          <TouchableOpacity style={styles.compactDateField} onPress={() => setShowGeneralOccurredDatePicker(true)}>
            <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(generalOccurredYear, generalOccurredMonth, generalOccurredDay)}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.formInput}
          placeholder="Time happened (HH:MM)"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={generalOccurredTime}
          onChangeText={setGeneralOccurredTime}
        />
        <TextInput
          style={[styles.formInput, styles.reasonInput]}
          placeholder="Note"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={note}
          onChangeText={setNote}
          multiline
        />
        <TextInput
          style={styles.formInput}
          placeholder="Staff Member"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={staffMember}
          onChangeText={setStaffMember}
        />

        <TouchableOpacity
          style={[styles.saveStudentButton, (isSaving || !canLogGeneral) && styles.saveStudentButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving || !canLogGeneral}
        >
          <Text style={styles.saveStudentButtonText}>
            {!canLogGeneral ? 'View-only general access' : isSaving ? 'Saving...' : 'Save General Log'}
          </Text>
        </TouchableOpacity>

        {loading ? <Text style={styles.statusText}>Loading general records...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <CompactDatePickerModal
          visible={showGeneralOccurredDatePicker}
          onClose={() => setShowGeneralOccurredDatePicker(false)}
          onDateSelect={(y, m, d) => {
            setGeneralOccurredYear(y);
            setGeneralOccurredMonth(m);
            setGeneralOccurredDay(d);
          }}
          currentYear={generalOccurredYear}
          currentMonth={generalOccurredMonth}
          currentDay={generalOccurredDay}
        />

        <Text style={styles.sectionTitle}>Recent General Logs</Text>
        {generalLogs.map((entry) => (
          <View key={entry.id} style={styles.timelineCard}>
            <Text style={styles.studentName}>{entry.studentName || entry.studentId}</Text>
            <Text style={styles.timelineMeta}>Happened: {formatDateTime(entry.occurredAt || entry.timestamp)}</Text>
            <Text style={styles.tapHint}>Logged: {formatDateTime(entry.createdAt || entry.timestamp)}</Text>
            <Text style={styles.timelineText}>{entry.subject || 'General communication'}</Text>
            <Text style={styles.tapHint}>{entry.note || 'Not recorded'}</Text>
            <Text style={styles.tapHint}>Logged by: {entry.staffMember || 'Not recorded'}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const KATEGORIE_OPTIONS = ['Sensory', 'Fine Motor', 'Gross Motor', 'Creative', 'Cognitive', 'Language', 'Music', 'Drama'];
const OUDERDOM_OPTIONS = ['3–12 months', '1–2 years', '2–3 years', '3–4 years'];

function ActivitiesScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const isParentAccount = isParentRole(accessProfile);
  const isPrincipal = String(accessProfile?.role || '').trim().toLowerCase() === 'principal';
  const isTeacher = !isParentAccount && !isPrincipal;
  const canExportReports = hasPermission(accessProfile, 'canExportReports');
  const currentYear = parseInt(TODAY.split('-')[0], 10);
  const currentMonth = parseInt(TODAY.split('-')[1], 10);
  const currentDay = parseInt(TODAY.split('-')[2], 10);

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [classFilter, setClassFilter] = useState('All Classes');
  const [deleting, setDeleting] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [startYear, setStartYear] = useState(String(currentYear));
  const [startMonth, setStartMonth] = useState(String(currentMonth).padStart(2, '0'));
  const [startDay, setStartDay] = useState(String(currentDay).padStart(2, '0'));
  const [endYear, setEndYear] = useState(String(currentYear));
  const [endMonth, setEndMonth] = useState(String(currentMonth).padStart(2, '0'));
  const [endDay, setEndDay] = useState(String(currentDay).padStart(2, '0'));
  const [exporting, setExporting] = useState(false);

  const loadActivities = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      let all = await fetchActivitiesFromFirestore();

      if (isParentAccount) {
        // Parents: only see activities for their linked child's class
        const allStudents = await loadStudentsFromDataStore();
        const linkedIds = new Set(getLinkedStudentIds(accessProfile));
        const parentClassNames = new Set(
          allStudents
            .filter((s) => linkedIds.has(String(s?.id || '').trim()))
            .map((s) => String(s?.className || '').trim())
            .filter(Boolean),
        );
        all = all.filter((act) => act.className === 'All Classes' || parentClassNames.has(act.className));
      } else if (isTeacher) {
        // Teachers: only see their own logged activities
        all = all.filter((act) => act.loggedByUid === accessProfile.uid);
        if (classFilter !== 'All Classes') {
          all = all.filter((act) => act.className === 'All Classes' || act.className === classFilter);
        }
      } else {
        // Principal: sees all activities, respects class filter
        if (classFilter !== 'All Classes') {
          all = all.filter((act) => act.className === 'All Classes' || act.className === classFilter);
        }
      }

      setActivities(all);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load activities.');
    } finally {
      setLoading(false);
    }
  }, [isParentAccount, isTeacher, accessProfile, classFilter]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useFocusEffect(
    useCallback(() => {
      loadActivities();
    }, [loadActivities]),
  );

  const handleDelete = (activity) => {
    if (!isPrincipal) return;
    Alert.alert('Delete Activity', `Delete "${activity.aktiwiteitsName}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(activity.id);
            await deleteActivityFromFirestore(activity.id, activity.storagePath);
            await loadActivities();
          } catch (error) {
            Alert.alert('Delete Failed', error.message || 'Could not delete the activity.');
          } finally {
            setDeleting('');
          }
        },
      },
    ]);
  };

  const startDate = `${startYear}-${startMonth}-${startDay}`;
  const endDate = `${endYear}-${endMonth}-${endDay}`;

  const escapeHtml = (value) => String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const exportActivities = async () => {
    if (startDate > endDate) {
      Alert.alert('Date Range Error', 'Start date must be before or equal to end date.');
      return;
    }

    const exportItems = activities.filter((activity) => {
      const activityDate = String(activity?.datum || '').trim();
      if (!activityDate || activityDate < startDate || activityDate > endDate) {
        return false;
      }

      if (classFilter !== 'All Classes') {
        return activity.className === classFilter || activity.className === 'All Classes';
      }

      return true;
    });

    if (exportItems.length === 0) {
      Alert.alert('No Activities', 'No activities found for the selected date range.');
      return;
    }

    try {
      setExporting(true);
      const pages = exportItems.map((activity) => {
        const className = activity.className === 'All Classes' ? 'All Classes' : activity.className;
        const ageGroup = Array.isArray(activity.ouderdomsGroep) ? activity.ouderdomsGroep.join(', ') : '';
        const lines = [
          ['Activity Name', activity.aktiwiteitsName],
          ['Date', activity.datum],
          ['Class', className],
          ['Category', activity.kategorie],
          ['Theme', activity.tema],
          ['Estimated Duration', activity.duur ? `${activity.duur} minutes` : ''],
          ['Age Group', ageGroup],
          ['Goal', activity.doel],
          ['Skills Developed', activity.vaardighede],
          ['Learning Areas / CAPS', activity.leerareas],
          ['Materials Needed', activity.benodigehede],
          ['Preparation Steps', activity.voorbereidingStappe],
          ['Execution Steps', activity.uitvoering],
          ['Adjustments by Age Group', activity.aanpassingPerGroep],
          ['Logged By', activity.loggedByName],
        ].filter(([, value]) => String(value || '').trim().length > 0);

        return `
          <section class="page">
            <h1>${escapeHtml(activity.aktiwiteitsName || 'Activity')}</h1>
            ${lines.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('')}
          </section>
        `;
      }).join('');

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; color: #102A43; padding: 18px; }
              h1 { margin: 0 0 12px; font-size: 22px; }
              p { margin: 6px 0; line-height: 1.45; }
              .page { page-break-after: always; }
              .page:last-child { page-break-after: auto; }
            </style>
          </head>
          <body>
            ${pages}
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const printHtml = html.replace('</body>', '<script>window.print();<\/script></body>');
        const blob = new Blob([printHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        const file = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Export Activities',
            UTI: 'com.adobe.pdf',
          });
        } else {
          await Linking.openURL(file.uri);
        }
      }

      setShowExportModal(false);
    } catch (error) {
      Alert.alert('Export Failed', error.message || 'Could not export activities.');
    } finally {
      setExporting(false);
    }
  };

  const formatActivityDate = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>Activities</Text>
        <Text style={styles.subtitle}>
          {isParentAccount
            ? 'Activities completed in your child\'s class'
            : isPrincipal
              ? 'All logged activities across all classes'
              : 'Activities you logged'}
        </Text>

        {!isParentAccount ? (
          <>
            <View style={styles.activityFilterRow}>
              {CLASSROOM_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.activityFilterChip, classFilter === opt && styles.activityFilterChipActive]}
                  onPress={() => setClassFilter(opt)}
                >
                  <Text style={[styles.activityFilterChipText, classFilter === opt && styles.activityFilterChipTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.activityLogButton}
              onPress={() => navigation.navigate('LogActivity')}
            >
              <Text style={styles.activityLogButtonText}>+ Log New Activity</Text>
            </TouchableOpacity>
            {isPrincipal && canExportReports ? (
              <TouchableOpacity
                style={styles.reportButton}
                onPress={() => setShowExportModal(true)}
              >
                <Text style={styles.saveStudentButtonText}>Export Activities</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}

        {loading ? <Text style={styles.statusText}>Loading activities...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {!loading && activities.length === 0 ? (
          <View style={styles.complianceEmptyState}>
            <Text style={styles.complianceEmptyText}>No activities found.</Text>
            {isParentAccount ? (
              <Text style={styles.complianceEmptyHint}>No activities have been logged yet for your child class.</Text>
            ) : isTeacher ? (
              <Text style={styles.complianceEmptyHint}>You have not logged any activities yet. Use the button above.</Text>
            ) : (
              <Text style={styles.complianceEmptyHint}>No activities have been logged yet.</Text>
            )}
          </View>
        ) : null}

        {activities.map((activity) => {
          const cardContent = (
            <>
              <View style={styles.activityCardHeader}>
                <View style={styles.activityCardHeaderText}>
                  <Text style={styles.activityCardName}>{activity.aktiwiteitsName || '—'}</Text>
                  <Text style={styles.activityCardMeta}>
                    {formatActivityDate(activity.datum)} • {activity.className === 'All Classes' ? 'All Classes' : activity.className}
                  </Text>
                </View>
                {activity.kategorie ? (
                  <View style={styles.activityCardBadge}>
                    <Text style={styles.activityCardBadgeText}>{activity.kategorie}</Text>
                  </View>
                ) : null}
              </View>

              {activity.duur ? (
                <Text style={styles.activityCardDetail}>Duration: {activity.duur} minute</Text>
              ) : null}
              {activity.tema ? (
                <Text style={styles.activityCardDetail}>Theme: {activity.tema}</Text>
              ) : null}
              {activity.ouderdomsGroep && activity.ouderdomsGroep.length > 0 ? (
                <Text style={styles.activityCardDetail}>Age group: {activity.ouderdomsGroep.join(', ')}</Text>
              ) : null}
              {activity.doel ? (
                <Text style={styles.activityCardBody} numberOfLines={isParentAccount ? 2 : 3}>{activity.doel}</Text>
              ) : null}
              {isParentAccount ? (
                <Text style={styles.activityCardFooter}>Tap to view details</Text>
              ) : (
                activity.loggedByName ? (
                  <Text style={styles.activityCardFooter}>Logged by {activity.loggedByName}</Text>
                ) : null
              )}
            </>
          );

          // Parents: whole card taps to detail view
          if (isParentAccount) {
            return (
              <TouchableOpacity
                key={activity.id}
                style={styles.activityCard}
                onPress={() => navigation.navigate('ActivityDetail', { activity })}
              >
                {cardContent}
              </TouchableOpacity>
            );
          }

          // Staff: card with action buttons below
          return (
            <View key={activity.id} style={styles.activityCard}>
              {cardContent}
              <View style={styles.activityCardActionsRow}>
                {(isPrincipal || isTeacher) ? (
                  <TouchableOpacity
                    style={styles.activityEditButton}
                    onPress={() => navigation.navigate('LogActivity', { activity })}
                  >
                    <Text style={styles.activityEditButtonText}>Edit</Text>
                  </TouchableOpacity>
                ) : null}
                {isPrincipal ? (
                  <TouchableOpacity
                    style={styles.activityDeleteButton}
                    onPress={() => handleDelete(activity)}
                    disabled={deleting === activity.id}
                  >
                    <Text style={styles.activityDeleteButtonText}>
                      {deleting === activity.id ? 'Deleting...' : 'Delete'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}

        <Modal
          visible={showExportModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowExportModal(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowExportModal(false)}>
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>Export Activities</Text>
                  <Text style={styles.modalText}>Choose a date range for your export.</Text>

                  <View style={styles.compactDateRangeContainer}>
                    <View style={styles.compactDateFieldWrapper}>
                      <Text style={styles.compactDateLabel}>Start Date</Text>
                      <TouchableOpacity style={styles.compactDateField} onPress={() => setShowStartPicker(true)}>
                        <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(startYear, startMonth, startDay)}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.compactDateFieldWrapper}>
                      <Text style={styles.compactDateLabel}>End Date</Text>
                      <TouchableOpacity style={styles.compactDateField} onPress={() => setShowEndPicker(true)}>
                        <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(endYear, endMonth, endDay)}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {startDate > endDate ? (
                    <Text style={styles.errorText}>Start date must be before or equal to end date.</Text>
                  ) : null}

                  <View style={styles.modalButtonsRow}>
                    <TouchableOpacity style={styles.modalButtonSecondary} onPress={() => setShowExportModal(false)}>
                      <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButtonPrimary, exporting && styles.saveStudentButtonDisabled]}
                      onPress={exportActivities}
                      disabled={exporting}
                    >
                      <Text style={styles.modalButtonPrimaryText}>{exporting ? 'Exporting...' : 'Export PDF'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <CompactDatePickerModal
          visible={showStartPicker}
          onClose={() => setShowStartPicker(false)}
          onDateSelect={(y, m, d) => {
            setStartYear(y);
            setStartMonth(m);
            setStartDay(d);
          }}
          currentYear={startYear}
          currentMonth={startMonth}
          currentDay={startDay}
        />

        <CompactDatePickerModal
          visible={showEndPicker}
          onClose={() => setShowEndPicker(false)}
          onDateSelect={(y, m, d) => {
            setEndYear(y);
            setEndMonth(m);
            setEndDay(d);
          }}
          currentYear={endYear}
          currentMonth={endMonth}
          currentDay={endDay}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function LogActivityScreen({ navigation, route }) {
  const accessProfile = useAccessProfile();
  const isParentAccount = isParentRole(accessProfile);
  const existingActivity = route.params?.activity || null;
  const isEditMode = Boolean(existingActivity);

  useEffect(() => {
    if (isParentAccount) {
      Alert.alert('Access Restricted', 'Only staff can log activities.');
      navigation.goBack();
    }
  }, [isParentAccount, navigation]);

  const [datum, setDatum] = useState(existingActivity?.datum || TODAY);
  const [aktiwiteitsName, setAktiwiteitsName] = useState(existingActivity?.aktiwiteitsName || '');
  const [kategorie, setKategorie] = useState(existingActivity?.kategorie || '');
  const [ouderdomsGroep, setOuderdomsGroep] = useState(existingActivity?.ouderdomsGroep || []);
  const [aanpassingPerGroep, setAanpassingPerGroep] = useState(existingActivity?.aanpassingPerGroep || '');
  const [benodigehede, setBenodigehede] = useState(existingActivity?.benodigehede || '');
  const [voorbereidingStappe, setVoorbereidingStappe] = useState(existingActivity?.voorbereidingStappe || '');
  const [uitvoering, setUitvoering] = useState(existingActivity?.uitvoering || '');
  const [duur, setDuur] = useState(existingActivity?.duur || '');
  const [doel, setDoel] = useState(existingActivity?.doel || '');
  const [vaardighede, setVaardighede] = useState(existingActivity?.vaardighede || '');
  const [leerareas, setLeerareas] = useState(existingActivity?.leerareas || '');
  const [tema, setTema] = useState(existingActivity?.tema || '');
  const [selectedClass, setSelectedClass] = useState(existingActivity?.className || 'All Classes');
  const [fileAsset, setFileAsset] = useState(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [validationError, setValidationError] = useState('');

  const toggleOuderdomsGroep = (option) => {
    setOuderdomsGroep((current) =>
      current.includes(option) ? current.filter((o) => o !== option) : [...current, option],
    );
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      setFileAsset(result.assets[0]);
    } catch {
      Alert.alert('Error', 'Could not select the file.');
    }
  };

  const resetForm = () => {
    setDatum(TODAY);
    setAktiwiteitsName('');
    setKategorie('');
    setOuderdomsGroep([]);
    setAanpassingPerGroep('');
    setBenodigehede('');
    setVoorbereidingStappe('');
    setUitvoering('');
    setDuur('');
    setDoel('');
    setVaardighede('');
    setLeerareas('');
    setTema('');
    setSelectedClass('All Classes');
    setFileAsset(null);
  };

  const handleSubmit = async () => {
    setValidationError('');
    setSuccessMessage('');

    if (!datum.trim()) {
      setValidationError('Date is required.');
      return;
    }

    if (!aktiwiteitsName.trim()) {
      setValidationError('Activity name is required.');
      return;
    }

    try {
      setSaving(true);

      const formData = {
        datum: datum.trim(),
        aktiwiteitsName: aktiwiteitsName.trim(),
        kategorie,
        ouderdomsGroep,
        aanpassingPerGroep: aanpassingPerGroep.trim(),
        benodigehede: benodigehede.trim(),
        voorbereidingStappe: voorbereidingStappe.trim(),
        uitvoering: uitvoering.trim(),
        duur: duur.trim(),
        doel: doel.trim(),
        vaardighede: vaardighede.trim(),
        leerareas: leerareas.trim(),
        tema: tema.trim(),
        className: selectedClass,
      };

      if (isEditMode) {
        await updateActivityInFirestore(existingActivity.id, formData);
      } else {
        await saveActivityToFirestore(formData, accessProfile, fileAsset);
        resetForm();
      }

      setSuccessMessage(isEditMode ? 'Activity updated successfully!' : 'Activity logged successfully!');
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error) {
      Alert.alert('Save Failed', error.message || 'Could not save the activity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Daily Activity</Text>
        <Text style={styles.subtitle}>{isEditMode ? 'Edit this activity and save your changes' : 'Log a new class activity'}</Text>

        {validationError ? <Text style={styles.errorText}>{validationError}</Text> : null}

        {successMessage ? (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerText}>{successMessage}</Text>
          </View>
        ) : null}

        <Text style={styles.formSectionLabel}>Date *</Text>
        <TextInput
          style={styles.formInput}
          value={datum}
          onChangeText={setDatum}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
        />

        <Text style={styles.formSectionLabel}>Class</Text>
        <View style={[styles.actionRow, { marginBottom: 12 }]}>
          {CLASSROOM_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.chipButton, selectedClass === opt && styles.chipButtonSelected]}
              onPress={() => setSelectedClass(opt)}
            >
              <Text style={[styles.chipButtonText, selectedClass === opt && styles.selectedActionText]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.formSectionLabel}>Activity Name *</Text>
        <TextInput
          style={styles.formInput}
          value={aktiwiteitsName}
          onChangeText={setAktiwiteitsName}
          placeholder="e.g. Sensory play with sand"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
        />

        <Text style={styles.formSectionLabel}>Category</Text>
        <View style={[styles.actionRow, { marginBottom: 12 }]}>
          {KATEGORIE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.chipButton, kategorie === opt && styles.chipButtonSelected]}
              onPress={() => setKategorie((prev) => (prev === opt ? '' : opt))}
            >
              <Text style={[styles.chipButtonText, kategorie === opt && styles.selectedActionText]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.formSectionLabel}>Age Group</Text>
        <View style={[styles.actionRow, { marginBottom: 12 }]}>
          {OUDERDOM_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.chipButton, ouderdomsGroep.includes(opt) && styles.chipButtonSelected]}
              onPress={() => toggleOuderdomsGroep(opt)}
            >
              <Text style={[styles.chipButtonText, ouderdomsGroep.includes(opt) && styles.selectedActionText]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.formSectionLabel}>How was the activity adapted for each age group?</Text>
        <TextInput
          style={[styles.formInput, styles.formTextArea]}
          value={aanpassingPerGroep}
          onChangeText={setAanpassingPerGroep}
          placeholder="Describe adaptations per age group..."
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.formSectionLabel}>Materials needed (one item per line)</Text>
        <TextInput
          style={[styles.formInput, styles.formTextArea]}
          value={benodigehede}
          onChangeText={setBenodigehede}
          placeholder={'e.g. Sand\nBuckets\nToys'}
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.formSectionLabel}>Preparation steps</Text>
        <TextInput
          style={[styles.formInput, styles.formTextArea]}
          value={voorbereidingStappe}
          onChangeText={setVoorbereidingStappe}
          placeholder="Steps to prepare the activity..."
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.formSectionLabel}>How to run the activity</Text>
        <TextInput
          style={[styles.formInput, styles.formTextArea]}
          value={uitvoering}
          onChangeText={setUitvoering}
          placeholder="Steps to run the activity..."
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.formSectionLabel}>Estimated duration (minutes)</Text>
        <TextInput
          style={styles.formInput}
          value={duur}
          onChangeText={setDuur}
          placeholder="bv. 30"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          keyboardType="numeric"
        />

        <Text style={styles.formSectionLabel}>Activity goal and learning outcome</Text>
        <TextInput
          style={[styles.formInput, styles.formTextArea]}
          value={doel}
          onChangeText={setDoel}
          placeholder="Describe the goal of the activity..."
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.formSectionLabel}>Skills developed</Text>
        <TextInput
          style={[styles.formInput, styles.formTextArea]}
          value={vaardighede}
          onChangeText={setVaardighede}
          placeholder="e.g. Fine motor skills, creative thinking..."
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.formSectionLabel}>Learning areas / CAPS alignment</Text>
        <TextInput
          style={[styles.formInput, styles.formTextArea]}
          value={leerareas}
          onChangeText={setLeerareas}
          placeholder="e.g. Personal and Social Wellbeing, Creativity and Design..."
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.formSectionLabel}>Theme</Text>
        <TextInput
          style={styles.formInput}
          value={tema}
          onChangeText={setTema}
          placeholder="e.g. Animals, Nature, Family..."
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
        />

        <Text style={styles.formSectionLabel}>File upload (optional)</Text>
        <TouchableOpacity style={styles.activityFilePickButton} onPress={handlePickFile}>
          <Text style={styles.activityFilePickButtonText}>
            {fileAsset ? fileAsset.name : '+ Select image or PDF'}
          </Text>
        </TouchableOpacity>
        {fileAsset ? (
          <TouchableOpacity onPress={() => setFileAsset(null)}>
            <Text style={styles.activityRemoveFile}>Remove file ×</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.saveStudentButton, saving && styles.saveStudentButtonDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          <Text style={styles.saveStudentButtonText}>
            {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Activity'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityDetailScreen({ route }) {
  const { activity } = route.params;

  const formatActivityDate = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
  };

  const DetailRow = ({ label, value }) => {
    if (!value || (typeof value === 'string' && !value.trim())) return null;
    return (
      <View style={styles.activityDetailRow}>
        <Text style={styles.activityDetailLabel}>{label}</Text>
        <Text style={styles.activityDetailValue}>{value}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.profileName}>{activity.aktiwiteitsName || 'Activity'}</Text>
        <Text style={styles.subtitle}>
          {formatActivityDate(activity.datum)} • {activity.className === 'All Classes' ? 'All Classes' : activity.className}
        </Text>

        {activity.kategorie ? (
          <View style={[styles.activityCardBadge, { alignSelf: 'flex-start', marginBottom: 14 }]}>
            <Text style={styles.activityCardBadgeText}>{activity.kategorie}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>General Information</Text>
          <DetailRow label="Theme" value={activity.tema} />
          <DetailRow label="Estimated duration" value={activity.duur ? `${activity.duur} minutes` : null} />
          <DetailRow label="Age group" value={activity.ouderdomsGroep?.join(', ')} />
        </View>

        {activity.doel ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Activity Goal</Text>
            <Text style={styles.activityDetailValue}>{activity.doel}</Text>
          </View>
        ) : null}

        {activity.vaardighede ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Skills Developed</Text>
            <Text style={styles.activityDetailValue}>{activity.vaardighede}</Text>
          </View>
        ) : null}

        {activity.leerareas ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Learning Areas / CAPS Alignment</Text>
            <Text style={styles.activityDetailValue}>{activity.leerareas}</Text>
          </View>
        ) : null}

        {activity.benodigehede ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Materials Needed</Text>
            <Text style={styles.activityDetailValue}>{activity.benodigehede}</Text>
          </View>
        ) : null}

        {activity.voorbereidingStappe ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Preparation Steps</Text>
            <Text style={styles.activityDetailValue}>{activity.voorbereidingStappe}</Text>
          </View>
        ) : null}

        {activity.uitvoering ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Execution Steps</Text>
            <Text style={styles.activityDetailValue}>{activity.uitvoering}</Text>
          </View>
        ) : null}

        {activity.aanpassingPerGroep ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Adaptations by Age Group</Text>
            <Text style={styles.activityDetailValue}>{activity.aanpassingPerGroep}</Text>
          </View>
        ) : null}

        {activity.fileUrl ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Attached File</Text>
            <TouchableOpacity
              style={styles.activityLogButton}
              onPress={() => Linking.openURL(activity.fileUrl).catch(() => Alert.alert('Could not open file', 'The file could not be opened.'))}
            >
              <Text style={styles.activityLogButtonText}>{activity.fileName || 'Open file'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {activity.loggedByName ? (
          <Text style={styles.activityCardFooter}>Logged by {activity.loggedByName}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ComplianceDocumentsScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const canManage = hasPermission(accessProfile, 'canManageUsers');

  useEffect(() => {
    if (isParentRole(accessProfile)) {
      Alert.alert('Access Restricted', 'Compliance documents are not available for parent accounts.');
      navigation.goBack();
    }
  }, [accessProfile, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>Compliance Documents</Text>
        <Text style={styles.subtitle}>ECD required compliance documentation folders</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {canManage
              ? 'Tap a folder to view or upload documents. Only principals can upload and delete files.'
              : 'Tap a folder to view compliance documents for this school.'}
          </Text>
        </View>

        {COMPLIANCE_FOLDERS.map((folder) => (
          <TouchableOpacity
            key={folder.key}
            style={styles.complianceFolderCard}
            onPress={() => navigation.navigate('ComplianceDocumentFolder', { folder })}
          >
            <View style={styles.complianceFolderTextWrap}>
              <Text style={styles.complianceFolderLabel}>{folder.label}</Text>
              <Text style={styles.complianceFolderDesc}>{folder.description}</Text>
            </View>
            <Text style={styles.complianceFolderChevron}>Open</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ComplianceDocumentFolderScreen({ navigation, route }) {
  const { folder } = route.params;
  const accessProfile = useAccessProfile();
  const canManage = hasPermission(accessProfile, 'canManageUsers');

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const docs = await fetchComplianceDocuments(folder.key);
      setDocuments(docs);
    } catch (error) {
      setErrorMessage(error.message || 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, [folder.key]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handlePickAndUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setUploading(true);

      await saveComplianceDocument(folder.key, asset.uri, asset.name, notes, accessProfile);
      setNotes('');
      await loadDocuments();
      Alert.alert('Uploaded', `"${asset.name}" has been uploaded successfully.`);
    } catch (error) {
      Alert.alert('Upload Failed', error.message || 'Could not upload the document.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (complianceDoc) => {
    Alert.alert(
      'Delete Document',
      `Remove "${complianceDoc.fileName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteComplianceDocument(complianceDoc.id, complianceDoc.storagePath);
              await loadDocuments();
            } catch (error) {
              Alert.alert('Delete Failed', error.message || 'Could not delete the document.');
            }
          },
        },
      ],
    );
  };

  const handleOpen = async (complianceDoc) => {
    const supported = await Linking.canOpenURL(complianceDoc.fileUrl);
    if (supported) {
      await Linking.openURL(complianceDoc.fileUrl);
    } else {
      Alert.alert('Cannot Open', 'Could not open this document link.');
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>{folder.icon} {folder.label}</Text>
        <Text style={styles.subtitle}>{folder.description}</Text>

        {loading ? <Text style={styles.statusText}>Loading documents...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {!loading && documents.length === 0 ? (
          <View style={styles.complianceEmptyState}>
            <Text style={styles.complianceEmptyIcon}>📂</Text>
            <Text style={styles.complianceEmptyText}>No documents uploaded yet.</Text>
            {canManage ? <Text style={styles.complianceEmptyHint}>Use the upload button below to add your first document.</Text> : null}
          </View>
        ) : null}

        {documents.map((complianceDoc) => (
          <View key={complianceDoc.id} style={styles.complianceDocCard}>
            <TouchableOpacity style={styles.complianceDocMain} onPress={() => handleOpen(complianceDoc)}>
              <Text style={styles.complianceDocIcon}>📄</Text>
              <View style={styles.complianceDocTextWrap}>
                <Text style={styles.complianceDocName} numberOfLines={2}>{complianceDoc.fileName}</Text>
                <Text style={styles.complianceDocMeta}>Uploaded {formatDate(complianceDoc.uploadedAt)}</Text>
                {complianceDoc.uploadedByEmail ? (
                  <Text style={styles.complianceDocMeta}>By {complianceDoc.uploadedByEmail}</Text>
                ) : null}
                {complianceDoc.notes ? (
                  <Text style={styles.complianceDocNotes}>{complianceDoc.notes}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
            <View style={styles.complianceDocActions}>
              <TouchableOpacity style={styles.complianceOpenBtn} onPress={() => handleOpen(complianceDoc)}>
                <Text style={styles.complianceOpenBtnText}>Open</Text>
              </TouchableOpacity>
              {canManage ? (
                <TouchableOpacity style={styles.complianceDeleteBtn} onPress={() => handleDelete(complianceDoc)}>
                  <Text style={styles.complianceDeleteBtnText}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))}

        {canManage ? (
          <View style={styles.complianceUploadSection}>
            <Text style={styles.complianceUploadTitle}>Upload Document</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Notes (optional)"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={notes}
              onChangeText={setNotes}
            />
            <TouchableOpacity
              style={[styles.complianceUploadBtn, uploading && styles.saveStudentButtonDisabled]}
              onPress={handlePickAndUpload}
              disabled={uploading}
            >
              <Text style={styles.complianceUploadBtnText}>
                {uploading ? 'Uploading...' : '+ Choose & Upload File'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.helperText}>PDF, Word, images, and other files are accepted.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ComplianceReportsScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const canExportReports = hasPermission(accessProfile, 'canExportReports');
  const [schoolName, setSchoolName] = useState(accessProfile?.schoolName || DEFAULT_SCHOOL_NAME);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState(['All Classes']);
  const [allAvailableClasses, setAllAvailableClasses] = useState(CLASSROOM_OPTIONS);

  const currentYear = parseInt(TODAY.split('-')[0], 10);
  const currentMonth = parseInt(TODAY.split('-')[1], 10);
  const currentDay = parseInt(TODAY.split('-')[2], 10);

  const [startYear, setStartYear] = useState(String(currentYear));
  const [startMonth, setStartMonth] = useState(String(currentMonth).padStart(2, '0'));
  const [startDay, setStartDay] = useState(String(currentDay).padStart(2, '0'));
  const [endYear, setEndYear] = useState(String(currentYear));
  const [endMonth, setEndMonth] = useState(String(currentMonth).padStart(2, '0'));
  const [endDay, setEndDay] = useState(String(currentDay).padStart(2, '0'));

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    if (!canExportReports) {
      Alert.alert('Access Restricted', 'Your account does not have permission to open Reports.');
      navigation.navigate('Home');
    }
  }, [canExportReports, navigation]);

  useEffect(() => {
    let isMounted = true;
    const loadClasses = async () => {
      try {
        const studentData = await loadStudentsFromDataStore();
        if (!isMounted) return;
        const discovered = (Array.isArray(studentData) ? studentData : [])
          .map((student) => getClassroomName(student))
          .filter(Boolean);
        const uniqueClasses = Array.from(new Set(discovered));
        setAllAvailableClasses(Array.from(new Set(['All Classes', ...uniqueClasses])));
      } catch (_error) {
        if (isMounted) {
          setAllAvailableClasses(CLASSROOM_OPTIONS);
        }
      }
    };
    loadClasses();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleClass = (className) => {
    if (className === 'All Classes') {
      setSelectedClasses(['All Classes']);
      return;
    }

    const isCurrentlySelected = selectedClasses.includes(className);
    const otherClasses = selectedClasses.filter((cls) => cls !== 'All Classes' && cls !== className);

    if (isCurrentlySelected) {
      setSelectedClasses(otherClasses.length > 0 ? otherClasses : ['All Classes']);
    } else {
      setSelectedClasses([...otherClasses, className]);
    }
  };

  const startDate = `${startYear}-${startMonth}-${startDay}`;
  const endDate = `${endYear}-${endMonth}-${endDay}`;

  const handleExport = async () => {
    if (startDate > endDate) {
      Alert.alert('Date Range Error', 'Start date must be before or equal to end date.');
      return;
    }

    setIsGenerating(true);
    try {
      const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      // Fetch all data from Firestore
      const students = await fetchStudentsFromFirestore();
      const attendance = await fetchAllAttendanceFromFirestore();
      const incidents = await fetchIncidentsFromFirestore();
      const medicine = await fetchMedicineLogsFromFirestore();
      const generalLogs = await fetchGeneralLogsFromFirestore();

      // Filter students by selected classes
      const isExportingAllClasses = selectedClasses.includes('All Classes');
      const filteredStudents = isExportingAllClasses
        ? students
        : (students || []).filter((student) => selectedClasses.includes(getClassroomName(student)));
      const studentIds = new Set(filteredStudents.map((s) => String(s?.id || '').trim()));

      // Filter data by date range and selected classes
      const filteredAttendance = (attendance || []).filter((entry) => {
        const entryDate = entry?.date || '';
        const isInDateRange = entryDate >= startDate && entryDate <= endDate;
        const isInSelectedClass = studentIds.has(String(entry?.studentId || '').trim());
        return isInDateRange && isInSelectedClass;
      });

      const filteredIncidents = (incidents || []).filter((incident) => {
        const incidentDate = String(incident?.occurredAt || incident?.timestamp || '').split('T')[0];
        const isInDateRange = incidentDate >= startDate && incidentDate <= endDate;
        const isInSelectedClass = studentIds.has(String(incident?.studentId || '').trim());
        return isInDateRange && isInSelectedClass;
      });

      const filteredMedicine = (medicine || []).filter((entry) => {
        const medDate = (entry?.timeAdministered || '').split('T')[0];
        const isInDateRange = medDate >= startDate && medDate <= endDate;
        const isInSelectedClass = studentIds.has(String(entry?.studentId || '').trim());
        return isInDateRange && isInSelectedClass;
      });

      const filteredGeneralLogs = (generalLogs || []).filter((entry) => {
        const logDate = String(entry?.occurredAt || entry?.timestamp || '').split('T')[0];
        const isInDateRange = logDate >= startDate && logDate <= endDate;
        const isInSelectedClass = studentIds.has(String(entry?.studentId || '').trim());
        return isInDateRange && isInSelectedClass;
      });

      // Build attendance table rows
      const absentLateAttendance = filteredAttendance.filter((e) => e?.status && ['Absent', 'Late'].includes(e.status));
      const attendanceRows = absentLateAttendance
        .map((entry) => `<tr><td>${escapeHtml(entry.date || '-')}</td><td>${escapeHtml(entry.studentName || 'Unknown')}</td><td>${escapeHtml(entry.status || '')}</td><td>${escapeHtml(entry.reason || '')}</td></tr>`)
        .join('');

      // Build incident table rows
      const incidentRows = filteredIncidents
        .map((incident) => {
          const happenedTime = incident?.occurredAt ? new Date(incident.occurredAt).toLocaleString() : (incident?.timestamp ? new Date(incident.timestamp).toLocaleString() : '-');
          const loggedTime = incident?.createdAt ? new Date(incident.createdAt).toLocaleString() : (incident?.timestamp ? new Date(incident.timestamp).toLocaleString() : '-');
          return `<tr><td>${escapeHtml(happenedTime)}</td><td>${escapeHtml(loggedTime)}</td><td>${escapeHtml(incident.location || '-')}</td><td>${escapeHtml(incident.studentName || 'General')}</td><td>${escapeHtml(incident.description || '-')}</td><td>${escapeHtml(incident.actionTaken || '-')}</td></tr>`;
        })
        .join('');

      // Build medicine table rows
      const medicineRows = filteredMedicine
        .map((entry) => {
          const medTime = entry?.timeAdministered ? new Date(entry.timeAdministered).toLocaleString() : '-';
          const loggedTime = entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : medTime;
          return `<tr><td>${escapeHtml(medTime)}</td><td>${escapeHtml(loggedTime)}</td><td>${escapeHtml(entry.studentName || 'Unknown')}</td><td>${escapeHtml(entry.medicationName || '-')}</td><td>${escapeHtml(entry.dosage || '-')}</td><td>${escapeHtml(entry.staffMember || '-')}</td><td>${entry.allergyWarning ? 'YES' : 'No'}</td></tr>`;
        })
        .join('');

      const generalRows = filteredGeneralLogs
        .map((entry) => {
          const happenedTime = entry?.occurredAt ? new Date(entry.occurredAt).toLocaleString() : (entry?.timestamp ? new Date(entry.timestamp).toLocaleString() : '-');
          const loggedTime = entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : happenedTime;
          return `<tr><td>${escapeHtml(happenedTime)}</td><td>${escapeHtml(loggedTime)}</td><td>${escapeHtml(entry.studentName || 'Unknown')}</td><td>${escapeHtml(entry.subject || '-')}</td><td>${escapeHtml(entry.note || '-')}</td><td>${escapeHtml(entry.staffMember || '-')}</td></tr>`;
        })
        .join('');

      const classesLabel = isExportingAllClasses ? 'All Classes' : selectedClasses.join(', ');
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <style>
              @page {
                margin: 72px 72px 72px 72px;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: Helvetica, Arial, sans-serif; 
                padding: 48px 48px;
                line-height: 1.4;
              }
              h1 { 
                color: #102A43; 
                font-size: 24px; 
                margin: 0 0 16px 0;
                padding: 0;
              }
              .header-info {
                margin: 0 0 24px 0;
              }
              .header-info p { 
                margin: 6px 0; 
                color: #333; 
                font-size: 12px;
              }
              .section {
                page-break-before: always;
                margin: 0;
                padding: 24px 0 0 0;
              }
              .section:first-of-type {
                page-break-before: avoid;
                padding: 0;
              }
              h2 { 
                color: #102A43; 
                font-size: 16px; 
                margin: 0 0 16px 0;
                padding: 0;
                font-weight: bold;
              }
              p { 
                margin: 0; 
                color: #333; 
                font-size: 12px;
                padding: 12px 0;
              }
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 12px 0 0 0; 
                font-size: 11px;
              }
              th { 
                background: #102A43; 
                color: white; 
                padding: 10px 8px; 
                text-align: left; 
                font-weight: bold;
                border: 1px solid #333;
              }
              td { 
                padding: 8px; 
                border: 1px solid #E0E0E0;
              }
              tr:nth-child(even) { 
                background: #F8FAFC; 
              }
              tr:nth-child(odd) {
                background: #FFFFFF;
              }
            </style>
          </head>
          <body>
            <div class="header-info">
              <h1>School Safety & Compliance Report</h1>
              <p><strong>School:</strong> ${escapeHtml(schoolName.trim() || DEFAULT_SCHOOL_NAME)}</p>
              <p><strong>Classes:</strong> ${escapeHtml(classesLabel)}</p>
              <p><strong>Date Range:</strong> ${escapeHtml(startDate)} to ${escapeHtml(endDate)}</p>
              <p><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString())}</p>
            </div>

            <div class="section">
              <h2>Attendance Register (Absent and Late only)</h2>
              ${attendanceRows ? `<table><thead><tr><th>Date</th><th>Learner</th><th>Status</th><th>Reason</th></tr></thead><tbody>${attendanceRows}</tbody></table>` : '<p>No absences or late arrivals recorded.</p>'}
            </div>

            <div class="section">
              <h2>Incident / Accident Register</h2>
              ${incidentRows ? `<table><thead><tr><th>Happened</th><th>Logged</th><th>Location</th><th>Learner</th><th>Description</th><th>Action Taken</th></tr></thead><tbody>${incidentRows}</tbody></table>` : '<p>No incidents recorded.</p>'}
            </div>

            <div class="section">
              <h2>Medicine Administration Log</h2>
              ${medicineRows ? `<table><thead><tr><th>Given</th><th>Logged</th><th>Learner</th><th>Medication</th><th>Dosage</th><th>Staff Member</th><th>Allergy Warning</th></tr></thead><tbody>${medicineRows}</tbody></table>` : '<p>No medicine logs recorded.</p>'}
            </div>

            <div class="section">
              <h2>General Communication Log</h2>
              ${generalRows ? `<table><thead><tr><th>Happened</th><th>Logged</th><th>Learner</th><th>Subject</th><th>Note</th><th>Staff Member</th></tr></thead><tbody>${generalRows}</tbody></table>` : '<p>No general communication logs recorded.</p>'}
            </div>
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const printHtml = html.replace('</body>', '<script>window.print();<\/script></body>');
        const blob = new Blob([printHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        const file = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Export Compliance Report',
            UTI: 'com.adobe.pdf',
          });
        } else {
          await Linking.openURL(file.uri);
        }
      }
    } catch (error) {
      Alert.alert('Export Failed', error.message || 'Could not generate compliance report.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>Compliance Report Export</Text>
        <Text style={styles.subtitle}>Generate a professional PDF layout for audits and recordkeeping</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>The PDF includes School Name, Date Range, Classes, attendance (Late/Absent only), incidents, medicine logs, and general communication logs.</Text>
        </View>

        <TextInput
          style={styles.formInput}
          placeholder="School Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={schoolName}
          onChangeText={setSchoolName}
        />

        <Text style={styles.formSectionLabel}>Filter by Class</Text>
        <View style={styles.actionRow}>
          {allAvailableClasses.map((className) => {
            const isSelected = selectedClasses.includes(className);
            return (
              <TouchableOpacity
                key={`export-class-${className}`}
                style={[styles.chipButton, isSelected && styles.chipButtonSelected]}
                onPress={() => handleToggleClass(className)}
                disabled={isGenerating}
              >
                <Text style={[styles.chipButtonText, isSelected && styles.selectedActionText]}>{className}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.tapHint}>Select &quot;All Classes&quot; or specific classes to include in the export.</Text>

        <View style={styles.compactDateRangeContainer}>
          <View style={styles.compactDateFieldWrapper}>
            <Text style={styles.compactDateLabel}>Start Date</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={`${startYear}-${startMonth}-${startDay}`}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split('-');
                  setStartYear(y); setStartMonth(m); setStartDay(d);
                }}
                style={{ fontSize: 15, padding: 8, borderRadius: 6, border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' }}
              />
            ) : (
              <TouchableOpacity
                style={styles.compactDateField}
                onPress={() => setShowStartPicker(true)}
              >
                <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(startYear, startMonth, startDay)}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.compactDateFieldWrapper}>
            <Text style={styles.compactDateLabel}>End Date</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={`${endYear}-${endMonth}-${endDay}`}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split('-');
                  setEndYear(y); setEndMonth(m); setEndDay(d);
                }}
                style={{ fontSize: 15, padding: 8, borderRadius: 6, border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' }}
              />
            ) : (
              <TouchableOpacity
                style={styles.compactDateField}
                onPress={() => setShowEndPicker(true)}
              >
                <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(endYear, endMonth, endDay)}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity style={[styles.reportButton, isGenerating && { opacity: 0.6 }]} onPress={handleExport} disabled={isGenerating}>
          <Text style={styles.saveStudentButtonText}>{isGenerating ? 'Generating PDF...' : 'Open PDF Export'}</Text>
        </TouchableOpacity>

        <CompactDatePickerModal
          visible={showStartPicker}
          onClose={() => setShowStartPicker(false)}
          onDateSelect={(y, m, d) => {
            setStartYear(y);
            setStartMonth(m);
            setStartDay(d);
          }}
          currentYear={startYear}
          currentMonth={startMonth}
          currentDay={startDay}
        />

        <CompactDatePickerModal
          visible={showEndPicker}
          onClose={() => setShowEndPicker(false)}
          onDateSelect={(y, m, d) => {
            setEndYear(y);
            setEndMonth(m);
            setEndDay(d);
          }}
          currentYear={endYear}
          currentMonth={endMonth}
          currentDay={endDay}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function CompactDatePickerColumn({ items, selectedValue, onSelect, label }) {
  const scrollViewRef = React.useRef(null);
  const itemHeight = 40;

  const currentIndex = items.indexOf(selectedValue);

  const updateSelectionFromOffset = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / itemHeight);
    if (index >= 0 && index < items.length) {
      onSelect(items[index]);
    }
  };

  React.useEffect(() => {
    if (scrollViewRef.current && currentIndex >= 0) {
      scrollViewRef.current.scrollTo({
        y: currentIndex * itemHeight,
        animated: true,
      });
    }
  }, [currentIndex]);

  return (
    <View style={styles.compactDatePickerColumnContainer}>
      <Text style={styles.compactDatePickerLabel}>{label}</Text>
      <View style={styles.compactDatePickerScrollBound}>
        <View pointerEvents="none" style={styles.compactDatePickerOverlay} />
        <ScrollView
          ref={scrollViewRef}
          scrollEventThrottle={16}
          snapToInterval={itemHeight}
          decelerationRate="fast"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={updateSelectionFromOffset}
          onScrollEndDrag={updateSelectionFromOffset}
          style={styles.compactDatePickerScroll}
          contentContainerStyle={styles.compactDatePickerScrollContent}
        >
          {items.map((item) => (
            <View key={item} style={{ height: itemHeight, justifyContent: 'center', alignItems: 'center' }}>
              <Text
                style={[
                  styles.compactDatePickerItem,
                  item === selectedValue && styles.compactDatePickerItemSelected,
                ]}
              >
                {item}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function LearnerHistoryModal({ visible, title, emptyText, loading, refreshing, hasError, onClose, onRefresh, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={styles.modalBackdropTouchable} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          {hasError ? (
            <View style={{ backgroundColor: '#fff3cd', padding: 10, marginBottom: 10, borderRadius: 6 }}>
              <Text style={{ color: '#856404', fontSize: 13, marginBottom: 6 }}>
                No connection — showing cached data
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#856404', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4, alignSelf: 'flex-start' }}
                onPress={onRefresh}
                disabled={refreshing}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                  {refreshing ? 'Retrying...' : 'Retry'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <ScrollView
            style={styles.modalScrollContent}
            contentContainerStyle={styles.modalScrollContentInner}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={refreshing || false} onRefresh={onRefresh} />
              ) : undefined
            }
          >
            {loading ? <Text style={styles.statusText}>Loading history...</Text> : null}
            {!loading && !children ? <Text style={styles.statusText}>{emptyText}</Text> : children}
          </ScrollView>
          <View style={styles.modalButtonsRow}>
            <TouchableOpacity style={styles.modalButtonSecondary} onPress={onClose}>
              <Text style={styles.modalButtonSecondaryText}>Close</Text>
            </TouchableOpacity>
            {onRefresh && !loading ? (
              <TouchableOpacity
                style={[styles.modalButtonPrimary, refreshing && styles.saveStudentButtonDisabled]}
                onPress={onRefresh}
                disabled={refreshing}
              >
                <Text style={styles.modalButtonPrimaryText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StudentFormScreen({ navigation, route }) {
  const accessProfile = useAccessProfile();
  const canEditStudents = hasPermission(accessProfile, 'canEditStudents');
  const canEditOwnChildMedicalInfo = hasPermission(accessProfile, 'canEditOwnChildMedicalInfo');
  const mode = route.params?.mode || 'add';
  const initialStudent = route.params?.student;
  const initialEmergencyContacts = Array.isArray(initialStudent?.emergencyContacts)
    ? initialStudent.emergencyContacts
    : [];

  const [firstName, setFirstName] = useState(initialStudent?.firstName || '');
  const [lastName, setLastName] = useState(initialStudent?.lastName || '');
  const [childId, setChildId] = useState(initialStudent?.childId || '');
  const [className, setClassName] = useState(initialStudent?.className || CLASSROOM_OPTIONS[1]);
  const [emergencyContact1Name, setEmergencyContact1Name] = useState(initialEmergencyContacts[0]?.name || '');
  const [emergencyContact1Number, setEmergencyContact1Number] = useState(initialEmergencyContacts[0]?.number || '');
  const [emergencyContact2Name, setEmergencyContact2Name] = useState(initialEmergencyContacts[1]?.name || '');
  const [emergencyContact2Number, setEmergencyContact2Number] = useState(initialEmergencyContacts[1]?.number || '');
  const [emergencyContact3Name, setEmergencyContact3Name] = useState(initialEmergencyContacts[2]?.name || '');
  const [emergencyContact3Number, setEmergencyContact3Number] = useState(initialEmergencyContacts[2]?.number || '');
  const [allergies, setAllergies] = useState(initialStudent?.allergies || '');
  const [medicalAidName, setMedicalAidName] = useState(initialStudent?.medicalAidName || '');
  const [medicalAidPlan, setMedicalAidPlan] = useState(initialStudent?.medicalAidPlan || '');
  const [medicalAidNumber, setMedicalAidNumber] = useState(initialStudent?.medicalAidNumber || '');
  const [mainMemberName, setMainMemberName] = useState(initialStudent?.mainMemberName || '');
  const [mainMemberIdNumber, setMainMemberIdNumber] = useState(initialStudent?.mainMemberIdNumber || '');
  const [childDependencyCode, setChildDependencyCode] = useState(initialStudent?.childDependencyCode || '');
  const [doctorContact, setDoctorContact] = useState(initialStudent?.doctorContact || '');
  const [isSaving, setIsSaving] = useState(false);
  const [knownClassOptions, setKnownClassOptions] = useState(CLASSROOM_OPTIONS.slice(1));
  const isParentEditMode = mode === 'parent-edit';
  const canSaveStudent = canEditStudents || (isParentEditMode && canEditOwnChildMedicalInfo && canAccessStudent(accessProfile, initialStudent));

  useEffect(() => {
    let isMounted = true;

    const loadKnownClasses = async () => {
      try {
        const data = await loadStudentsFromDataStore();
        if (!isMounted) return;
        const discovered = (Array.isArray(data) ? data : [])
          .map((student) => getClassroomName(student))
          .filter(Boolean);
        setKnownClassOptions(Array.from(new Set([...CLASSROOM_OPTIONS.slice(1), ...discovered])));
      } catch (_error) {
        if (isMounted) {
          setKnownClassOptions(CLASSROOM_OPTIONS.slice(1));
        }
      }
    };

    loadKnownClasses();

    return () => {
      isMounted = false;
    };
  }, []);

  const classFolderOptions = useMemo(() => {
    const currentValue = String(className || '').trim();
    return Array.from(new Set([
      ...knownClassOptions,
      ...(currentValue ? [currentValue] : []),
    ]));
  }, [knownClassOptions, className]);

  const handleSubmit = async () => {
    if (!canSaveStudent) {
      Alert.alert('Access Restricted', isParentEditMode
        ? 'This parent account can only update the medical/contact details of its linked child.'
        : 'Your account can view student details but cannot add or edit learners.');
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Missing Details', 'First Name and Last Name are required.');
      return;
    }

    if (!emergencyContact1Name.trim() || !emergencyContact1Number.trim()) {
      Alert.alert('Missing Details', 'Emergency Contact 1 Name and Number are required.');
      return;
    }

    const emergencyContacts = [
      { name: emergencyContact1Name.trim(), number: emergencyContact1Number.trim() },
      { name: emergencyContact2Name.trim(), number: emergencyContact2Number.trim() },
      { name: emergencyContact3Name.trim(), number: emergencyContact3Number.trim() },
    ].filter((contact) => contact.name || contact.number);

    const payload = {
      childId: isParentEditMode ? String(initialStudent?.childId || childId).trim() : childId.trim(),
      firstName: isParentEditMode ? String(initialStudent?.firstName || firstName).trim() : firstName.trim(),
      lastName: isParentEditMode ? String(initialStudent?.lastName || lastName).trim() : lastName.trim(),
      className: isParentEditMode ? String(initialStudent?.className || className).trim() : className.trim() || CLASSROOM_OPTIONS[1],
      emergencyContacts,
      allergies: allergies.trim() || 'No known allergies',
      medicalAidName: medicalAidName.trim(),
      medicalAidPlan: medicalAidPlan.trim(),
      medicalAidNumber: medicalAidNumber.trim(),
      mainMemberName: mainMemberName.trim(),
      mainMemberIdNumber: mainMemberIdNumber.trim(),
      childDependencyCode: childDependencyCode.trim(),
      doctorContact: doctorContact.trim(),
    };

    try {
      setIsSaving(true);
      await saveStudentRecord(mode, payload, initialStudent);

      Alert.alert('Saved', mode === 'edit' ? 'Student updated in Firestore.' : 'Student added to Firestore.');
      navigation.navigate('StudentDirectory');
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not save student record.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.formTitle}>
          {isParentEditMode ? 'Update Medical Info' : mode === 'edit' ? 'Edit Student Info' : 'Add New Student'}
        </Text>
        {isParentEditMode ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>You can update emergency contacts and medical information for your linked child here. Learner name, class, attendance, incident, and medicine records stay protected.</Text>
          </View>
        ) : null}

        {!isParentEditMode ? (
          <>
            <Text style={styles.formSectionLabel}>Child ID</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Child ID"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={childId}
              onChangeText={setChildId}
            />
            <Text style={styles.formSectionLabel}>First Name</Text>
            <TextInput
              style={styles.formInput}
              placeholder="First Name"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={firstName}
              onChangeText={setFirstName}
            />
            <Text style={styles.formSectionLabel}>Last Name</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Last Name"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={lastName}
              onChangeText={setLastName}
            />

            <Text style={styles.formSectionLabel}>Class Folder</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Class Name"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={className}
              onChangeText={setClassName}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipContainer}>
              {classFolderOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.chipButton,
                    className === option && styles.chipButtonSelected,
                  ]}
                  onPress={() => setClassName(option)}
                >
                  <Text style={[styles.chipButtonText, className === option && styles.selectedActionText]}>{option}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={styles.formSectionLabel}>Emergency Contact 1 (Required)</Text>
        <Text style={styles.formSectionLabel}>Emergency Contact 1 Name</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 1 Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact1Name}
          onChangeText={setEmergencyContact1Name}
        />
        <Text style={styles.formSectionLabel}>Emergency Contact 1 Number</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 1 Number"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact1Number}
          onChangeText={setEmergencyContact1Number}
        />

        <Text style={styles.formSectionLabel}>Emergency Contact 2 (Optional)</Text>
        <Text style={styles.formSectionLabel}>Emergency Contact 2 Name</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 2 Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact2Name}
          onChangeText={setEmergencyContact2Name}
        />
        <Text style={styles.formSectionLabel}>Emergency Contact 2 Number</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 2 Number"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact2Number}
          onChangeText={setEmergencyContact2Number}
        />

        <Text style={styles.formSectionLabel}>Emergency Contact 3 (Optional)</Text>
        <Text style={styles.formSectionLabel}>Emergency Contact 3 Name</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 3 Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact3Name}
          onChangeText={setEmergencyContact3Name}
        />
        <Text style={styles.formSectionLabel}>Emergency Contact 3 Number</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 3 Number"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact3Number}
          onChangeText={setEmergencyContact3Number}
        />

        <Text style={styles.formSectionLabel}>Allergies</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Allergies List (enter 'None' if no known allergies)"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={allergies}
          onChangeText={setAllergies}
        />

        <Text style={styles.formSectionLabel}>Medical Information</Text>
        <Text style={styles.formSectionLabel}>Medical Aid Name</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Medical Aid Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={medicalAidName}
          onChangeText={setMedicalAidName}
        />
        <Text style={styles.formSectionLabel}>Medical Aid Plan</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Medical Aid Plan"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={medicalAidPlan}
          onChangeText={setMedicalAidPlan}
        />
        <Text style={styles.formSectionLabel}>Medical Aid Number</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Medical Aid Number"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={medicalAidNumber}
          onChangeText={setMedicalAidNumber}
        />
        <Text style={styles.formSectionLabel}>Main Member Name</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Main Member Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={mainMemberName}
          onChangeText={setMainMemberName}
        />
        <Text style={styles.formSectionLabel}>Main Member ID Number</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Main Member ID Number"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={mainMemberIdNumber}
          onChangeText={setMainMemberIdNumber}
          keyboardType="number-pad"
        />
        <Text style={styles.formSectionLabel}>Child Dependency Code</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Child Dependency Code"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={childDependencyCode}
          onChangeText={setChildDependencyCode}
        />
        <Text style={styles.formSectionLabel}>Doctor Contact</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Doctor Contact"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={doctorContact}
          onChangeText={setDoctorContact}
        />

        <TouchableOpacity
          style={[styles.saveStudentButton, (isSaving || !canSaveStudent) && styles.saveStudentButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving || !canSaveStudent}
        >
          <Text style={styles.saveStudentButtonText}>
            {!canSaveStudent ? 'View-only student access' : isSaving ? 'Saving...' : isParentEditMode ? 'Save Medical Info' : 'Save Student'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}


