import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
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
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  DEFAULT_ROLE_PERMISSIONS,
  deleteActivityFromFirestore,
  deleteComplianceDocument,
  fetchAllAttendanceFromFirestore,
  fetchActivitiesFromFirestore,
  fetchAttendanceFromFirestore,
  fetchComplianceDocuments,
  fetchIncidentsFromFirestore,
  fetchMedicineLogsFromFirestore,
  fetchStudentsFromFirestore,
  fetchUserAccessProfiles,
  listenToAuthChanges,
  saveAttendanceToFirestore,
  saveActivityToFirestore,
  updateActivityInFirestore,
  saveComplianceDocument,
  saveIncidentToFirestore,
  saveMedicineLogToFirestore,
  saveStudentToFirestore,
  seedAttendanceToFirestore,
  seedIncidentsToFirestore,
  seedMedicineLogsToFirestore,
  seedStudentsToFirestore,
  signInUser,
  signOutCurrentUser,
  updateUserAccessProfile,
} from './firebaseConfig';

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
const DEFAULT_SCHOOL_NAME = 'Bana Pele Preschool';
const PARENT_ABSENT_REASON = 'Parent marked absent in app';
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
  { key: 'canExportReports', label: 'Reports' },
  { key: 'canManageUsers', label: 'Manage users' },
];
const AccessContext = createContext({
  uid: '',
  email: '',
  displayName: 'Staff Member',
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

function isParentRole(accessProfile) {
  return String(accessProfile?.role || '').trim().toLowerCase() === 'parent';
}

function formatCompactDateDisplay(year, month, day) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = Math.max(0, Math.min(11, parseInt(month, 10) - 1));
  return `${months[monthIndex]} ${parseInt(day, 10)}, ${year}`;
}

function CompactDatePickerModal({ visible, onClose, onDateSelect, currentYear: cy, currentMonth: cm, currentDay: cd }) {
  const [tempYear, setTempYear] = useState(cy);
  const [tempMonth, setTempMonth] = useState(cm);
  const [tempDay, setTempDay] = useState(cd);
  const yearOptions = Array.from({ length: 11 }, (_, i) => String(cy - 5 + i));
  const monthOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const dayOptions = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

  useEffect(() => {
    setTempYear(cy);
    setTempMonth(cm);
    setTempDay(cd);
  }, [cy, cm, cd, visible]);

  const handleConfirm = () => {
    onDateSelect(tempYear, tempMonth, tempDay);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.datePickerBackdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.datePickerModalCard}>
              <Text style={styles.datePickerModalTitle}>Select Date</Text>

              <View style={styles.compactDatePickerRow}>
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
                <CompactDatePickerColumn
                  items={yearOptions}
                  selectedValue={tempYear}
                  onSelect={setTempYear}
                  label="Year"
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
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
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
    if (Array.isArray(firestoreStudents) && firestoreStudents.length > 0) {
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
    if (Array.isArray(firestoreEntries) && firestoreEntries.length > 0) {
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
  const normalizedStatus = String(status || entry?.status || 'Present').trim() || 'Present';
  const normalizedReason = ['Absent', 'Late'].includes(normalizedStatus) ? String(reason || '').trim() : '';
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
        body: JSON.stringify({ status: normalizedStatus, reason: normalizedReason }),
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
      body: JSON.stringify({ status: normalizedStatus, reason: normalizedReason }),
    });

    return data?.entry ? { ...optimisticEntry, ...data.entry } : optimisticEntry;
  }
}

