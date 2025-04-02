import { 
  // Firebase App and Auth core methods
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as firebaseUpdateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  sendEmailVerification,
  signOut as firebaseSignOut,
  User as FirebaseAuthUser,
} from 'firebase/auth';
import {
  // Firestore methods
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  FieldValue,
} from 'firebase/firestore';
import { 
  // Firebase Storage methods
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from "firebase/storage"; 
import { auth, db, isFirebaseReady } from './firebaseInit';
import { AuthUser, FirestoreUser } from '../types/jass';

// Type-Definition für Firebase Auth Fehler
interface FirebaseAuthError extends Error {
  code?: string;
  message: string;
}

/**
 * Helper function to map Firebase Auth User to application's AuthUser type.
 * Defined in this file.
 */
export const mapUserToAuthUser = (user: FirebaseAuthUser, firestoreUser?: Partial<FirestoreUser> | null): AuthUser => {
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
    },
    // Füge Felder aus Firestore hinzu, falls vorhanden
    lastActiveGroupId: firestoreUser?.lastActiveGroupId ?? null,
    statusMessage: firestoreUser?.statusMessage ?? null,
  };
};

/**
 * Creates or updates a user document in Firestore.
 * Uses setDoc with merge: true to avoid overwriting existing fields
 * when updating, and ensures timestamps are correctly handled.
 * @param user - The Firebase Auth user object.
 * @param isNewUser - Flag indicating if this is a new user creation.
 */
