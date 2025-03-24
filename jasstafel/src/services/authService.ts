import { 
  auth, 
  db,
  signInWithEmailAndPassword, 
  signInWithGoogle,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  isLocalDevelopment,
  isOfflineMode,
  isFirebaseReady,
  useLocalAuth,
  doc, 
  getDoc, 
  setDoc,
  serverTimestamp
} from './firebaseInit';
import { User, UserCredential } from 'firebase/auth';
import { AuthUser, FirestoreUser } from '../types/jass';

/**
 * Helfer-Funktion zum Mapping eines Firebase-Benutzers zu unserem AuthUser-Format
 */
export const mapUserToAuthUser = (user: User): AuthUser => {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    isAnonymous: user.isAnonymous,
    metadata: {
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime
    }
  };
};

/**
 * Erstellt einen Mock-Benutzer für lokale Entwicklung
 */
const createMockAuthUser = (email: string, displayName?: string): AuthUser => {
  const uid = `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  return {
    uid,
    email,
    displayName: displayName || email.split('@')[0],
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString()
    }
  };
};

// Hilfsfunktion für lokale Entwicklung
const isDevelopment = () => {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost';
};

// Lokaler Benutzer für Entwicklungszwecke
const LOCAL_DEV_USER: AuthUser = {
  uid: 'local-dev-user',
  email: 'dev@example.com',
  displayName: 'Lokaler Entwicklungsbenutzer',
  photoURL: null,
  emailVerified: true,
  isAnonymous: false,
  metadata: {
    creationTime: new Date().toISOString(),
    lastSignInTime: new Date().toISOString()
  }
};

/**
 * Benutzer mit E-Mail und Passwort anmelden
 */
export const loginWithEmail = async (email: string, password: string): Promise<AuthUser> => {
  // Prüfen, ob wir lokale Auth oder Offline-Modus verwenden sollen
  if (useLocalAuth() || isOfflineMode() || !isFirebaseReady) {
    console.log('Lokale Authentifizierung oder Offline-Modus: Verwende lokale Anmeldung');
    return createMockAuthUser(email);
  }

  try {
    // Normale Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const authUser = mapUserToAuthUser(userCredential.user);
    
    // Wenn wir hierher kommen, speichern wir, dass die API nicht blockiert ist
    sessionStorage.removeItem('firebase-auth-blocked');
    
    // Überprüfen, ob der Benutzer ein Firestore-Dokument hat
    const userDoc = await getUserDocument(userCredential.user.uid);
    if (!userDoc) {
      // Erstellen des Benutzer-Dokuments, wenn es nicht existiert
      await createUserDocument(userCredential.user);
    }
    
    return authUser;
  } catch (error: any) {
    console.error('Fehler bei der Anmeldung:', error);
    
    // Verbesserte Fehlerbehandlung
    if (error.code === 'auth/invalid-api-key' || 
        error.code === 'auth/network-request-failed' ||
        error.code?.includes('auth/requests-to-this-api')) {
      // API-Schlüssel ist ungültig oder nicht autorisiert
      sessionStorage.setItem('firebase-auth-blocked', 'true');
      throw new Error('Firebase API blockiert. Bitte verwende den Offline-Modus oder lokale Authentifizierung.');
    } else if (error.code === 'auth/user-not-found' || 
               error.code === 'auth/wrong-password') {
      throw new Error('E-Mail oder Passwort ungültig.');
    } else {
      throw error;
    }
  }
};

/**
 * Mit Google anmelden
 */
export const loginWithGoogle = async (): Promise<AuthUser> => {
  // Prüfen, ob wir lokale Auth oder Offline-Modus verwenden sollen
  if (useLocalAuth() || isOfflineMode() || !isFirebaseReady) {
    console.log('Lokale Authentifizierung: Simuliere Google-Anmeldung');
    return createMockAuthUser('google-user@example.com', 'Google User');
  }

  try {
    const user = await signInWithGoogle();
    
    // Wenn wir hierher kommen, speichern wir, dass die API nicht blockiert ist
    sessionStorage.removeItem('firebase-auth-blocked');
    
    // Prüfen, ob der Benutzer bereits ein Firestore-Dokument hat
    const userDoc = await getUserDocument(user.uid);
    if (!userDoc) {
      // Erstellen des Benutzer-Dokuments, wenn es nicht existiert
      await createUserDocument(user);
    }
    
    return mapUserToAuthUser(user);
  } catch (error: any) {
    console.error('Fehler bei der Google-Anmeldung:', error);
    
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Anmeldungsvorgang wurde abgebrochen.');
    } else if (error.code === 'auth/popup-blocked') {
      throw new Error('Das Popup wurde vom Browser blockiert. Bitte erlaube Popups für diese Seite.');
    } else if (error.code === 'auth/invalid-api-key' || 
              error.code === 'auth/network-request-failed' ||
              error.code?.includes('auth/requests-to-this-api')) {
      // API-Schlüssel ist ungültig oder nicht autorisiert
      sessionStorage.setItem('firebase-auth-blocked', 'true');
      throw new Error('Firebase API blockiert. Bitte verwende den Offline-Modus oder lokale Authentifizierung.');
    } else {
      throw error;
    }
  }
};

/**
 * Neuen Benutzer registrieren
 */
export const registerWithEmail = async (
  email: string, 
  password: string, 
  displayName?: string
): Promise<AuthUser> => {
  // Prüfen, ob wir lokale Auth oder Offline-Modus verwenden sollen
  if (useLocalAuth() || isOfflineMode() || !isFirebaseReady) {
    console.log('Lokale Authentifizierung oder Offline-Modus: Verwende lokale Registrierung');
    return createMockAuthUser(email, displayName);
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Display-Name setzen, falls angegeben
    if (displayName) {
      await updateProfile(user, { displayName });
    }
    
    // Benutzer-Dokument in Firestore erstellen
    await createUserDocument(user);
    
    return mapUserToAuthUser(user);
  } catch (error: any) {
    console.error('Fehler bei der Registrierung:', error);
    
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('Diese E-Mail-Adresse wird bereits verwendet.');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Ungültige E-Mail-Adresse.');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Das Passwort ist zu schwach. Bitte wähle ein stärkeres Passwort.');
    } else if (error.code === 'auth/invalid-api-key' || 
              error.code === 'auth/network-request-failed' ||
              error.code?.includes('auth/requests-to-this-api')) {
      // API-Schlüssel ist ungültig oder nicht autorisiert
      sessionStorage.setItem('firebase-auth-blocked', 'true');
      throw new Error('Firebase API blockiert. Bitte verwende den Offline-Modus oder lokale Authentifizierung.');
    } else {
      throw error;
    }
  }
};

/**
 * Abmelden
 */
export const logout = async (): Promise<void> => {
  // Im Offline-Modus machen wir nichts (der Status wird vom Store selbst verwaltet)
  if (isOfflineMode() || !isFirebaseReady) {
    console.log('Offline-Modus: Kein Firebase-Logout notwendig');
    return;
  }

  try {
    await auth.signOut();
  } catch (error) {
    console.error('Fehler beim Abmelden:', error);
    throw error;
  }
};

/**
 * Passwort zurücksetzen
 */
export const resetPassword = async (email: string): Promise<void> => {
  // Prüfen, ob wir lokale Auth oder Offline-Modus verwenden sollen
  if (useLocalAuth() || isOfflineMode() || !isFirebaseReady) {
    console.log('Lokale Authentifizierung oder Offline-Modus: Passwortwiederherstellung simuliert');
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error('Fehler beim Zurücksetzen des Passworts:', error);
    
    if (error.code === 'auth/user-not-found') {
      throw new Error('Kein Benutzer mit dieser E-Mail-Adresse gefunden.');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Ungültige E-Mail-Adresse.');
    } else if (error.code === 'auth/invalid-api-key' || 
               error.code === 'auth/network-request-failed' ||
               error.code?.includes('auth/requests-to-this-api')) {
      // API-Schlüssel ist ungültig oder nicht autorisiert
      sessionStorage.setItem('firebase-auth-blocked', 'true');
      throw new Error('Firebase API blockiert. Bitte verwende den Offline-Modus oder lokale Authentifizierung.');
    } else {
      throw error;
    }
  }
};

/**
 * Ruft das Benutzer-Dokument aus Firestore ab
 */
export const getUserDocument = async (uid: string): Promise<FirestoreUser | null> => {
  // Prüfen, ob wir lokale Auth oder Offline-Modus verwenden sollen
  if (useLocalAuth() || isOfflineMode() || !isFirebaseReady) {
    console.log('Lokale Authentifizierung oder Offline-Modus: Simuliere Benutzer-Dokument');
    return {
      uid,
      email: 'user@example.com',
      displayName: 'Lokaler Benutzer',
      photoURL: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roles: ['user'],
      preferences: {
        theme: 'light',
        notifications: true
      }
    };
  }

  try {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      return userDoc.data() as FirestoreUser;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Fehler beim Abrufen des Benutzer-Dokuments:', error);
    return null;
  }
};

/**
 * Erstellt ein Benutzer-Dokument in Firestore
 */
export const createUserDocument = async (user: User): Promise<void> => {
  // Prüfen, ob wir lokale Auth oder Offline-Modus verwenden sollen
  if (useLocalAuth() || isOfflineMode() || !isFirebaseReady) {
    console.log('Lokale Authentifizierung oder Offline-Modus: Simuliere Erstellung des Benutzer-Dokuments');
    return;
  }

  try {
    const userDocRef = doc(db, 'users', user.uid);
    
    // Benutzer-Daten für Firestore vorbereiten
    const userData: FirestoreUser = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || '',
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      roles: ['user'],
      preferences: {
        theme: 'light',
        notifications: true
      }
    };
    
    await setDoc(userDocRef, userData);
  } catch (error) {
    console.error('Fehler beim Erstellen des Benutzer-Dokuments:', error);
    // Hier werfen wir keinen Fehler, da dies nicht kritisch für die Anmeldung ist
  }
}; 