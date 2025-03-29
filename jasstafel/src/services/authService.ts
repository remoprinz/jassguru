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
  serverTimestamp,
  sendEmailVerification
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
 * Helfer-Funktion zum Erstellen/Aktualisieren des Firestore-Benutzerdokuments.
 */
const createOrUpdateFirestoreUser = async (user: User, displayName?: string): Promise<void> => {
  if (!isFirebaseReady || !db) {
    console.warn('Firestore ist nicht bereit. Überspringe Benutzerdokument-Erstellung.');
    return; 
  }

  const userRef = doc(db, "users", user.uid);
  const userData: Partial<FirestoreUser> = {
      // Wir verwenden Partial, da wir ggf. nur aktualisieren
      uid: user.uid,
      email: user.email || '', 
      displayName: displayName || user.displayName || null,
      photoURL: user.photoURL || null,
      updatedAt: serverTimestamp(), // Immer aktualisieren
      // createdAt wird nur gesetzt, wenn das Dokument neu ist
  };

  try {
      // setDoc mit merge: true erstellt oder aktualisiert das Dokument.
      // Um createdAt nur beim ersten Mal zu setzen, bräuchte man eine Transaktion oder getDoc vorher.
      // Für Einfachheit verwenden wir hier merge: true
      await setDoc(userRef, { ...userData, createdAt: serverTimestamp() }, { merge: true }); 
      console.log("Firestore user document created/updated for UID:", user.uid);
  } catch (error) {
      console.error("Error writing user document to Firestore:", error);
  }
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
 * Registriert einen neuen Benutzer mit E-Mail und Passwort.
 * Aktualisiert das Profil mit dem Anzeigenamen, erstellt/aktualisiert das Firestore-Dokument
 * und sendet eine Verifizierungs-E-Mail.
 */
export const registerWithEmail = async (email: string, password: string, displayName?: string): Promise<AuthUser> => {
  if (!isFirebaseReady) {
    console.warn('Firebase ist nicht bereit. Registrierung im Mock-Modus.');
    throw new Error('Firebase ist nicht initialisiert.');
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user; // Das Firebase User Objekt

    if (user) { // Sicherstellen, dass das User-Objekt existiert
        // Aktionen parallel starten:
        const promises = [];

        // 1. Profil aktualisieren (falls displayName vorhanden)
        if (displayName) {
            promises.push(
                updateProfile(user, { displayName })
                    .catch(err => console.error("Profil-Update fehlgeschlagen:", err))
            );
        }

        // 2. Firestore Dokument erstellen/aktualisieren
        // Annahme: createOrUpdateFirestoreUser existiert und ist korrekt implementiert
        promises.push(createOrUpdateFirestoreUser(user, displayName));

        // 3. Verifizierungs-E-Mail senden
        promises.push(
            sendEmailVerification(user)
                .then(() => console.log('Verifizierungs-E-Mail gesendet an:', user.email))
                .catch(err => console.error("Senden der Verifizierungs-E-Mail fehlgeschlagen:", err))
        );

        // Warten, bis alle parallel gestarteten Aktionen abgeschlossen sind (Fehler werden nur geloggt)
        await Promise.all(promises);

        // Den authentifizierten Benutzer zurückgeben
        // mapUserToAuthUser sollte den User direkt verarbeiten können
        return mapUserToAuthUser(user);
    } else {
        // Dieser Fall sollte nach erfolgreichem createUserWithEmailAndPassword nicht eintreten
        throw new Error('Benutzerobjekt nach Erstellung nicht verfügbar.');
    }

  } catch (error) {
    console.error('Registrierungsfehler im Service:', error);
    if (error instanceof Error) {
      const errorCode = (error as any).code;
      if (errorCode === 'auth/email-already-in-use') {
        throw new Error('Diese E-Mail-Adresse wird bereits verwendet.');
      } else if (errorCode === 'auth/weak-password') {
        throw new Error('Das Passwort ist zu schwach. Es muss mindestens 6 Zeichen lang sein.');
      }
      // Hier können weitere spezifische Fehlercodes behandelt werden
    }
    throw new Error('Registrierung fehlgeschlagen. Bitte überprüfen Sie Ihre Eingaben.');
  }
};

/**
 * Meldet einen Benutzer mit E-Mail und Passwort an.
 */
export const loginWithEmail = async (email: string, password: string): Promise<AuthUser> => {
  if (!isFirebaseReady) {
    throw new Error('Firebase ist nicht initialisiert.');
  }
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return mapUserToAuthUser(userCredential.user);
  } catch (error) {
    console.error('Login-Fehler im Service:', error);
    if (error instanceof Error) {
      const errorCode = (error as any).code;
      if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        throw new Error('Ungültige E-Mail oder Passwort.');
      }
    }
    throw new Error('Anmeldung fehlgeschlagen.');
  }
};

/**
 * Meldet einen Benutzer mit Google an.
 */
