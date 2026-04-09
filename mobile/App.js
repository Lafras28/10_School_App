import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  DEFAULT_ROLE_PERMISSIONS,
  fetchAttendanceFromFirestore,
  fetchIncidentsFromFirestore,
  fetchMedicineLogsFromFirestore,
  fetchStudentsFromFirestore,
  fetchUserAccessProfiles,
  listenToAuthChanges,
  saveAttendanceToFirestore,
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
const CLASSROOM_OPTIONS = ['All Classes', 'Sunshine Bunnies', 'Rainbow Cubs', 'Little Explorers'];
const ROLE_OPTIONS = ['principal', 'teacher', 'viewer'];
const MANAGEABLE_PERMISSION_OPTIONS = [
  { key: 'canEditStudents', label: 'Edit students' },
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
});

function useAccessProfile() {
  return useContext(AccessContext);
}

function hasPermission(accessProfile, permission) {
  return Boolean(accessProfile?.permissions?.[permission]);
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
  try {
    const firestoreEntries = await fetchAttendanceFromFirestore(registerDate);
    if (Array.isArray(firestoreEntries) && firestoreEntries.length > 0) {
      return firestoreEntries;
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
      return nextEntries;
    }
  } catch (error) {
    console.warn('Backend attendance unavailable, generating defaults from student data.', error);
  }

  const defaultEntries = buildDefaultAttendanceEntries(registerDate, students);
  if (defaultEntries.length > 0) {
    try {
      await seedAttendanceToFirestore(defaultEntries);
    } catch (error) {
      console.warn('Could not seed default attendance entries to Firestore.', error);
    }
  }

  return defaultEntries;
}

