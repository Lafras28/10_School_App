import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Change this base URL to your Flask server address when testing on device/emulator.
const API_BASE_URL = 'http://172.16.1.103:5000';
const Stack = createNativeStackNavigator();
const FORM_PLACEHOLDER_COLOR = '#334E68';

export default function App() {
  return (
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
          component={HomeScreen}
          options={{ title: 'School Safety Modules' }}
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function HomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screenContainer}>
        <Text style={styles.title}>School Safety</Text>
        <Text style={styles.subtitle}>Select a module</Text>

        <TouchableOpacity
          style={styles.moduleCard}
          onPress={() => navigation.navigate('StudentDirectory')}
        >
          <Text style={styles.moduleTitle}>Students</Text>
          <Text style={styles.moduleSubtitle}>Emergency profiles, contacts, and medical info</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function StudentDirectoryScreen({ navigation }) {
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const response = await fetch(`${API_BASE_URL}/students`);
      if (!response.ok) {
        throw new Error('Unable to load student directory.');
      }

      const data = await response.json();
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

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return students;
    }

    return students.filter((student) => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      return fullName.includes(query);
    });
  }, [students, searchQuery]);

  const renderStudentItem = ({ item }) => (
    <TouchableOpacity
      style={styles.studentItem}
      onPress={() => navigation.navigate('EmergencyProfile', { student: item })}
    >
      <View>
        <Text style={styles.studentName}>{item.firstName} {item.lastName}</Text>
        <Text style={styles.tapHint}>Tap for Info</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screenContainer}>
        <Text style={styles.title}>Emergency Info</Text>
        <Text style={styles.subtitle}>Student Directory</Text>

        <TouchableOpacity
          style={styles.addStudentButton}
          onPress={() => navigation.navigate('StudentForm', { mode: 'add' })}
        >
          <Text style={styles.addStudentButtonText}>+ Add Student</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.searchInput}
          placeholder="Search student name"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {loading ? <Text style={styles.statusText}>Loading students...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <FlatList
          data={filteredStudents}
          keyExtractor={(item) => item.id}
          renderItem={renderStudentItem}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </SafeAreaView>
  );
}

function EmergencyProfileScreen({ route, navigation }) {
  const { student } = route.params;
  const [isMedicalAidVisible, setIsMedicalAidVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const emergencyContacts = Array.isArray(student.emergencyContacts) ? student.emergencyContacts : [];

  const hasCriticalAllergy = student.allergies && student.allergies.toLowerCase() !== 'none';

  const handleDial = async (phoneNumber) => {
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
    const pinVerified = pinInput === expectedPin;
    if (!pinVerified) {
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
      <View style={styles.screenContainer}>
        <Text style={styles.profileName}>
          {student.firstName} {student.lastName}
        </Text>

        <TouchableOpacity
          style={styles.editStudentButton}
          onPress={() => navigation.navigate('StudentForm', { mode: 'edit', student })}
        >
          <Text style={styles.editStudentButtonText}>Edit Student</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contact Details</Text>
          {emergencyContacts.map((contact, index) => (
            <TouchableOpacity
              key={`${contact.number || 'contact'}-${index}`}
              style={styles.contactButton}
              onPress={() => handleDial(contact.number)}
            >
              <Text style={styles.contactButtonText}>
                Call {contact.name || `Emergency Contact ${index + 1}`}: {contact.number}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.contactButton, styles.doctorButton]}
            onPress={() => handleDial(student.doctorContact)}
          >
            <Text style={styles.contactButtonText}>Call Doctor: {student.doctorContact}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, hasCriticalAllergy ? styles.allergyAlertCard : styles.noAllergyCard]}>
          <Text style={styles.sectionTitle}>Allergies</Text>
          <Text style={styles.allergyText}>{student.allergies || 'None reported'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Medical Aid Vault</Text>
          <Text style={styles.vaultText}>
            Provider: {isMedicalAidVisible ? student.medicalAidName : '********'}
          </Text>
          <Text style={styles.vaultText}>
            Number: {isMedicalAidVisible ? student.medicalAidNumber : '************'}
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
      </View>
    </SafeAreaView>
  );
}

function StudentFormScreen({ navigation, route }) {
  const mode = route.params?.mode || 'add';
  const initialStudent = route.params?.student;
  const initialEmergencyContacts = Array.isArray(initialStudent?.emergencyContacts)
    ? initialStudent.emergencyContacts
    : [];

  const [firstName, setFirstName] = useState(initialStudent?.firstName || '');
  const [lastName, setLastName] = useState(initialStudent?.lastName || '');
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
      emergencyContacts,
      allergies: allergies.trim() || 'No known allergies',
      medicalAidName: medicalAidName.trim(),
      medicalAidNumber: medicalAidNumber.trim(),
      doctorContact: doctorContact.trim(),
      medicalPin: medicalPin.trim(),
    };

    const endpoint = mode === 'edit'
      ? `${API_BASE_URL}/students/${initialStudent.id}`
      : `${API_BASE_URL}/students`;

    const method = mode === 'edit' ? 'PUT' : 'POST';

    try {
      setIsSaving(true);
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Could not save student.');
      }

      Alert.alert('Saved', mode === 'edit' ? 'Student updated.' : 'Student added.');
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
          style={[styles.saveStudentButton, isSaving && styles.saveStudentButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSaving}
        >
          <Text style={styles.saveStudentButtonText}>{isSaving ? 'Saving...' : 'Save Student'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  screenContainer: {
    flex: 1,
    padding: 20,
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
  studentItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D9E2EC',
  },
  studentName: {
    fontSize: 18,
    color: '#102A43',
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
  formContainer: {
    padding: 20,
    paddingBottom: 30,
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
  saveStudentButton: {
    marginTop: 8,
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
});
