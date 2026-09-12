import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Without a project the app stays entirely on browser storage, so a checkout
// with no environment variables still runs exactly as the prototype did.
export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

let cached: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;

export function getFirebase() {
  if (!firebaseConfigured)
    throw new Error(
      'Firebase is not configured. Set the VITE_FIREBASE_* environment variables.',
    );
  if (!cached) {
    const app = initializeApp(config);
    cached = {
      app,
      auth: getAuth(app),
      // The persistent cache keeps the farm usable when the connection drops
      // and replays writes once it returns. Multi-tab keeps two open tabs from
      // fighting over that cache.
      db: initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      }),
    };
  }
  return cached;
}
