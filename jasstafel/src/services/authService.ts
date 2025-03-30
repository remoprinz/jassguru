import { 
  auth, 
  db,
  signInWithEmailAndPassword, 
  signInWithGoogle,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  isFirebaseReady,
  doc, 
  getDoc, 
  setDoc,
  serverTimestamp,
  sendEmailVerification,
  getAuth
} from './firebaseInit';
import { User } from 'firebase/auth';
import { AuthUser, FirestoreUser } from '../types/jass';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { updateDoc } from "firebase/firestore";

// Type-Definition für Firebase Auth Fehler
interface FirebaseAuthError extends Error {
  code?: string;
  message: string;
}

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
      const errorCode = (error as FirebaseAuthError).code;
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
      const errorCode = (error as FirebaseAuthError).code;
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
      const errorCode = (error as FirebaseAuthError).code;
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
      const errorCode = (error as FirebaseAuthError).code;
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

/**
 * Lädt ein neues Profilbild hoch, löscht das alte (falls vorhanden) und aktualisiert Firestore.
 * @param file Die hochzuladende Bilddatei.
 * @param userId Die ID des Benutzers.
 * @returns Promise<AuthUser> Das aktualisierte AuthUser Objekt.
 */
export const uploadProfilePicture = async (file: File, userId: string): Promise<AuthUser> => {
  if (!db) throw new Error("Firebase Database nicht initialisiert.");
  const storage = getStorage();
  if (!storage) throw new Error("Firebase Storage nicht initialisiert.");
  const authInstance = getAuth(); // Holen Sie sich die Auth-Instanz

  // 1. Alten Pfad ermitteln und altes Bild löschen (optional, aber gut für Speicherplatz)
  const userDocRef = doc(db, 'users', userId);
  try {
    const userDocSnap = await getDoc(userDocRef);
    console.log("User document loaded:", userDocSnap.exists() ? userDocSnap.data() : "No document");
    if (userDocSnap.exists()) {
      const oldPhotoURL = userDocSnap.data()?.photoURL;
      if (oldPhotoURL) {
        // Versuchen, die Referenz aus der URL zu extrahieren und das alte Bild zu löschen
        try {
          const oldImageRef = ref(storage, oldPhotoURL);
          await deleteObject(oldImageRef);
          console.log("Altes Profilbild gelöscht:", oldPhotoURL);
        } catch (deleteError) {
          // Fehler beim Löschen des alten Bildes ist nicht kritisch, kann aber geloggt werden
          console.warn("Konnte altes Profilbild nicht löschen:", deleteError);
        }
      }
    }
  } catch (error) {
    console.error("Fehler beim Abrufen des Benutzerdokuments zum Löschen des alten Bildes:", error);
    // Fortfahren, auch wenn das alte Bild nicht gelöscht werden konnte
  }

  // 2. Neuen Pfad definieren und Bild hochladen
  const filePath = `profileImages/${userId}/${file.name}`;
  const storageRef = ref(storage, filePath);

  try {
    console.log(`Lade ${file.name} (${(file.size / 1024).toFixed(2)} KB) hoch nach ${filePath}...`);
    
    // Überprüfe Dateiformat
    const fileType = file.type.toLowerCase();
    if (!fileType.startsWith('image/')) {
      throw new Error("Die Datei ist kein Bild. Unterstützte Formate: JPEG, PNG, GIF.");
    }
    
    // Überprüfe Dateigröße (5MB Limit)
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > 5) {
      throw new Error(`Die Datei ist zu groß (${fileSizeInMB.toFixed(2)} MB). Maximale Größe: 5 MB.`);
    }

    const uploadResult = await uploadBytes(storageRef, file);
    console.log("Upload erfolgreich:", uploadResult);

    // 3. Download-URL abrufen
    const downloadURL = await getDownloadURL(uploadResult.ref);
    console.log("Download URL:", downloadURL);

    // 4. Firestore aktualisieren
    await updateDoc(userDocRef, {
      photoURL: downloadURL,
      updatedAt: serverTimestamp()
    });
    console.log("Firestore photoURL aktualisiert.");

    // 5. Aktuellen Firebase Auth User holen und neu mappen
    const currentUser = authInstance.currentUser;
    if (!currentUser) {
      throw new Error('Benutzer ist nach dem Upload nicht mehr angemeldet.');
    }
    
    // Bei Bedarf das Auth-Profil aktualisieren
    try {
      await updateProfile(currentUser, { photoURL: downloadURL });
      console.log("Auth-Profil aktualisiert.");
    } catch (profileError) {
      console.warn("Konnte Auth-Profil nicht aktualisieren:", profileError);
      // Nicht kritisch, fortfahren
    }
    
    // Wir mappen den aktuellen Firebase-User mit der neuen URL
    const updatedAuthUser = mapUserToAuthUser(currentUser);
    // Sicherstellen, dass die hochgeladene URL verwendet wird
    updatedAuthUser.photoURL = downloadURL; 

    console.log("AuthService: Gebe aktualisierten AuthUser zurück:", updatedAuthUser);
    return updatedAuthUser;

  } catch (error) {
    console.error("Fehler beim Hochladen des Profilbilds oder Aktualisieren von Firestore:", error);
    
    // Detaillierte Fehlerbehandlung
    if (error instanceof Error) {
      if ('code' in error) {
        const errorCode = (error as FirebaseAuthError).code;
        switch (errorCode) {
          case 'storage/unauthorized':
            throw new Error("Berechtigung fehlt. Stellen Sie sicher, dass Sie eingeloggt sind und die Storage-Regeln korrekt sind.");
          case 'storage/canceled':
            throw new Error("Upload wurde abgebrochen.");
          case 'storage/unknown':
            throw new Error("Storage-Fehler: Bitte überprüfen Sie die Verbindung und Firebase-Konfiguration. Der Bucket muss existieren und korrekt konfiguriert sein (CORS).");
          case 'storage/retry-limit-exceeded':
            throw new Error("Zeitüberschreitung beim Upload. Bitte überprüfen Sie Ihre Internetverbindung.");
          case 'storage/invalid-checksum':
            throw new Error("Die Datei wurde während des Uploads beschädigt. Bitte versuchen Sie es erneut.");
          case 'storage/object-not-found':
            throw new Error("Das Bild konnte nach dem Upload nicht gefunden werden.");
          case 'storage/bucket-not-found':
            throw new Error("Der Firebase Storage Bucket existiert nicht. Bitte überprüfen Sie Ihre Firebase-Konfiguration.");
          case 'storage/quota-exceeded':
            throw new Error("Storage-Kontingent überschritten. Bitte kontaktieren Sie den Administrator.");
          default:
            throw new Error(`Fehler beim Bildupload (${errorCode}): ${error.message}`);
        }
      }
      throw new Error(`Fehler beim Bildupload: ${error.message}`);
    } else {
      throw new Error("Ein unbekannter Fehler ist beim Bildupload aufgetreten. Bitte versuchen Sie es später erneut.");
    }
  }
}; 