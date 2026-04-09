import { initializeApp } from 'firebase/app';
import { collection, doc, getCountFromServer, getFirestore, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCQcV1urnN1GlsVCOv62XojgFrpRrc34dg',
  authDomain: 'schoolsafetyapp.firebaseapp.com',
  projectId: 'schoolsafetyapp',
  storageBucket: 'schoolsafetyapp.firebasestorage.app',
  messagingSenderId: '303337727685',
  appId: '1:303337727685:web:4b438db6c0ec6d5f96b2ac',
  measurementId: 'G-LVZ6MPRQ06',
};

const TODAY = new Date().toISOString().split('T')[0];
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  return response.json();
}

async function main() {
  const [attendanceData, incidentsData, medicineData] = await Promise.all([
    fetchJson(`http://127.0.0.1:5000/attendance?date=${TODAY}`),
    fetchJson('http://127.0.0.1:5000/incidents'),
    fetchJson('http://127.0.0.1:5000/medicine'),
  ]);

  let attendanceSeeded = 0;
  for (const entry of Array.isArray(attendanceData?.entries) ? attendanceData.entries : []) {
    const id = `${String(entry.date || TODAY)}_${String(entry.studentId || '')}`;
    if (!entry?.studentId) {
      continue;
    }

    await setDoc(doc(db, 'attendance', id), { ...entry, id }, { merge: true });
    attendanceSeeded += 1;
  }

  let incidentsSeeded = 0;
  for (const entry of Array.isArray(incidentsData) ? incidentsData : []) {
    if (!entry?.id) {
      continue;
    }

    await setDoc(doc(db, 'incidents', entry.id), entry, { merge: true });
    incidentsSeeded += 1;
  }

  let medicineSeeded = 0;
  for (const entry of Array.isArray(medicineData) ? medicineData : []) {
    if (!entry?.id) {
      continue;
    }

    await setDoc(doc(db, 'medicine_logs', entry.id), entry, { merge: true });
    medicineSeeded += 1;
  }

  const [studentsCount, attendanceCount, incidentsCount, medicineCount] = await Promise.all([
    getCountFromServer(collection(db, 'students')),
    getCountFromServer(collection(db, 'attendance')),
    getCountFromServer(collection(db, 'incidents')),
    getCountFromServer(collection(db, 'medicine_logs')),
  ]);

  console.log(JSON.stringify({
    seededToday: {
      attendance: attendanceSeeded,
      incidents: incidentsSeeded,
      medicine_logs: medicineSeeded,
    },
    firestoreCounts: {
      students: studentsCount.data().count,
      attendance: attendanceCount.data().count,
      incidents: incidentsCount.data().count,
      medicine_logs: medicineCount.data().count,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