export const createOrUpdateFirestoreUser = async (user: FirebaseAuthUser, isNewUser: boolean = false): Promise<void> => {
  if (!user || !user.uid) {
    console.error('createOrUpdateFirestoreUser: Invalid Firebase user object provided.');
    throw new Error('Invalid Firebase user data.');
  }

  if (!db) {
    console.error('createOrUpdateFirestoreUser: Firestore instance (db) is not initialized.');
    throw new Error('Firestore not initialized.');
  }

  try {
    const userDocRef = doc(db, 'users', user.uid);

    const userData: Partial<FirestoreUser> & { createdAt?: FieldValue, lastLogin?: FieldValue } = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      lastLogin: serverTimestamp(),
    };

    if (isNewUser) {
      userData.createdAt = serverTimestamp();
      userData.statusMessage = "Grüezi! Ich jasse mit Jassguru.";
      userData.preferences = {
        theme: 'light',
        notifications: true
      };
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { uid, ...dataToSave } = userData;

    await setDoc(userDocRef, dataToSave, { merge: true });
    console.log(`Firestore user document for ${user.uid} ${isNewUser ? 'created' : 'updated'} successfully.`);
  } catch (error) {
    console.error(`Error ${isNewUser ? 'creating' : 'updating'} Firestore user document for ${user.uid}:`, error);
    throw new Error(`Failed to save user data: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Updates specific fields in a user's Firestore document.
 * Ensures forbidden fields like uid, email, createdAt are not updated.
 * Adds a lastUpdated timestamp automatically.
 * @param userId - The ID of the user to update.
 * @param dataToUpdate - An object containing the fields and values to update (Partial<FirestoreUser>).
 *                       Example: { displayName: 'New Name', lastActiveGroupId: 'group123' }
 * @returns A promise that resolves when the update is complete.
 */
export const updateUserDocument = async (userId: string, dataToUpdate: Partial<FirestoreUser>): Promise<void> => {
  // *** NEUES DETAILLIERTES LOGGING ***
  console.log(`AUTH_SERVICE: updateUserDocument CALLED for user ${userId}`, "Data:", JSON.stringify(dataToUpdate));
  // Optional: Stacktrace loggen, um den Aufrufer zu finden (kann sehr lang sein)
  // console.trace("updateUserDocument called from:"); 
  // *** ENDE NEUES LOGGING ***

  if (!userId) {
    console.error('updateUserDocument: userId is missing.');
    throw new Error('User ID is required to update document.');
  }
  if (!dataToUpdate || typeof dataToUpdate !== 'object' || Object.keys(dataToUpdate).length === 0) {
    console.warn('updateUserDocument: dataToUpdate is invalid or empty, no update performed for userId:', userId);
    return;
  }

  const forbiddenFields = ['uid', 'email', 'createdAt', 'provider'];
  const invalidFields = Object.keys(dataToUpdate).filter(key => forbiddenFields.includes(key));
  if (invalidFields.length > 0) {
    console.error(`updateUserDocument: Attempted to update forbidden fields: ${invalidFields.join(', ')} for user ${userId}`);
    throw new Error(`Updating fields ${invalidFields.join(', ')} is not allowed.`);
  }

  try {
    if (!db) {
      console.error('updateUserDocument: Firestore instance (db) is not initialized.');
      throw new Error("Firestore database instance is not available.");
    }
    const userDocRef = doc(db, 'users', userId);

    // Add lastUpdated timestamp automatically
    const dataWithTimestamp: Partial<FirestoreUser> & { lastUpdated: FieldValue } = {
      ...dataToUpdate,
      lastUpdated: serverTimestamp(),
    };

    await updateDoc(userDocRef, dataWithTimestamp);
    // *** LOGGING ERWEITERT ***
    console.log(`AUTH_SERVICE: User document for ${userId} updated successfully. Fields:`, Object.keys(dataToUpdate).join(', '), "Written data: ", JSON.stringify(dataWithTimestamp));

  } catch (error) {
    console.error(`Error updating user document for ${userId}:`, dataToUpdate, error);
    throw new Error(`Failed to update user document for ${userId}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// --- AUTHENTICATION FUNCTIONS ---

/**
 * Registriert einen neuen Benutzer mit E-Mail und Passwort.
 * Aktualisiert das Profil mit dem Anzeigenamen, erstellt/aktualisiert das Firestore-Dokument
 * und sendet eine Verifizierungs-E-Mail.
 */
export const registerWithEmail = async (email: string, password: string, displayName?: string): Promise<AuthUser> => {
  const currentAuth = getAuth();
  if (!isFirebaseReady) {
    console.warn('Firebase Auth or Firestore might not be ready. Registration might fail.');
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(currentAuth, email, password);
    const user = userCredential.user;

    if (user) {
        const promises = [];

        if (displayName) {
            promises.push(
                firebaseUpdateProfile(user, { displayName })
                    .catch(err => console.error("Profil-Update fehlgeschlagen:", { userId: user.uid, error: err }))
            );
        }

        promises.push(createOrUpdateFirestoreUser(user, true));

        promises.push(
            sendEmailVerification(user)
                .then(() => console.log('Verifizierungs-E-Mail gesendet an:', user.email))
                .catch(err => console.error("Senden der Verifizierungs-E-Mail fehlgeschlagen:", { userId: user.uid, error: err }))
        );

        await Promise.all(promises);

        return mapUserToAuthUser(user);
    } else {
        throw new Error('Benutzerobjekt nach Erstellung nicht verfügbar.');
    }

  } catch (error) {
    console.error('Registrierungsfehler im Service:', { email, error });
    if (error instanceof Error) {
      const errorCode = (error as FirebaseAuthError).code;
      if (errorCode === 'auth/email-already-in-use') {
        throw new Error('Diese E-Mail-Adresse wird bereits verwendet.');
      } else if (errorCode === 'auth/weak-password') {
        throw new Error('Das Passwort ist zu schwach. Es muss mindestens 6 Zeichen lang sein.');
      }
    }
    throw new Error('Registrierung fehlgeschlagen. Bitte überprüfen Sie Ihre Eingaben.');
  }
};

/**
 * Meldet einen Benutzer mit E-Mail und Passwort an.
 * Aktualisiert das lastLogin-Feld im Firestore-Dokument.
 */
export const loginWithEmail = async (email: string, password: string): Promise<AuthUser> => {
  const currentAuth = getAuth();
   if (!isFirebaseReady) {
     console.warn('Firebase Auth or Firestore might not be ready. Login might fail.');
   }
  try {
    const userCredential = await signInWithEmailAndPassword(currentAuth, email, password);
    const user = userCredential.user;

    if (user) {
      createOrUpdateFirestoreUser(user, false).catch(err => {
          console.error('Failed to update last login time on email login:', { userId: user.uid, error: err });
      });
    return mapUserToAuthUser(user);
    } else {
       console.error('User object is null after successful email login', { email });
      throw new Error('Anmeldung fehlgeschlagen: Kein Benutzerobjekt erhalten.');
    }
  } catch (error) {
     console.error('Login Fehler (Email):', { email, error });
    if (error instanceof Error) {
      const errorCode = (error as FirebaseAuthError).code;
       if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        throw new Error('Ungültige E-Mail-Adresse oder Passwort.');
      } else if (errorCode === 'auth/user-disabled') {
           throw new Error('Dieses Benutzerkonto wurde deaktiviert.');
       }
    }
    throw new Error('Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.');
  }
};

/**
 * Initiates Google Sign-In popup flow.
 * Creates or updates the user in Firestore upon successful sign-in.
 */
export const signInWithGoogleProvider = async (): Promise<AuthUser> => {
  const currentAuth = getAuth();
  const provider = new GoogleAuthProvider();
  if (!isFirebaseReady) {
    console.warn('Firebase Auth or Firestore might not be ready. Google Sign-In might fail.');
  }

  try {
    const result = await signInWithPopup(currentAuth, provider);
    const user = result.user;

    if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userDocRef);
        const isNewUser = !docSnap.exists();

        await createOrUpdateFirestoreUser(user, isNewUser);
    
    return mapUserToAuthUser(user);
    } else {
         console.error('Google Sign-In: User object is null after successful popup sign-in.');
        throw new Error('Google Sign-In fehlgeschlagen: Kein Benutzerobjekt erhalten.');
    }
  } catch (error) {
    console.error('Google Sign-In Fehler:', { error });
     if (error instanceof Error) {
        const errorCode = (error as FirebaseAuthError).code;
        if (errorCode === 'auth/popup-closed-by-user') {
            throw new Error('Google Sign-In wurde abgebrochen.');
        } else if (errorCode === 'auth/account-exists-with-different-credential') {
           try {
               // Attempt to get the email from the credential if available
               // Firebase error structures can be complex, using 'any' is pragmatic here
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               const email = (error as any)?.customData?.email;
               if (email) {
                  const methods = await fetchSignInMethodsForEmail(currentAuth, email);
                   throw new Error(`Ein Konto existiert bereits mit dieser E-Mail (${email}), aber mit einer anderen Anmeldemethode (${methods.join(', ')}). Bitte melden Sie sich mit dieser Methode an.`);
               }
           } catch (fetchError) {
               console.error('Error fetching sign-in methods during account-exists error:', fetchError);
           }
           throw new Error('Ein Konto existiert bereits mit dieser E-Mail, aber mit einer anderen Anmeldemethode.');
        }
     }
    throw new Error('Google Sign-In fehlgeschlagen. Bitte versuchen Sie es erneut.');
  }
};