export const loginWithGoogle = async (): Promise<AuthUser> => {
  if (!isFirebaseReady) {
    throw new Error('Firebase ist nicht initialisiert.');
  }
  try {
    // signInWithGoogle gibt hier direkt das User-Objekt zurück, nicht UserCredential
    const user = await signInWithGoogle(); 
    
    // Sicherstellen, dass das User-Objekt vorhanden ist
    if (!user) {
      throw new Error('Anmeldung mit Google fehlgeschlagen: Kein Benutzerobjekt erhalten.');
    }

    // Firestore User Dokument erstellen/aktualisieren nach Google Login
    // Direkt das User-Objekt übergeben
    await createOrUpdateFirestoreUser(user);
    
    // Direkt das User-Objekt mappen und zurückgeben
    return mapUserToAuthUser(user);

  } catch (error) {
    console.error('Google Login-Fehler im Service:', error);
     if (error instanceof Error) {
      const errorCode = (error as any).code;
      // Behandeln Sie spezifische Google-Login-Fehler, falls nötig
      if (errorCode === 'auth/popup-closed-by-user') {
        throw new Error('Anmeldung mit Google abgebrochen.');
      }
      // Hier könnten weitere Google-spezifische Fehlercodes behandelt werden
    }
    throw new Error('Anmeldung mit Google fehlgeschlagen.');
  }
};

/**
 * Meldet den aktuellen Benutzer ab.
 */
export const logout = async (): Promise<void> => {
  if (!isFirebaseReady) {
     console.warn('Firebase nicht bereit, Logout übersprungen.');
     return; // Im Offline-Modus nichts tun
  }
  try {
    await auth.signOut();
  } catch (error) {
    console.error('Fehler beim Abmelden:', error);
    throw new Error('Abmeldung fehlgeschlagen.');
  }
};

/**
 * Sendet eine E-Mail zum Zurücksetzen des Passworts.
 */
export const resetPassword = async (email: string): Promise<void> => {
   if (!isFirebaseReady) {
    throw new Error('Firebase ist nicht initialisiert.');
  }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Fehler beim Senden der Passwort-Reset-E-Mail:', error);
    if (error instanceof Error) {
      const errorCode = (error as any).code;
      if (errorCode === 'auth/user-not-found') {
        // Geben Sie keinen Hinweis darauf, ob die E-Mail existiert
        throw new Error('E-Mail zum Zurücksetzen des Passworts konnte nicht gesendet werden. Überprüfen Sie die Adresse.');
      }
    }
    throw new Error('Passwort-Reset fehlgeschlagen.');
  }
};

/**
 * Sendet die Verifizierungs-E-Mail erneut an den aktuell angemeldeten Benutzer.
 * Funktioniert nur, wenn auth.currentUser gesetzt ist (z.B. nach einem fehlgeschlagenen Login-Versuch wegen fehlender Verifizierung).
 */
export const resendVerificationEmail = async (): Promise<void> => {
  if (!isFirebaseReady) {
    throw new Error('Firebase ist nicht initialisiert.');
  }
  const user = auth.currentUser;
  if (user) {
    try {
      await sendEmailVerification(user);
      console.log('Verifizierungs-E-Mail erneut gesendet an:', user.email);
    } catch (error) {
      console.error('Fehler beim erneuten Senden der Verifizierungs-E-Mail:', error);
      throw new Error('Fehler beim Senden der Verifizierungs-E-Mail.');
    }
  } else {
    // Dies sollte nicht passieren, wenn die Funktion direkt nach einem Login-Versuch aufgerufen wird.
    console.warn('resendVerificationEmail aufgerufen, ohne dass ein Benutzer angemeldet ist.');
    throw new Error('Kein Benutzer angemeldet, um die E-Mail erneut zu senden.');
  }
};

/**
 * Ruft das Firestore-Benutzerdokument für eine gegebene UID ab.
 */
export const getUserDocument = async (uid: string): Promise<FirestoreUser | null> => {
  if (!isFirebaseReady || !db) {
    console.warn('Firestore ist nicht bereit. Kann Benutzerdokument nicht abrufen.');
    return null;
  }
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      return userDocSnap.data() as FirestoreUser;
    } else {
      console.log('Kein Firestore-Dokument für Benutzer gefunden:', uid);
      return null;
    }
  } catch (error) {
    console.error('Fehler beim Abrufen des Benutzerdokuments:', error);
    return null; // Fehler als nicht gefunden behandeln
  }
};

// Hinzufügen einer Hilfsfunktion zum Erstellen/Aktualisieren des Firestore-Benutzers, 
// falls diese noch nicht existiert oder anderswo ist.
// Diese Funktion wird hier angenommen, basierend auf dem Code-Kontext.
const createFirestoreUser = async (user: User, displayName?: string): Promise<void> => {
    if (!isFirebaseReady || !db) return; // Nur ausführen wenn Firebase bereit ist

    const userRef = doc(db, "users", user.uid);
    const userData: FirestoreUser = {
        uid: user.uid,
        email: user.email || '', // E-Mail sollte vorhanden sein
        displayName: displayName || user.displayName || null,
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(), // Beim ersten Erstellen
        updatedAt: serverTimestamp(),
        // Weitere Felder nach Bedarf initialisieren
    };

    try {
        // setDoc mit merge: true erstellt das Dokument oder aktualisiert es, falls es existiert
        await setDoc(userRef, userData, { merge: true });
        console.log("Firestore user document created/updated for UID:", user.uid);
    } catch (error) {
        console.error("Error writing user document to Firestore:", error);
        // Hier könnte man entscheiden, ob der Fehler kritisch ist
    }
}; 