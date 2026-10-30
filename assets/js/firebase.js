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
  apiKey: 'AIzaSyBxPx0_n0tkt5l90-fStwyDKWaLRrPpKIs',
  authDomain: 'katalogynshop.firebaseapp.com',
  projectId: 'katalogynshop',
  storageBucket: 'katalogynshop.firebasestorage.app',
  messagingSenderId: '84025262597',
  appId: '1:84025262597:web:2b2f4474ad31fd26fe126c',
  measurementId: 'G-DBTHR4JMNW',
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
