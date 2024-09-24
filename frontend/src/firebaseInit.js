import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  sendPasswordResetEmail
} from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

// Firebase-Konfiguration aus der .env-Datei
const firebaseConfig = {
  apiKey: process.env.VUE_APP_FIREBASE_API_KEY,
  authDomain: process.env.VUE_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VUE_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VUE_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VUE_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VUE_APP_FIREBASE_APP_ID,
  measurementId: process.env.VUE_APP_FIREBASE_MEASUREMENT_ID
};

// Überprüfen, ob die Firebase-Konfiguration vollständig ist
if (Object.values(firebaseConfig).some(value => value === undefined)) {
  console.error('Firebase configuration is incomplete. Please check your .env file.');
  throw new Error('Firebase configuration is incomplete');
}

// Sensible Informationen nicht mehr im Log ausgeben
console.log("Firebase initialized successfully.");

// Initialisiere Firebase
const app = initializeApp(firebaseConfig);

// Analytics und Auth initialisieren
const analytics = getAnalytics(app);
const auth = getAuth(app);

// Funktionen zum Registrieren, Anmelden und Zurücksetzen des Passworts

/**
 * Registriert einen neuen Benutzer mit E-Mail und Passwort und sendet eine Bestätigungs-E-Mail.
 * @param {string} email - Die E-Mail-Adresse des Benutzers.
 * @param {string} password - Das Passwort des Benutzers.
 * @returns {object} - Das Benutzerobjekt nach erfolgreicher Registrierung.
 */
const registerWithEmailAndPassword = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    return userCredential.user;
  } catch (error) {
    console.error("Error during registration:", error);
    throw error;
  }
};

/**
 * Sendet eine E-Mail zum Zurücksetzen des Passworts an den angegebenen Benutzer.
 * @param {string} email - Die E-Mail-Adresse des Benutzers.
 */
const resetPassword = async (email) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
};

/**
 * Meldet den Benutzer mit Google an.
 * @returns {object} - Das Benutzerobjekt nach erfolgreichem Google-Login.
 */
const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error during sign-in:", error);
    throw error;
  }
};

// Exporte der wichtigsten Funktionen und Objekte für die Verwendung in der App
export { 
  auth, 
  analytics, 
  app, 
  registerWithEmailAndPassword, 
  signInWithEmailAndPassword,
  resetPassword, 
  signInWithGoogle,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  sendPasswordResetEmail
};