async function saveAttendanceRecord(registerDate, entry, status, reason = '') {
  try {
    return await saveAttendanceToFirestore(registerDate, entry, status, reason);
  } catch (firestoreError) {
    console.warn('Firestore attendance save failed, using backend fallback.', firestoreError);

    const data = await fetchJson(`${API_BASE_URL}/attendance/${registerDate}/${entry.studentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, reason }),
    });

    return data?.entry || entry;
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
    const pool = !normalizedQuery
      ? students
      : students.filter((student) => {
          const name = getStudentFullName(student).toLowerCase();
          const studentId = String(student.id || '').toLowerCase();
          return name.includes(normalizedQuery) || studentId.includes(normalizedQuery);
        });

    return pool.slice(0, 8);
  }, [query, students]);

  const handleSelect = (student) => {
    onSelect(student.id);
    setQuery(getStudentFullName(student));
    setShowSuggestions(false);
  };

  return (
    <View style={styles.autocompleteContainer}>
      <TextInput
        style={styles.formInput}
        placeholder={placeholder}
        placeholderTextColor={FORM_PLACEHOLDER_COLOR}
        value={query}
        onFocus={() => setShowSuggestions(true)}
        onChangeText={(text) => {
          setQuery(text);
          setShowSuggestions(true);
        }}
      />

      {showSuggestions ? (
        <View style={styles.autocompleteResults}>
          {suggestions.length > 0 ? (
            suggestions.map((student) => (
              <TouchableOpacity
                key={student.id}
                style={styles.autocompleteItem}
                onPress={() => handleSelect(student)}
              >
                <Text style={styles.autocompleteName}>{getStudentFullName(student)}</Text>
                <Text style={styles.autocompleteMeta}>{student.id} • {getClassroomName(student)}</Text>
              </TouchableOpacity>
            ))
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
            name="AttendanceRegister"
            component={AttendanceRegisterScreen}
            options={{ title: 'Attendance Register' }}
          />
          <Stack.Screen
            name="AttendanceClassFolder"
            component={AttendanceClassFolderScreen}
            options={({ route }) => ({ title: route.params?.className || 'Attendance Folder' })}
          />
          <Stack.Screen
            name="IncidentRegister"
            component={IncidentRegisterScreen}
            options={{ title: 'Incident Register' }}
          />
          <Stack.Screen
            name="MedicineAdministration"
            component={MedicineAdministrationScreen}
            options={{ title: 'Medicine Log' }}
          />
          <Stack.Screen
            name="ComplianceReports"
            component={ComplianceReportsScreen}
            options={{ title: 'Compliance PDF Export' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </AccessContext.Provider>
  );
}

function HomeScreen({ navigation, onLogout, loginIdentity }) {
  const accessProfile = useAccessProfile();
  const roleLabel = formatRoleLabel(accessProfile.role);
  const canEditStudents = hasPermission(accessProfile, 'canEditStudents');
  const canManageUsers = hasPermission(accessProfile, 'canManageUsers');
  const canTakeAttendance = hasPermission(accessProfile, 'canTakeAttendance');
  const canLogIncidents = hasPermission(accessProfile, 'canLogIncidents');
  const canLogMedicine = hasPermission(accessProfile, 'canLogMedicine');
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
          Logged in as {loginIdentity || 'Staff Member'} • {roleLabel} access. Student editing is {canEditStudents ? 'enabled' : 'view-only'} for this account.
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Access is tied to the signed-in Firebase user. You can change `role` or `permissions` later in Firestore under the `users` collection.</Text>
        </View>

        {canManageUsers ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('ManageUsers')}
          >
            <Text style={styles.moduleTitle}>Staff Access</Text>
            <Text style={styles.moduleSubtitle}>Principal-only user roles, permissions, and account access control</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.moduleCard}
          onPress={() => navigation.navigate('StudentDirectory')}
        >
          <Text style={styles.moduleTitle}>Students</Text>
          <Text style={styles.moduleSubtitle}>Emergency profiles, contacts, and medical information</Text>
        </TouchableOpacity>

        {canTakeAttendance ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('AttendanceRegister')}
          >
            <Text style={styles.moduleTitle}>Digital Attendance Register</Text>
            <Text style={styles.moduleSubtitle}>All learners default to Present. Mark Absent or Late only when needed.</Text>
          </TouchableOpacity>
        ) : null}

        {canLogIncidents ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('IncidentRegister')}
          >
            <Text style={styles.moduleTitle}>Incident / Accident Register</Text>
            <Text style={styles.moduleSubtitle}>Capture legally compliant, read-only incident records.</Text>
          </TouchableOpacity>
        ) : null}

        {canLogMedicine ? (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigation.navigate('MedicineAdministration')}
          >
            <Text style={styles.moduleTitle}>Medicine Administration Log</Text>
            <Text style={styles.moduleSubtitle}>Record medication, dosage, staff member, and allergy warnings.</Text>
          </TouchableOpacity>
        ) : null}

        {canExportReports ? (
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
      const data = await fetchUserAccessProfiles();
      setUserProfiles(Array.isArray(data) ? data : []);
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

            {savingUid === userProfile.uid ? <Text style={styles.statusText}>Saving access changes...</Text> : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StudentDirectoryScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const canEditStudents = hasPermission(accessProfile, 'canEditStudents');
  const [students, setStudents] = useState([]);
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

  const groupedStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filteredStudents = students.filter((student) => {
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
  }, [students, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screenContainer}>
        <Text style={styles.title}>Emergency Info</Text>
        <Text style={styles.subtitle}>Student Directory by Class</Text>

        {canEditStudents ? (
          <TouchableOpacity
            style={styles.addStudentButton}
            onPress={() => navigation.navigate('StudentForm', { mode: 'add' })}
          >
            <Text style={styles.addStudentButtonText}>+ Add Student</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>View-only student access: only principal/admin users can add or edit learners.</Text>
          </View>
        )}

        <TextInput
          style={styles.searchInput}
          placeholder="Search any learner, ID, or class"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {loading ? <Text style={styles.statusText}>Loading students...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <ScrollView contentContainerStyle={styles.listContent}>
          {!loading && !errorMessage && groupedStudents.length === 0 ? (
            <Text style={styles.statusText}>No learners found for this search.</Text>
          ) : groupedStudents.map((group) => (
            <TouchableOpacity
              key={group.className}
              style={styles.moduleCard}
              onPress={() => navigation.navigate('StudentClassFolder', { className: group.className })}
            >
              <View style={styles.folderHeaderRow}>
                <View style={styles.folderTextWrap}>
                  <Text style={styles.moduleTitle}>📁 {group.className}</Text>
                  <Text style={styles.moduleSubtitle}>{group.learners.length} learners • Tap to open</Text>
                </View>
                <Text style={styles.folderToggleText}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function StudentClassFolderScreen({ route, navigation }) {
  const className = route.params?.className || 'Class Folder';
  const [students, setStudents] = useState([]);
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

  const visibleStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return students.filter((student) => {
      const matchesClass = getClassroomName(student) === className;
      const studentName = getStudentFullName(student).toLowerCase();
      const studentId = String(student.id || '').toLowerCase();
      return matchesClass && (!query || studentName.includes(query) || studentId.includes(query));
    });
  }, [students, searchQuery, className]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.title}>📁 {className}</Text>
        <Text style={styles.subtitle}>Students in this class</Text>

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

        {visibleStudents.map((student) => (
          <TouchableOpacity
            key={student.id}
            style={styles.studentItem}
            onPress={() => navigation.navigate('EmergencyProfile', { student })}
          >
            <View>
              <Text style={styles.studentName}>{getStudentFullName(student)}</Text>
              <Text style={styles.studentClassText}>{student.id} • {getClassroomName(student)}</Text>
              <Text style={styles.tapHint}>Tap for emergency information</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmergencyProfileScreen({ route, navigation }) {
  const accessProfile = useAccessProfile();
  const canEditStudents = hasPermission(accessProfile, 'canEditStudents');
  const { student } = route.params;
  const [isMedicalAidVisible, setIsMedicalAidVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const emergencyContacts = Array.isArray(student.emergencyContacts) ? student.emergencyContacts : [];
  const allergies = String(student.allergies || '').trim().toLowerCase();
  const hasCriticalAllergy = allergies && allergies !== 'none' && allergies !== 'no known allergies';

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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.profileName}>{getStudentFullName(student)}</Text>

        {canEditStudents ? (
          <TouchableOpacity
            style={styles.editStudentButton}
            onPress={() => navigation.navigate('StudentForm', { mode: 'edit', student })}
          >
            <Text style={styles.editStudentButtonText}>Edit Student</Text>
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
                <Text style={styles.moduleTitle}>📁 {group.className}</Text>
                <Text style={styles.moduleSubtitle}>{group.learners.length} learners • Tap to open</Text>
              </View>
              <Text style={styles.folderToggleText}>›</Text>
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
        <Text style={styles.title}>📁 {className}</Text>
        <Text style={styles.subtitle}>Attendance for {registerDate}</Text>

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
              </View>
              <View style={[styles.statusBadge, statusStyleFor(entry.status)]}>
                <Text style={styles.statusBadgeText}>{entry.status}</Text>
              </View>
            </View>

            <TextInput
              style={[styles.formInput, styles.reasonInput]}
              placeholder="Reason for absence or late note"
              placeholderTextColor={FORM_PLACEHOLDER_COLOR}
              value={notes[entry.studentId] ?? ''}
              onChangeText={(text) => setNotes((currentNotes) => ({
                ...currentNotes,
                [entry.studentId]: text,
              }))}
            />

            <View style={styles.actionRow}>
              {['Present', 'Late', 'Absent'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusActionButton,
                    entry.status === status && styles.statusActionButtonSelected,
                  ]}
                  onPress={() => handleStatusUpdate(entry, status)}
                  disabled={savingStudentId === entry.studentId || !canTakeAttendance}
                >
                  <Text style={[styles.statusActionButtonText, entry.status === status && styles.selectedActionText]}>{status}</Text>
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

function ComplianceReportsScreen({ navigation }) {
  const accessProfile = useAccessProfile();
  const canExportReports = hasPermission(accessProfile, 'canExportReports');
  const [schoolName, setSchoolName] = useState(DEFAULT_SCHOOL_NAME);
  const [startDate, setStartDate] = useState(TODAY);
  const [endDate, setEndDate] = useState(TODAY);

  useEffect(() => {
    if (!canExportReports) {
      Alert.alert('Access Restricted', 'Your account does not have permission to open Reports.');
      navigation.goBack();
    }
  }, [canExportReports, navigation]);

  const handleExport = async () => {
    if (!startDate.trim() || !endDate.trim()) {
      Alert.alert('Missing Dates', 'Please enter both start and end dates.');
      return;
    }

    if (startDate > endDate) {
      Alert.alert('Date Range Error', 'Start date must be before or equal to end date.');
      return;
    }

    const url = `${API_BASE_URL}/exports/compliance-report?schoolName=${encodeURIComponent(
      schoolName.trim() || DEFAULT_SCHOOL_NAME,
    )}&startDate=${encodeURIComponent(startDate.trim())}&endDate=${encodeURIComponent(endDate.trim())}`;

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
          <Text style={styles.infoText}>The PDF includes School Name, Date Range, attendance, incidents, and medicine logs.</Text>
        </View>

        <TextInput
          style={styles.formInput}
          placeholder="School Name"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={schoolName}
          onChangeText={setSchoolName}
        />
        <TextInput
          style={styles.formInput}
          placeholder="Start Date (YYYY-MM-DD)"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={startDate}
          onChangeText={setStartDate}
        />
        <TextInput
          style={styles.formInput}
          placeholder="End Date (YYYY-MM-DD)"
          placeholderTextColor={FORM_PLACEHOLDER_COLOR}
          value={endDate}
          onChangeText={setEndDate}
        />

        <TouchableOpacity style={styles.reportButton} onPress={handleExport}>
          <Text style={styles.saveStudentButtonText}>Open PDF Export</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function StudentFormScreen({ navigation, route }) {
  const accessProfile = useAccessProfile();
  const canEditStudents = hasPermission(accessProfile, 'canEditStudents');
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

  const handleSubmit = async () => {
    if (!canEditStudents) {
      Alert.alert('Access Restricted', 'Your account can view student details but cannot add or edit learners.');
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
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      className: className.trim() || CLASSROOM_OPTIONS[1],
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
        <Text style={styles.formTitle}>{mode === 'edit' ? 'Edit Student Info' : 'Add New Student'}</Text>
        {!canEditStudents ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>This account has view-only student access. Ask a principal/admin account to make changes.</Text>
          </View>
        ) : null}

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
          style={[styles.saveStudentButton, (isSaving || !canEditStudents) && styles.saveStudentButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving || !canEditStudents}
        >
          <Text style={styles.saveStudentButtonText}>
            {!canEditStudents ? 'View-only student access' : isSaving ? 'Saving...' : 'Save Student'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loginScreenContainer: {
    flex: 1,
    backgroundColor: '#F4F7FB',
    justifyContent: 'center',
    padding: 20,
  },
  loginCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#D9E2EC',
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#102A43',
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 15,
    color: '#486581',
    marginBottom: 14,
    lineHeight: 20,
  },
  loginButton: {
    marginTop: 4,
    backgroundColor: '#126782',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 13,
  },
  loginHint: {
    marginTop: 12,
    color: '#486581',
    textAlign: 'center',
    fontSize: 13,
  },
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  screenContainer: {
    flex: 1,
    padding: 20,
  },
  formContainer: {
    padding: 20,
    paddingBottom: 30,
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
    backgroundColor: '#E4E7EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  logoutButtonText: {
    color: '#102A43',
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#102A43',
  },
  subtitle: {
    fontSize: 16,
    color: '#243B53',
    marginBottom: 8,
  },
  helperText: {
    color: '#486581',
    marginBottom: 12,
    lineHeight: 20,
  },
  addStudentButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0B7285',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  addStudentButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  moduleCard: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D9E2EC',
  },
  moduleTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102A43',
    marginBottom: 4,
  },
  moduleSubtitle: {
    color: '#486581',
    fontSize: 14,
    fontWeight: '500',
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
    fontSize: 28,
    fontWeight: '800',
    color: '#126782',
  },
  folderContentCard: {
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BCCCDC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 14,
  },
  classSectionCard: {
    backgroundColor: '#F8FBFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D9E2EC',
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
    fontWeight: '800',
    color: '#102A43',
  },
  classCountText: {
    color: '#486581',
    fontWeight: '700',
  },
  studentItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D9E2EC',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    marginBottom: 12,
  },
  studentName: {
    fontSize: 18,
    color: '#102A43',
    fontWeight: '700',
  },
  studentClassText: {
    marginTop: 4,
    color: '#0B7285',
    fontWeight: '700',
  },
  tapHint: {
    marginTop: 5,
    color: '#486581',
    fontWeight: '600',
  },
  statusText: {
    color: '#243B53',
    marginBottom: 10,
  },
  errorText: {
    color: '#B91C1C',
    marginBottom: 10,
    fontWeight: '600',
  },
  profileName: {
    fontSize: 29,
    color: '#102A43',
    fontWeight: '800',
    marginBottom: 10,
  },
  editStudentButton: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    backgroundColor: '#4C6EF5',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  editStudentButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 10,
    color: '#102A43',
  },
  contactButton: {
    backgroundColor: '#126782',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  doctorButton: {
    backgroundColor: '#2F855A',
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
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
    fontSize: 16,
    color: '#102A43',
    marginBottom: 7,
  },
  vaultToggleButton: {
    marginTop: 10,
    backgroundColor: '#334E68',
    borderRadius: 10,
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
    borderRadius: 12,
    padding: 18,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102A43',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#334E68',
    marginBottom: 12,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: '#BCCCDC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalButtonSecondary: {
    backgroundColor: '#E4E7EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  modalButtonSecondaryText: {
    color: '#102A43',
    fontWeight: '700',
  },
  modalButtonPrimary: {
    backgroundColor: '#126782',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  modalButtonPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  formTitle: {
    fontSize: 24,
    color: '#102A43',
    fontWeight: '800',
    marginBottom: 14,
  },
  formSectionLabel: {
    color: '#102A43',
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BCCCDC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    fontSize: 15,
  },
  reasonInput: {
    minHeight: 48,
    textAlignVertical: 'top',
  },
  saveStudentButton: {
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: '#0B7285',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 13,
  },
  saveStudentButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveStudentButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    borderRadius: 999,
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
    fontWeight: '700',
    color: '#102A43',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusActionButton: {
    backgroundColor: '#E4E7EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statusActionButtonSelected: {
    backgroundColor: '#126782',
  },
  statusActionButtonText: {
    color: '#102A43',
    fontWeight: '700',
  },
  chipContainer: {
    paddingBottom: 10,
    gap: 8,
  },
  chipButton: {
    backgroundColor: '#E4E7EB',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  chipButtonSelected: {
    backgroundColor: '#126782',
  },
  chipButtonText: {
    color: '#102A43',
    fontWeight: '600',
  },
  selectedActionText: {
    color: '#FFFFFF',
  },
  autocompleteContainer: {
    marginBottom: 10,
  },
  autocompleteResults: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E2EC',
    borderRadius: 10,
    marginTop: -4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  autocompleteItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  autocompleteName: {
    color: '#102A43',
    fontWeight: '700',
  },
  autocompleteMeta: {
    color: '#486581',
    marginTop: 2,
    fontSize: 12,
  },
  autocompleteEmpty: {
    color: '#486581',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectedLearnerText: {
    color: '#486581',
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
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    marginBottom: 10,
  },
  timelineMeta: {
    color: '#486581',
    marginTop: 4,
    marginBottom: 8,
  },
  timelineText: {
    color: '#102A43',
    marginBottom: 6,
    lineHeight: 20,
  },
  lockText: {
    color: '#7C2D12',
    fontWeight: '700',
    marginTop: 6,
  },
  infoBox: {
    backgroundColor: '#E8F1FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  infoText: {
    color: '#1D4ED8',
    lineHeight: 20,
  },
  reportButton: {
    marginTop: 8,
    backgroundColor: '#4C6EF5',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 13,
  },
});