/**
 * Sendet eine E-Mail zum Zurücksetzen des Passworts.
 */
export const sendPasswordReset = async (email: string): Promise<void> => {
  const currentAuth = getAuth();
  if (!isFirebaseReady) {
     console.warn('Firebase Auth not ready. Password reset might fail.');
  }
  try {
    await sendPasswordResetEmail(currentAuth, email);
    console.log('Password reset email sent successfully to:', email);
  } catch (error) {
    console.error('Error sending password reset email:', { email, error });
     if (error instanceof Error && (error as FirebaseAuthError).code === 'auth/user-not-found') {
        throw new Error('Fehler beim Senden der Passwort-Zurücksetzungs-E-Mail.');
     }
    throw new Error('Fehler beim Senden der Passwort-Zurücksetzungs-E-Mail.');
  }
};

/**
 * Meldet den aktuellen Benutzer ab.
 */
export const signOut = async (): Promise<void> => {
  const currentAuth = getAuth();
  try {
    await firebaseSignOut(currentAuth);
    console.log('User signed out successfully.');
  } catch (error) {
    console.error('Error signing out:', error);
    throw new Error('Abmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.');
  }
};

export const logout = async (): Promise<void> => {
  if (!isFirebaseReady) {
     console.warn('Firebase nicht bereit, Logout übersprungen.');
    return;
  }
  try {
    const currentAuth = getAuth();
    await firebaseSignOut(currentAuth);
  } catch (error) {
    console.error('Fehler beim Abmelden:', error);
    throw new Error('Abmeldung fehlgeschlagen.');
  }
};

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
    console.warn('resendVerificationEmail aufgerufen, ohne dass ein Benutzer angemeldet ist.');
    throw new Error('Kein Benutzer angemeldet, um die E-Mail erneut zu senden.');
  }
};

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
    return null;
  }
};

