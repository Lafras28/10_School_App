# School Safety & Compliance App (South African Preschools)

Starter project to support DSD (Bana Pele) norms and standards with POPIA-aware architecture.

## Tech Stack

- Backend API: Flask (Python)
- Mobile App: React Native with Expo
- Database/Auth: Firebase (Firestore + Firebase Auth)
- Source Control: Git + GitHub

## Initial Project Structure

```text
10_School_App/
  backend/
    app.py
  mobile/
    App.js
  requirements.txt
  README.md
```

## 1) VS Code Setup

1. Install VS Code extensions:
   - Python (Microsoft)
   - Pylance
   - ESLint (optional)
   - Expo Tools (optional)
2. Open this workspace folder in VS Code.
3. Open terminal in VS Code and set up Python backend:

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
pip install -r ..\requirements.txt
python app.py
```

Backend runs on `http://localhost:5000`.

## 2) Test Flask Endpoints

Health check:

```bash
curl http://localhost:5000/health
```

Create incident:

```bash
curl -X POST http://localhost:5000/incident \
  -H "Content-Type: application/json" \
  -d '{
    "schoolId": "ZA-001",
    "reportedBy": "Teacher A",
    "incidentType": "Injury",
    "description": "Minor fall on playground"
  }'
```

## 3) Expo Mobile Setup

1. In terminal:

```bash
cd mobile
npx create-expo-app@latest .
npm install firebase
npm install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
```

2. Keep the generated Expo files and replace `App.js` with the one in this repo.
3. Start Expo:

```bash
npm start
```

4. If you run on a physical phone, update `API_BASE_URL` in `mobile/App.js` to your computer's local network IP, for example:

```js
const API_BASE_URL = 'http://192.168.1.25:5000';
```

5. In Firebase Console:
   - Create a Firebase project.
   - Enable Firestore (production mode with strict rules).
   - Enable Authentication (Email/Password or your preferred provider).
   - Create a Web App config and paste values into `mobile/App.js`.

## 4) POPIA and Security Notes (Initial)

- Do not store sensitive records in local device storage.
- Use Firebase Auth for staff identity and role-based access.
- Use Firestore Security Rules to restrict school-level access.
- Use server timestamps for audit trails.
- Keep API keys and secrets in environment variables where possible.

## Student Data Template (Excel)

- Primary student list source: `Students/students_template.xlsx`
- Teachers can update this Excel file directly with columns:
  id, firstName, lastName, emergencyContact1Name, emergencyContact1Number, emergencyContact2Name, emergencyContact2Number, emergencyContact3Name, emergencyContact3Number, allergies, medicalAidName, medicalAidNumber, doctorContact, medicalPin
- Emergency Contact 1 Name and Number are required.
- Emergency Contacts 2 and 3 are optional.
- Backend endpoint `/students` reads from `.xlsx` first, then falls back to `Students/students_template.csv` if needed.

## 5) GitHub Repository Linking

From project root (`10_School_App`):

```bash
git init
git add .
git commit -m "Initial scaffold: Flask + Expo + Firebase"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Next Recommended Steps

- Add Firebase Admin SDK to `backend/app.py` for verified server-side writes.
- Build principal dashboard for real-time panic notifications.
- Add daily child/staff attendance + ratio calculation endpoint and UI.
- Add CI checks (lint + tests) before production deployment.
