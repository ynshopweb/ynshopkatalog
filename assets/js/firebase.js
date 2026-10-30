// =====================================================
//  Konfigurasi Firebase
//  Ganti nilai di bawah dengan config dari:
//  Firebase Console > Project settings > Your apps > Web app
//  (Config web Firebase bukan rahasia; keamanan diatur lewat firestore.rules)
// =====================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export const firebaseConfig = {
  apiKey: 'GANTI_API_KEY',
  authDomain: 'GANTI_PROJECT_ID.firebaseapp.com',
  projectId: 'GANTI_PROJECT_ID',
  storageBucket: 'GANTI_PROJECT_ID.appspot.com',
  messagingSenderId: 'GANTI_SENDER_ID',
  appId: 'GANTI_APP_ID',
};

export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('GANTI');

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Nama koleksi / dokumen
export const PRODUCTS_COL = 'products';
export const SETTINGS_COL = 'settings';
export const SETTINGS_DOC = 'store';

// Re-export fungsi Firebase agar versi SDK cukup diatur di satu tempat
export {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc,
  getDoc, serverTimestamp, arrayUnion, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
