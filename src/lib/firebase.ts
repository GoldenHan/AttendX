
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Log the config to help debug API key issues.
// This will appear in your browser's console and server console (during build/dev).
console.log("Firebase Config being used:", firebaseConfig);

if (!firebaseConfig.apiKey) {
  console.error("Firebase API Key is missing or empty. Make sure NEXT_PUBLIC_FIREBASE_API_KEY is set correctly in your environment variables.");
}
if (!firebaseConfig.authDomain) {
  console.error("Firebase Auth Domain is missing or empty. Make sure NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is set correctly.");
}
if (!firebaseConfig.projectId) {
  console.error("Firebase Project ID is missing or empty. Make sure NEXT_PUBLIC_FIREBASE_PROJECT_ID is set correctly. This is critical for Firestore connectivity.");
}


// Initialize Firebase
let app;
if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
    console.log("Firebase app initialized successfully.");
  } catch (e) {
    console.error("Error initializing Firebase app:", e);
    // Potentially throw the error or handle it to prevent the app from crashing if unrecoverable
    // For now, we'll let it proceed so db and auth might still fail gracefully if app is undefined
  }
} else {
  app = getApp();
  console.log("Existing Firebase app retrieved.");
}

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { app, db, auth, storage };
