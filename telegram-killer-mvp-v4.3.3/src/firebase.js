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
import { getAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, setPersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getPerformance } from 'firebase/performance';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'REPLACE WITH REAL',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'REPLACE WITH REAL',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'REPLACE WITH REAL',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'REPLACE WITH REAL',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'REPLACE WITH REAL',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'REPLACE WITH REAL',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'REPLACE WITH REAL',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const isValueConfigured = (value) => !!value && !String(value).includes('REPLACE WITH REAL');
const isFirebaseConfigured = Object.keys(firebaseConfig)
  .filter((key) => key !== 'measurementId')
  .every((key) => isValueConfigured(firebaseConfig[key]));

let app = null;
let database = null;
let auth = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  database = getDatabase(app);

  if (typeof window !== 'undefined') {
    auth = getAuth(app);

    setPersistence(auth, indexedDBLocalPersistence)
      .catch(() => setPersistence(auth, browserLocalPersistence))
      .catch(() => setPersistence(auth, inMemoryPersistence))
      .catch((error) => {
        console.warn('⚠️  [FIREBASE] Failed to set persistence mode:', error);
      });

    try {
      getPerformance(app);
      console.log('✅ [FIREBASE] Performance monitoring initialized');
    } catch (perfError) {
      console.warn('⚠️  [FIREBASE] Performance monitoring unavailable:', perfError.message);
    }
  }
} else {
  console.warn('⚠️  [FIREBASE] Skipping Firebase initialization - configuration missing');
}

export { app, auth, database, firebaseConfig, isFirebaseConfigured };
export default app;
