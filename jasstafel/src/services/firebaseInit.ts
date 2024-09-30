import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  sendPasswordResetEmail,
  User
} from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

// Firebase-Konfiguration aus der .env-Datei
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Überprüfen, ob die Firebase-Konfiguration vollständig ist
if (Object.values(firebaseConfig).some(value => value === undefined)) {
  console.error('Firebase configuration is incomplete. Please check your .env file.');
  throw new Error('Firebase configuration is incomplete');
}

// Initialisiere Firebase
const app = initializeApp(firebaseConfig);

// Analytics und Auth initialisieren
const analytics = getAnalytics(app);
const auth = getAuth(app);

// Funktionen zum Registrieren, Anmelden und Zurücksetzen des Passworts

const registerWithEmailAndPassword = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    return userCredential.user;
  } catch (error) {
    console.error('Error during registration:', error);
    throw error;
  }
};

const resetPassword = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Error resetting password:', error);
    throw error;
  }
};

const signInWithGoogle = async (): Promise<User> => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

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

export const firebaseApp = app;