export const uploadProfilePicture = async (file: File, userId: string): Promise<AuthUser> => {
  if (!db) throw new Error("Firebase Database nicht initialisiert.");
  const storage = getStorage();
  if (!storage) throw new Error("Firebase Storage nicht initialisiert.");
  const authInstance = getAuth();

  const userDocRef = doc(db, 'users', userId);
  try {
    const userDocSnap = await getDoc(userDocRef);
    console.log("User document loaded:", userDocSnap.exists() ? userDocSnap.data() : "No document");
    if (userDocSnap.exists()) {
      const oldPhotoURL = userDocSnap.data()?.photoURL;
      if (oldPhotoURL) {
        try {
          const oldImageRef = ref(storage, oldPhotoURL);
          await deleteObject(oldImageRef);
          console.log("Altes Profilbild gelöscht:", oldPhotoURL);
        } catch (deleteError) {
          console.warn("Konnte altes Profilbild nicht löschen:", deleteError);
        }
      }
    }
  } catch (error) {
    console.error("Fehler beim Abrufen des Benutzerdokuments zum Löschen des alten Bildes:", error);
  }

  const filePath = `profileImages/${userId}/${file.name}`;
  const storageRef = ref(storage, filePath);

  try {
    console.log(`Lade ${file.name} (${(file.size / 1024).toFixed(2)} KB) hoch nach ${filePath}...`);
    
    const fileType = file.type.toLowerCase();
    if (!fileType.startsWith('image/')) {
      throw new Error("Die Datei ist kein Bild. Unterstützte Formate: JPEG, PNG, GIF.");
    }
    
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > 5) {
      throw new Error(`Die Datei ist zu groß (${fileSizeInMB.toFixed(2)} MB). Maximale Größe: 5 MB.`);
    }

    const uploadResult = await uploadBytes(storageRef, file);
    console.log("Upload erfolgreich:", uploadResult);

    const downloadURL = await getDownloadURL(uploadResult.ref);
    console.log("Download URL:", downloadURL);

    await updateDoc(userDocRef, {
      photoURL: downloadURL,
      updatedAt: serverTimestamp()
    });
    console.log("Firestore photoURL aktualisiert.");

    const currentUser = authInstance.currentUser;
    if (!currentUser) {
      throw new Error('Benutzer ist nach dem Upload nicht mehr angemeldet.');
    }
    
    try {
      await firebaseUpdateProfile(currentUser, { photoURL: downloadURL });
      console.log("Auth-Profil aktualisiert.");
    } catch (profileError) {
      console.warn("Konnte Auth-Profil nicht aktualisieren:", profileError);
    }
    
    const updatedAuthUser = mapUserToAuthUser(currentUser);
    updatedAuthUser.photoURL = downloadURL; 

    console.log("AuthService: Gebe aktualisierten AuthUser zurück:", updatedAuthUser);
    return updatedAuthUser;

  } catch (error) {
    console.error("Fehler beim Hochladen des Profilbilds oder Aktualisieren von Firestore:", error);
    
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

export const updateUserProfile = async (updates: { displayName?: string; statusMessage?: string }): Promise<void> => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Kein Benutzer angemeldet');
  }

  try {
    // Update in Firebase Auth (nur displayName)
    if (updates.displayName) {
      await firebaseUpdateProfile(currentUser, {
        displayName: updates.displayName
      });
    }

    // Update in Firestore (displayName und statusMessage)
    const userRef = doc(db, 'users', currentUser.uid);
    const updateData = {
      ...(updates.displayName && { displayName: updates.displayName }),
      ...(updates.statusMessage !== undefined && { statusMessage: updates.statusMessage }),
      lastUpdated: serverTimestamp()
    };
    
    await updateDoc(userRef, updateData);
  } catch (error) {
    throw error;
  }
}; 