async function loadIncidentsFromDataStore() {
  try {
    const firestoreIncidents = await fetchIncidentsFromFirestore();
    if (Array.isArray(firestoreIncidents) && firestoreIncidents.length > 0) {
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
    if (Array.isArray(firestoreLogs) && firestoreLogs.length > 0) {
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

function LoginScreen({ onLogin, isBusy }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Missing Details', 'Enter your staff email and password.');
      return;
    }

    try {
      setErrorMessage('');
      await onLogin(identifier.trim(), password);
    } catch (error) {
      setErrorMessage(formatAuthError(error));
    }
  };

  return (
    <SafeAreaView style={styles.loginScreenContainer}>
      <View style={styles.loginCard}>
        <Text style={styles.loginTitle}>School Safety Login</Text>
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
          disabled={isBusy}
        >
          <Text style={styles.saveStudentButtonText}>{isBusy ? 'Signing In...' : 'Log In'}</Text>
        </TouchableOpacity>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        <Text style={styles.loginHint}>Use Firebase Auth accounts. Principal/admin emails can be given edit access, while teachers can stay view-only.</Text>
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
            <ScrollView nestedScrollEnabled style={styles.autocompleteScrollArea}>
              {suggestions.map((student) => (
                <TouchableOpacity
                  key={student.id}
                  style={styles.autocompleteItem}
                  onPress={() => handleSelect(student)}
                >
                  <Text style={styles.autocompleteName}>{getStudentFullName(student)}</Text>
                  <Text style={styles.autocompleteMeta}>{student.id} • {getClassroomName(student)}</Text>
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
          ? `Selected learner: ${getStudentFullName(selectedStudent)} (${selectedStudent.id}) • ${getClassroomName(selectedStudent)}`
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
                      {student.id} • {getClassroomName(student)}{isLinked ? ' • linked' : ''}
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

  if (!authReady) {
    return (
      <SafeAreaView style={styles.loginScreenContainer}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>Loading access...</Text>
          <Text style={styles.loginSubtitle}>Checking your Firebase sign-in and role permissions.</Text>
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
            options={{ title: 'School Safety Modules' }}
          >
            {(props) => <HomeScreen {...props} onLogout={handleLogout} loginIdentity={loginIdentity} />}
          </Stack.Screen>
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
            options={({ route }) => ({ title: route.params?.className || 'Class Folder' })}
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
            options={({ route }) => ({ title: route.params?.folder?.label || 'Documents' })}
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
  const isParentAccount = isParentRole(accessProfile);
  const canEditStudents = hasPermission(accessProfile, 'canEditStudents');
  const canManageUsers = hasPermission(accessProfile, 'canManageUsers');
  const canExportReports = hasPermission(accessProfile, 'canExportReports');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <View style={styles.homeHeaderRow}>
          <View style={styles.homeHeaderTextWrap}>
            <Text style={styles.title}>School Safety</Text>
            <Text style={styles.subtitle}>Bana Pele daily compliance tools</Text>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutButtonText}>Log out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.helperText}>
          {isParentAccount
            ? `Logged in as ${loginIdentity || 'Parent'} • ${roleLabel} access. You can view your linked child records and update medical details.`
            : `Logged in as ${loginIdentity || 'Staff Member'} • ${roleLabel} access. Student editing is ${canEditStudents ? 'enabled' : 'view-only'} for this account.`}
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {isParentAccount
              ? 'This parent account only shows the learner(s) linked to it. Attendance, incidents, and medicine history are read-only.'
              : 'Access is tied to the signed-in Firebase user. You can change `role` or `permissions` later in Firestore under the `users` collection.'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.moduleCard}
          onPress={() => navigation.navigate('StudentDirectory')}
        >
          <Text style={styles.moduleTitle}>{isParentAccount ? 'My Child/Children' : 'Students'}</Text>
          <Text style={styles.moduleSubtitle}>
            {isParentAccount
              ? 'View your linked child profile, attendance history, medicine log, and incident history'
              : 'Emergency profiles, contacts, and class-level quick actions for attendance, incidents, and medicine logs'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.moduleCard}
          onPress={() => navigation.navigate('Activities')}
        >
          <Text style={styles.moduleTitle}>Activities</Text>
          <Text style={styles.moduleSubtitle}>
            {isParentAccount
              ? 'View activities done in your child\'s class'
              : 'Log daily classroom activities and export activity reports'}
          </Text>
        </TouchableOpacity>

        {!isParentAccount && canManageUsers ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('ManageUsers')}
          >
            <Text style={styles.moduleTitle}>Staff Access</Text>
            <Text style={styles.moduleSubtitle}>Principal-only user roles, permissions, and account access control</Text>
          </TouchableOpacity>
        ) : null}

        {!isParentAccount ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('ComplianceDocuments')}
          >
            <Text style={styles.moduleTitle}>Compliance</Text>
            <Text style={styles.moduleSubtitle}>Evacuation plans, DSD registration, health & safety, and other required ECD compliance documents</Text>
          </TouchableOpacity>
        ) : null}

        {!isParentAccount && canExportReports ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('ComplianceReports')}
          >
            <Text style={styles.moduleTitle}>PDF Export</Text>
            <Text style={styles.moduleSubtitle}>Download a professional compliance report with school name and date range.</Text>
          </TouchableOpacity>
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>Staff Access</Text>
        <Text style={styles.subtitle}>Principal control for roles and permissions</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Create staff accounts in Firebase Authentication first. Once a staff member signs in once, they appear here and you can control what they are allowed to do.</Text>
        </View>

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

        {userProfiles.map((userProfile) => (
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

            {savingUid === userProfile.uid ? <Text style={styles.statusText}>Saving access changes...</Text> : null}
          </View>
        ))}
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
  const [errorMessage, setErrorMessage] = useState('');

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const data = await loadStudentsFromDataStore();
      setStudents(Array.isArray(data) ? data : []);
    } catch (error) {
      setErrorMessage(error.message || 'Could not fetch students.');
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.screenContainer}>
<Text style={styles.title}>{isParentAccount ? 'My Child/Children' : 'Emergency Info'}</Text>
        <Text style={styles.subtitle}>{isParentAccount ? 'Your linked learner records' : 'Student Directory by Class'}</Text>

        {canEditStudents ? (
          <TouchableOpacity
            style={styles.addStudentButton}
            onPress={() => navigation.navigate('StudentForm', { mode: 'add' })}
          >
            <Text style={styles.addStudentButtonText}>+ Add Student</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {isParentAccount
                ? 'This parent view only shows the learner(s) linked to your account. You can update medical/contact information from the learner profile.'
                : 'View-only student access: only principal/admin users can add or edit learners.'}
            </Text>
          </View>
        )}

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
          helperText={isParentAccount ? 'Start typing your child name for instant access.' : 'Start typing a learner name and tap the matching result for instant access.'}
        />

        {loading ? <Text style={styles.statusText}>Loading students...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {!loading && !errorMessage && isParentAccount && visibleStudentPool.length === 0 ? (
          <Text style={styles.statusText}>No learner has been linked to this parent account yet. Ask the principal to open Staff Access and select the child for this parent.</Text>
        ) : null}

          <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
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
                    <Text style={styles.studentClassText}>{student.id} • {getClassroomName(student)}</Text>
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
      </TouchableWithoutFeedback>
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
  const [incidentSaving, setIncidentSaving] = useState(false);
  const [medicineStudent, setMedicineStudent] = useState(null);
  const [medicineName, setMedicineName] = useState('');
  const [medicineDosage, setMedicineDosage] = useState('');
  const [medicineStaffMember, setMedicineStaffMember] = useState('');
  const [medicineSaving, setMedicineSaving] = useState(false);

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
    return students.filter((student) => {
      const matchesClass = getClassroomName(student) === className;
      const allowedStudent = canAccessStudent(accessProfile, student);
      const studentName = getStudentFullName(student).toLowerCase();
      const studentId = String(student.id || '').toLowerCase();
      return allowedStudent && matchesClass && (!query || studentName.includes(query) || studentId.includes(query));
    });
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
  };

  const closeIncidentModal = () => {
    setIncidentStudent(null);
    setIncidentDescription('');
    setIncidentActionTaken('');
    setIncidentWitness('');
  };

  const handleSaveIncident = async () => {
    if (!incidentStudent) {
      return;
    }

    if (!incidentLocation.trim() || !incidentDescription.trim() || !incidentActionTaken.trim() || !incidentWitness.trim()) {
      Alert.alert('Missing Details', 'Please complete location, description, action taken, and witness.');
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
  };

  const closeMedicineModal = () => {
    setMedicineStudent(null);
    setMedicineName('');
    setMedicineDosage('');
    setMedicineStaffMember('');
  };

  const handleSaveMedicine = async () => {
    if (!medicineStudent) {
      return;
    }

    if (!medicineName.trim() || !medicineDosage.trim() || !medicineStaffMember.trim()) {
      Alert.alert('Missing Details', 'Please complete medication, dosage, and staff member.');
      return;
    }

    try {
      setMedicineSaving(true);
      const savedEntry = await saveMedicineLogRecord({
        studentId: String(medicineStudent.id || '').trim(),
        medicationName: medicineName.trim(),
        dosage: medicineDosage.trim(),
        staffMember: medicineStaffMember.trim(),
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

  const activeMedicineAllergyWarning = useMemo(
    () => doesMedicationTriggerAllergy(medicineName, medicineStudent?.allergies || ''),
    [medicineName, medicineStudent],
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>{className}</Text>
        <Text style={styles.subtitle}>Students in this class with quick daily logging</Text>
        <Text style={styles.helperText}>Use each learner card to set attendance status and quickly log incidents or medicine without leaving Students.</Text>

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
              <View style={styles.itemHeaderRow}>
                <TouchableOpacity onPress={() => navigation.navigate('EmergencyProfile', { student })}>
                  <Text style={styles.studentName}>{getStudentFullName(student)}</Text>
                  <Text style={styles.studentClassText}>{student.id} • {getClassroomName(student)}</Text>
                  {isParentMarkedAbsent ? <Text style={styles.tapHint}>Parent marked this learner absent today.</Text> : null}
                </TouchableOpacity>
                <View style={[styles.statusBadge, statusStyleFor(attendanceEntry.status)]}>
                  <Text style={styles.statusBadgeText}>{attendanceEntry.status}</Text>
                </View>
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
                  <Text style={styles.quickLogButtonText}>Log Incident</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickLogButton, !canLogMedicine && styles.saveStudentButtonDisabled]}
                  onPress={() => openMedicineModal(student)}
                  disabled={!canLogMedicine}
                >
                  <Text style={styles.quickLogButtonText}>Log Medicine</Text>
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
  const isParentAccount = isParentRole(accessProfile);
  const { student } = route.params;
  const [isMedicalAidVisible, setIsMedicalAidVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [parentAbsentSaving, setParentAbsentSaving] = useState(false);
  const [showParentAbsentDatePicker, setShowParentAbsentDatePicker] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [incidentHistory, setIncidentHistory] = useState([]);
  const [medicineHistory, setMedicineHistory] = useState([]);
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

  const refreshParentAttendanceHistory = useCallback(async () => {
    if (!isParentAccount || !student?.id) {
      setAttendanceHistory([]);
      return;
    }

    const refreshedAttendance = await fetchAllAttendanceFromFirestore();
    const normalizedStudentId = String(student.id || '').trim();
    setAttendanceHistory(
      filterRecordsByAccess(refreshedAttendance, accessProfile).filter((entry) => {
        const entryStatus = String(entry.status || '').trim();
        return String(entry.studentId || '').trim() === normalizedStudentId && ['Absent', 'Late'].includes(entryStatus);
      }),
    );
  }, [isParentAccount, student?.id, accessProfile]);

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
    const expectedPin = String(student.medicalPin || '1234');
    if (pinInput !== expectedPin) {
      Alert.alert('Access Denied', 'Incorrect PIN.');
      return;
    }

    setIsMedicalAidVisible(true);
    setPinInput('');
    setIsPinModalVisible(false);
  };

  const handleCancelPin = () => {
    setPinInput('');
    setIsPinModalVisible(false);
  };

  const handleParentReportAbsentForDate = () => {
    if (!isParentAccount || !canOpenThisStudent || !student?.id) {
      return;
    }

    if (parentAbsentDate < TODAY) {
      Alert.alert('Date Not Allowed', 'Please choose today or a future date for absence notices.');
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
              await refreshParentAttendanceHistory();

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

  const handleParentUndoAbsentForDate = () => {
    if (!isParentAccount || !canOpenThisStudent || !student?.id || !hasParentMarkedAbsentForDate) {
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
              await refreshParentAttendanceHistory();

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
    let isActive = true;

    const loadParentHistory = async () => {
      if (!isParentAccount || !student?.id) {
        setAttendanceHistory([]);
        setIncidentHistory([]);
        setMedicineHistory([]);
        setHistoryLoading(false);
        return;
      }

      try {
        setHistoryLoading(true);
        const [attendanceData, incidentData, medicineData] = await Promise.all([
          fetchAllAttendanceFromFirestore(),
          loadIncidentsFromDataStore(),
          loadMedicineLogsFromDataStore(),
        ]);

        if (!isActive) {
          return;
        }

        const normalizedStudentId = String(student.id || '').trim();
        setAttendanceHistory(
          filterRecordsByAccess(attendanceData, accessProfile).filter((entry) => {
            const entryStatus = String(entry.status || '').trim();
            return String(entry.studentId || '').trim() === normalizedStudentId && ['Absent', 'Late'].includes(entryStatus);
          }),
        );
        setIncidentHistory(filterRecordsByAccess(incidentData, accessProfile).filter((entry) => String(entry.studentId || '').trim() === normalizedStudentId));
        setMedicineHistory(filterRecordsByAccess(medicineData, accessProfile).filter((entry) => String(entry.studentId || '').trim() === normalizedStudentId));
      } catch (error) {
        console.warn('Could not load parent history view.', error);
      } finally {
        if (isActive) {
          setHistoryLoading(false);
        }
      }
    };

    loadParentHistory();
    return () => {
      isActive = false;
    };
  }, [isParentAccount, student?.id, accessProfile]);

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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contact Details</Text>
          {emergencyContacts.map((contact, index) => (
            <TouchableOpacity
              key={`${contact.number || 'contact'}-${index}`}
              style={styles.contactButton}
              onPress={() => handleDial(contact.number)}
            >
              <Text style={styles.contactButtonText}>
                Call {contact.name || `Emergency Contact ${index + 1}`}: {contact.number || 'No number saved'}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.contactButton, styles.doctorButton]}
            onPress={() => handleDial(student.doctorContact)}
          >
            <Text style={styles.contactButtonText}>Call Doctor: {student.doctorContact || 'No number saved'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, hasCriticalAllergy ? styles.allergyAlertCard : styles.noAllergyCard]}>
          <Text style={styles.sectionTitle}>Allergies</Text>
          <Text style={styles.allergyText}>{student.allergies || 'None reported'}</Text>
        </View>

        {isParentAccount ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Attendance Notice</Text>
            <Text style={styles.infoText}>Choose a date and submit an absence notice so staff can see it in the attendance register.</Text>
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
              style={[styles.editStudentButton, hasParentMarkedAbsentForDate && styles.moduleCardDisabled]}
              onPress={handleParentReportAbsentForDate}
              disabled={parentAbsentSaving || hasParentMarkedAbsentForDate}
            >
              <Text style={styles.editStudentButtonText}>
                {parentAbsentSaving
                  ? 'Saving absence...'
                  : hasParentMarkedAbsentForDate
                    ? 'Absent for selected date submitted'
                    : 'Child Will Be Absent'}
              </Text>
            </TouchableOpacity>
            {hasParentMarkedAbsentForDate ? (
              <>
                <Text style={styles.tapHint}>Staff can now see this for {parentAbsentDate} under attendance.</Text>
                <TouchableOpacity
                  style={styles.undoAbsentButton}
                  onPress={handleParentUndoAbsentForDate}
                  disabled={parentAbsentSaving}
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
              currentYear={parseInt(parentAbsentYear, 10)}
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
            Number: {isMedicalAidVisible ? student.medicalAidNumber || 'Not recorded' : '************'}
          </Text>

          <TouchableOpacity style={styles.vaultToggleButton} onPress={handleToggleMedicalAid}>
            <Text style={styles.vaultToggleButtonText}>
              {isMedicalAidVisible ? 'Hide Medical Aid' : 'Show Medical Aid'}
            </Text>
          </TouchableOpacity>
        </View>

        {isParentAccount ? (
          <>
            <Text style={styles.sectionTitle}>Attendance History</Text>
            {historyLoading ? <Text style={styles.statusText}>Loading attendance history...</Text> : null}
            {!historyLoading && attendanceHistory.length === 0 ? <Text style={styles.statusText}>No late or absent records yet.</Text> : null}
            {attendanceHistory.slice(0, 12).map((entry) => (
              <View key={entry.id} style={styles.timelineCard}>
                <Text style={styles.studentName}>{entry.status}</Text>
                <Text style={styles.timelineMeta}>{entry.date || formatDateTime(entry.createdAt)} • {entry.className || getClassroomName(student)}</Text>
                {entry.reason ? <Text style={styles.timelineText}>Reason: {entry.reason}</Text> : null}
              </View>
            ))}

            <Text style={styles.sectionTitle}>Incident History</Text>
            {!historyLoading && incidentHistory.length === 0 ? <Text style={styles.statusText}>No incident records yet.</Text> : null}
            {incidentHistory.slice(0, 12).map((entry) => (
              <View key={entry.id} style={styles.timelineCard}>
                <Text style={styles.studentName}>{entry.location || 'Incident'}</Text>
                <Text style={styles.timelineMeta}>{formatDateTime(entry.timestamp)}</Text>
                <Text style={styles.timelineText}>{entry.description}</Text>
                <Text style={styles.tapHint}>Action taken: {entry.actionTaken || 'Not recorded'}</Text>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Medicine Log History</Text>
            {!historyLoading && medicineHistory.length === 0 ? <Text style={styles.statusText}>No medicine entries yet.</Text> : null}
            {medicineHistory.slice(0, 12).map((entry) => (
              <View key={entry.id} style={styles.timelineCard}>
                <Text style={styles.studentName}>{entry.medicationName || 'Medication'}</Text>
                <Text style={styles.timelineMeta}>{formatDateTime(entry.timeAdministered)}</Text>
                <Text style={styles.timelineText}>Dosage: {entry.dosage || 'Not recorded'}</Text>
                <Text style={styles.tapHint}>Staff member: {entry.staffMember || 'Not recorded'}</Text>
              </View>
            ))}
          </>
        ) : null}

        <Modal
          visible={isPinModalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCancelPin}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Enter PIN</Text>
              <Text style={styles.modalText}>Enter your emergency access PIN to view medical aid details.</Text>

              <TextInput
                style={styles.pinInput}
                value={pinInput}
                onChangeText={setPinInput}
                placeholder="4-digit PIN"
                secureTextEntry
                keyboardType="number-pad"
                maxLength={4}
              />

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
                  disabled={savingStudentId === entry.studentId || !canTakeAttendance}
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
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [location, setLocation] = useState('Playground');
  const [description, setDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [witness, setWitness] = useState('');
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

    try {
      setIsSaving(true);
      const savedIncident = await saveIncidentRecord({
        studentId: selectedStudentId,
        location: location.trim(),
        description: description.trim(),
        actionTaken: actionTaken.trim(),
        witness: witness.trim(),
      }, selectedStudent);

      setIncidents((currentIncidents) => [savedIncident, ...currentIncidents]);
      setDescription('');
      setActionTaken('');
      setWitness('');
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

        <Text style={styles.sectionTitle}>Recent Incidents</Text>
        {incidents.map((incident) => (
          <View key={incident.id} style={styles.timelineCard}>
            <Text style={styles.studentName}>{incident.studentName || 'General incident'}</Text>
            <Text style={styles.timelineMeta}>{formatDateTime(incident.timestamp)} • {incident.location}</Text>
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
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [staffMember, setStaffMember] = useState('');
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

    try {
      setIsSaving(true);
      const savedEntry = await saveMedicineLogRecord({
        studentId: selectedStudentId,
        medicationName: medicationName.trim(),
        dosage: dosage.trim(),
        staffMember: staffMember.trim(),
      }, selectedStudent);

      setMedicineLogs((currentLogs) => [savedEntry, ...currentLogs]);
      setMedicationName('');
      setDosage('');
      setStaffMember('');

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

        <Text style={styles.sectionTitle}>Recent Medicine Logs</Text>
        {medicineLogs.map((entry) => (
          <View key={entry.id} style={styles.timelineCard}>
            <Text style={styles.studentName}>{entry.studentName || entry.studentId}</Text>
            <Text style={styles.timelineMeta}>{formatDateTime(entry.timeAdministered)}</Text>
            <Text style={styles.timelineText}>{entry.medicationName} - {entry.dosage}</Text>
            <Text style={styles.tapHint}>Given by: {entry.staffMember}</Text>
            {entry.allergyWarning ? <Text style={styles.warningText}>WARNING flagged against allergy record</Text> : null}
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
              <Text style={styles.complianceEmptyHint}>No activities have been logged yet for your child\'s class.</Text>
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
          currentYear={parseInt(startYear, 10)}
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
          currentYear={parseInt(endYear, 10)}
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
  const [schoolName, setSchoolName] = useState(DEFAULT_SCHOOL_NAME);

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
      navigation.goBack();
    }
  }, [canExportReports, navigation]);

  const startDate = `${startYear}-${startMonth}-${startDay}`;
  const endDate = `${endYear}-${endMonth}-${endDay}`;

  const handleExport = async () => {
    if (startDate > endDate) {
      Alert.alert('Date Range Error', 'Start date must be before or equal to end date.');
      return;
    }

    const url = `${API_BASE_URL}/exports/compliance-report?schoolName=${encodeURIComponent(
      schoolName.trim() || DEFAULT_SCHOOL_NAME,
    )}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;

    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Open Failed', 'Could not open the PDF export link.');
      return;
    }

    await Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>Compliance Report Export</Text>
        <Text style={styles.subtitle}>Generate a professional PDF layout for audits and recordkeeping</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>The PDF includes School Name, Date Range, attendance (Late/Absent only), incidents, and medicine logs.</Text>
        </View>

        <TextInput
          style={styles.formInput}
          placeholder="School Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={schoolName}
          onChangeText={setSchoolName}
        />

        <View style={styles.compactDateRangeContainer}>
          <View style={styles.compactDateFieldWrapper}>
            <Text style={styles.compactDateLabel}>Start Date</Text>
            <TouchableOpacity
              style={styles.compactDateField}
              onPress={() => setShowStartPicker(true)}
            >
              <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(startYear, startMonth, startDay)}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.compactDateFieldWrapper}>
            <Text style={styles.compactDateLabel}>End Date</Text>
            <TouchableOpacity
              style={styles.compactDateField}
              onPress={() => setShowEndPicker(true)}
            >
              <Text style={styles.compactDateFieldText}>{formatCompactDateDisplay(endYear, endMonth, endDay)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.reportButton} onPress={handleExport}>
          <Text style={styles.saveStudentButtonText}>Open PDF Export</Text>
        </TouchableOpacity>

        <CompactDatePickerModal
          visible={showStartPicker}
          onClose={() => setShowStartPicker(false)}
          onDateSelect={(y, m, d) => {
            setStartYear(y);
            setStartMonth(m);
            setStartDay(d);
          }}
          currentYear={parseInt(startYear, 10)}
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
          currentYear={parseInt(endYear, 10)}
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

  const handleMomentumScrollEnd = (event) => {
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
        <View style={styles.compactDatePickerOverlay} />
        <ScrollView
          ref={scrollViewRef}
          scrollEventThrottle={16}
          snapToInterval={itemHeight}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          style={styles.compactDatePickerScroll}
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
  const [className, setClassName] = useState(initialStudent?.className || CLASSROOM_OPTIONS[1]);
  const [emergencyContact1Name, setEmergencyContact1Name] = useState(initialEmergencyContacts[0]?.name || '');
  const [emergencyContact1Number, setEmergencyContact1Number] = useState(initialEmergencyContacts[0]?.number || '');
  const [emergencyContact2Name, setEmergencyContact2Name] = useState(initialEmergencyContacts[1]?.name || '');
  const [emergencyContact2Number, setEmergencyContact2Number] = useState(initialEmergencyContacts[1]?.number || '');
  const [emergencyContact3Name, setEmergencyContact3Name] = useState(initialEmergencyContacts[2]?.name || '');
  const [emergencyContact3Number, setEmergencyContact3Number] = useState(initialEmergencyContacts[2]?.number || '');
  const [allergies, setAllergies] = useState(initialStudent?.allergies || '');
  const [medicalAidName, setMedicalAidName] = useState(initialStudent?.medicalAidName || '');
  const [medicalAidNumber, setMedicalAidNumber] = useState(initialStudent?.medicalAidNumber || '');
  const [doctorContact, setDoctorContact] = useState(initialStudent?.doctorContact || '');
  const [medicalPin, setMedicalPin] = useState(initialStudent?.medicalPin || '');
  const [isSaving, setIsSaving] = useState(false);
  const isParentEditMode = mode === 'parent-edit';
  const canSaveStudent = canEditStudents || (isParentEditMode && canEditOwnChildMedicalInfo && canAccessStudent(accessProfile, initialStudent));

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
      firstName: isParentEditMode ? String(initialStudent?.firstName || firstName).trim() : firstName.trim(),
      lastName: isParentEditMode ? String(initialStudent?.lastName || lastName).trim() : lastName.trim(),
      className: isParentEditMode ? String(initialStudent?.className || className).trim() : className.trim() || CLASSROOM_OPTIONS[1],
      emergencyContacts,
      allergies: allergies.trim() || 'No known allergies',
      medicalAidName: medicalAidName.trim(),
      medicalAidNumber: medicalAidNumber.trim(),
      doctorContact: doctorContact.trim(),
      medicalPin: medicalPin.trim(),
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
        {!canSaveStudent ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>This account has view-only student access. Ask a principal/admin account to make changes.</Text>
          </View>
        ) : isParentEditMode ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>You can update emergency contacts and medical information for your linked child here. Learner name, class, attendance, incident, and medicine records stay protected.</Text>
          </View>
        ) : null}

        {!isParentEditMode ? (
          <>
            <TextInput
              style={styles.formInput}
              placeholder="First Name"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={firstName}
              onChangeText={setFirstName}
            />
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
              {CLASSROOM_OPTIONS.slice(1).map((option) => (
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
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 1 Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact1Name}
          onChangeText={setEmergencyContact1Name}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 1 Number"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact1Number}
          onChangeText={setEmergencyContact1Number}
        />

        <Text style={styles.formSectionLabel}>Emergency Contact 2 (Optional)</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 2 Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact2Name}
          onChangeText={setEmergencyContact2Name}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 2 Number"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact2Number}
          onChangeText={setEmergencyContact2Number}
        />

        <Text style={styles.formSectionLabel}>Emergency Contact 3 (Optional)</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Emergency Contact 3 Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={emergencyContact3Name}
          onChangeText={setEmergencyContact3Name}
        />
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
        <TextInput
          style={styles.formInput}
          placeholder="Medical Aid Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={medicalAidName}
          onChangeText={setMedicalAidName}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Medical Aid Number"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={medicalAidNumber}
          onChangeText={setMedicalAidNumber}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Doctor Contact"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={doctorContact}
          onChangeText={setDoctorContact}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Medical PIN"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={medicalPin}
          onChangeText={setMedicalPin}
          secureTextEntry
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

const styles = StyleSheet.create({
  loginScreenContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    padding: 24,
  },
  loginCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E8EAED',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  loginTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 15,
    color: '#3C4043',
    marginBottom: 14,
    lineHeight: 24,
  },
  loginButton: {
    marginTop: 4,
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    alignItems: 'center',
    paddingVertical: 13,
  },
  loginHint: {
    marginTop: 12,
    color: '#80868B',
    textAlign: 'center',
    fontSize: 13,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  screenContainer: {
    flex: 1,
    padding: 24,
  },
  formContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  homeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  homeHeaderTextWrap: {
    flex: 1,
  },
  logoutButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8EAED',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 40,
    justifyContent: 'center',
  },
  logoutButtonText: {
    color: '#3C4043',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#202124',
  },
  subtitle: {
    fontSize: 15,
    color: '#3C4043',
    marginBottom: 8,
    lineHeight: 24,
  },
  helperText: {
    color: '#80868B',
    marginBottom: 12,
    lineHeight: 24,
    fontSize: 14,
  },
  addStudentButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 12,
  },
  addStudentButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  moduleCard: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E8EAED',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  moduleTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 4,
  },
  moduleSubtitle: {
    color: '#3C4043',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
  },
  folderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  folderTextWrap: {
    flex: 1,
  },
  folderToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  folderContentCard: {
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 15,
    color: '#3C4043',
  },
  listContent: {
    paddingBottom: 14,
  },
  classSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EAED',
    marginBottom: 12,
  },
  classHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  classSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#202124',
  },
  classCountText: {
    color: '#80868B',
    fontWeight: '600',
  },
  studentItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8EAED',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8EAED',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  studentName: {
    fontSize: 18,
    color: '#202124',
    fontWeight: '600',
  },
  studentClassText: {
    marginTop: 4,
    color: '#80868B',
    fontWeight: '500',
    fontSize: 14,
  },
  tapHint: {
    marginTop: 5,
    color: '#80868B',
    fontWeight: '400',
    fontSize: 13,
  },
  statusText: {
    color: '#3C4043',
    marginBottom: 10,
  },
  errorText: {
    color: '#B91C1C',
    marginBottom: 10,
    fontWeight: '600',
  },
  profileName: {
    fontSize: 29,
    color: '#202124',
    fontWeight: '600',
    marginBottom: 10,
  },
  editStudentButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  editStudentButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quickLogRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  quickLogButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  quickLogButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quickLogButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8EAED',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  quickLogButtonSecondaryText: {
    color: '#3C4043',
    fontWeight: '600',
  },
  undoAbsentButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8EAED',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  undoAbsentButtonText: {
    color: '#3C4043',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E8EAED',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    color: '#202124',
  },
  contactButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  doctorButton: {
    backgroundColor: '#2F855A',
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  allergyAlertCard: {
    backgroundColor: '#FFF3E8',
    borderColor: '#E8590C',
    borderWidth: 2,
  },
  noAllergyCard: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2F855A',
  },
  allergyText: {
    color: '#7C2D12',
    fontWeight: '700',
    fontSize: 16,
  },
  vaultText: {
    fontSize: 15,
    color: '#3C4043',
    marginBottom: 7,
    lineHeight: 24,
  },
  vaultToggleButton: {
    marginTop: 10,
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  vaultToggleButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#3C4043',
    marginBottom: 12,
    lineHeight: 22,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8EAED',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalButtonSecondaryText: {
    color: '#3C4043',
    fontWeight: '600',
  },
  modalButtonPrimary: {
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalButtonPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  formTitle: {
    fontSize: 24,
    color: '#202124',
    fontWeight: '600',
    marginBottom: 14,
  },
  formSectionLabel: {
    color: '#80868B',
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
    fontSize: 13,
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 12,
    fontSize: 15,
    color: '#3C4043',
  },
  reasonInput: {
    minHeight: 48,
    textAlignVertical: 'top',
  },
  saveStudentButton: {
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveStudentButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveStudentButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgePresent: {
    backgroundColor: '#D3F9D8',
  },
  statusBadgeLate: {
    backgroundColor: '#FFF3BF',
  },
  statusBadgeAbsent: {
    backgroundColor: '#FFE3E3',
  },
  statusBadgeText: {
    fontWeight: '600',
    color: '#3C4043',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusActionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8EAED',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  statusActionButtonSelected: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  statusActionButtonText: {
    color: '#3C4043',
    fontWeight: '600',
  },
  chipContainer: {
    paddingBottom: 10,
    gap: 8,
  },
  chipButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8EAED',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipButtonSelected: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  chipButtonText: {
    color: '#3C4043',
    fontWeight: '600',
  },
  selectedActionText: {
    color: '#FFFFFF',
  },
  autocompleteContainer: {
    marginBottom: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 6,
    paddingRight: 8,
    marginBottom: 16,
  },
  autocompleteTextInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#3C4043',
  },
  clearSearchButton: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F3F4',
  },
  clearSearchButtonText: {
    color: '#80868B',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  autocompleteResults: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 6,
    marginTop: -4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  autocompleteScrollArea: {
    maxHeight: 156,
  },
  autocompleteItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAED',
    minHeight: 48,
    justifyContent: 'center',
  },
  autocompleteName: {
    color: '#202124',
    fontWeight: '600',
  },
  autocompleteMeta: {
    color: '#80868B',
    marginTop: 2,
    fontSize: 12,
  },
  autocompleteEmpty: {
    color: '#80868B',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectedLearnerText: {
    color: '#80868B',
    fontSize: 13,
    marginTop: -2,
    marginBottom: 4,
  },
  warningCard: {
    backgroundColor: '#FFF3E8',
    borderColor: '#E8590C',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  warningText: {
    color: '#C2410C',
    fontWeight: '700',
  },
  timelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8EAED',
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  timelineMeta: {
    color: '#80868B',
    marginTop: 4,
    marginBottom: 8,
  },
  timelineText: {
    color: '#3C4043',
    marginBottom: 6,
    lineHeight: 20,
  },
  lockText: {
    color: '#7C2D12',
    fontWeight: '700',
    marginTop: 6,
  },
  infoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8EAED',
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    color: '#3C4043',
    lineHeight: 22,
    fontSize: 14,
  },
  reportButton: {
    marginTop: 8,
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  complianceFolderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8EAED',
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  complianceFolderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  complianceFolderIcon: {
    fontSize: 22,
  },
  complianceFolderTextWrap: {
    flex: 1,
  },
  complianceFolderLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 2,
  },
  complianceFolderDesc: {
    fontSize: 12,
    color: '#80868B',
    lineHeight: 16,
  },
  complianceFolderChevron: {
    fontSize: 13,
    color: '#1A73E8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  complianceEmptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  complianceEmptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  complianceEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3C4043',
    marginBottom: 6,
  },
  complianceEmptyHint: {
    fontSize: 13,
    color: '#80868B',
    textAlign: 'center',
  },
  complianceDocCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8EAED',
    marginBottom: 12,
    overflow: 'hidden',
  },
  complianceDocMain: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'flex-start',
    gap: 10,
  },
  complianceDocIcon: {
    fontSize: 28,
    marginTop: 2,
  },
  complianceDocTextWrap: {
    flex: 1,
  },
  complianceDocName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 4,
  },
  complianceDocMeta: {
    fontSize: 12,
    color: '#80868B',
    marginBottom: 2,
  },
  complianceDocNotes: {
    fontSize: 12,
    color: '#3C4043',
    marginTop: 4,
    fontStyle: 'italic',
  },
  complianceDocActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E8EAED',
  },
  complianceOpenBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  complianceOpenBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
  },
  complianceDeleteBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderLeftColor: '#E8EAED',
  },
  complianceDeleteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C4043',
  },
  complianceUploadSection: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8EAED',
    padding: 20,
  },
  complianceUploadTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 10,
  },
  complianceUploadBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  complianceUploadBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  dateRangeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
    marginTop: 16,
    marginBottom: 12,
  },
  datePickerRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  datePickerColumnContainer: {
    flex: 1,
  },
  datePickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#80868B',
    marginBottom: 6,
    textAlign: 'center',
  },
  datePickerScrollBound: {
    height: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8EAED',
    overflow: 'hidden',
    position: 'relative',
  },
  datePickerScroll: {
    flex: 1,
  },
  datePickerItem: {
    fontSize: 16,
    fontWeight: '500',
    color: '#80868B',
  },
  datePickerItemSelected: {
    fontSize: 18,
    fontWeight: '700',
    color: '#202124',
  },
  datePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(16, 42, 67, 0.1)',
    borderBottomColor: 'rgba(16, 42, 67, 0.1)',
    top: 65,
    height: 50,
    pointerEvents: 'none',
    zIndex: 10,
  },
  compactDateRangeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 16,
  },
  compactDateFieldWrapper: {
    flex: 1,
  },
  compactDateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#80868B',
    marginBottom: 6,
  },
  compactDateField: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  compactDateFieldText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3C4043',
  },
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    width: '85%',
    maxWidth: 350,
  },
  datePickerModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 16,
    textAlign: 'center',
  },
  compactDatePickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  datePickerModalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  datePickerModalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  datePickerModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3C4043',
  },
  datePickerModalConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#1A73E8',
  },
  datePickerModalConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  compactDatePickerColumnContainer: {
    flex: 1,
  },
  compactDatePickerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#80868B',
    marginBottom: 6,
    textAlign: 'center',
  },
  compactDatePickerScrollBound: {
    height: 120,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8EAED',
    overflow: 'hidden',
    position: 'relative',
  },
  compactDatePickerScroll: {
    flex: 1,
  },
  compactDatePickerItem: {
    fontSize: 13,
    fontWeight: '500',
    color: '#80868B',
  },
  compactDatePickerItemSelected: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202124',
  },
  compactDatePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(16, 42, 67, 0.1)',
    borderBottomColor: 'rgba(16, 42, 67, 0.1)',
    top: 40,
    height: 40,
    pointerEvents: 'none',
    zIndex: 10,
  },
  formTextArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  successBanner: {
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  successBannerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
  },
  activityFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  activityFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  activityFilterChipActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#1A73E8',
  },
  activityFilterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C4043',
  },
  activityFilterChipTextActive: {
    color: '#1A73E8',
  },
  activityLogButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 16,
  },
  activityLogButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  activityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8EAED',
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  activityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  activityCardHeaderText: {
    flex: 1,
    marginRight: 8,
  },
  activityCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 2,
  },
  activityCardMeta: {
    fontSize: 13,
    color: '#80868B',
  },
  activityCardBadge: {
    backgroundColor: '#E8F0FE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activityCardBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A73E8',
  },
  activityCardDetail: {
    fontSize: 14,
    color: '#3C4043',
    marginBottom: 4,
    lineHeight: 22,
  },
  activityCardBody: {
    fontSize: 14,
    color: '#3C4043',
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 4,
  },
  activityCardFooter: {
    fontSize: 12,
    color: '#80868B',
    marginTop: 6,
  },
  activityDeleteButton: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  activityDeleteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C92A2A',
  },
  activityFilePickButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAED',
    borderRadius: 6,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 6,
  },
  activityFilePickButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A73E8',
  },
  activityRemoveFile: {
    fontSize: 13,
    color: '#C92A2A',
    textAlign: 'center',
    marginBottom: 12,
  },
  activityCardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  activityEditButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#E8F0FE',
    borderWidth: 1,
    borderColor: '#1A73E8',
    minHeight: 40,
    justifyContent: 'center',
  },
  activityEditButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A73E8',
  },
  activityDetailRow: {
    marginBottom: 10,
  },
  activityDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#80868B',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activityDetailValue: {
    fontSize: 14,
    color: '#3C4043',
    lineHeight: 22,
  },
});