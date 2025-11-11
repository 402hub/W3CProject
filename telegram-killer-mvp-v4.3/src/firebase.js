/**
 * Firebase Configuration
 * P2P message synchronization
 * 
 * SETUP REQUIRED:
 * 1. Go to https://console.firebase.google.com
 * 2. Create new project
 * 3. Add web app
 * 4. Copy config below
 * 5. Enable Realtime Database in Firebase console
 */

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// TODO: Replace with your actual Firebase config
// Get this from Firebase Console > Project Settings > Your apps
const firebaseConfig = {
  apiKey: "REPLACE WITH REAL",
  authDomain: "REPLACE WITH REAL",
  databaseURL: "REPLACE WITH REAL",
  projectId: "REPLACE WITH REAL",
  storageBucket: "REPLACE WITH REAL",
  messagingSenderId: "REPLACE WITH REAL",
  appId: "REPLACE WITH REAL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get Realtime Database instance
const database = getDatabase(app);

export { database };
export default app;
