import React, { useMemo, useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Change this base URL to your Flask server address when testing on device/emulator.
const API_BASE_URL = 'http://172.16.1.103:5000';
const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="StudentDirectory"
        screenOptions={{
          headerStyle: { backgroundColor: '#102A43' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen
          name="StudentDirectory"
          component={StudentDirectoryScreen}
          options={{ title: 'Emergency Info Directory' }}
        />
        <Stack.Screen
          name="EmergencyProfile"
          component={EmergencyProfileScreen}
          options={{ title: 'Emergency Profile' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function StudentDirectoryScreen({ navigation }) {
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const fetchStudents = async () => {
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
    };

    fetchStudents();
  }, []);

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

function EmergencyProfileScreen({ route }) {
  const { student } = route.params;
  const [isMedicalAidVisible, setIsMedicalAidVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');

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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contact Details</Text>
          {(student.parentContact || []).map((phoneNumber) => (
            <TouchableOpacity
              key={phoneNumber}
              style={styles.contactButton}
              onPress={() => handleDial(phoneNumber)}
            >
              <Text style={styles.contactButtonText}>Call Parent: {phoneNumber}</Text>
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
    marginBottom: 14,
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
    marginBottom: 14,
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
});
