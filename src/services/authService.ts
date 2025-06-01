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
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  // Firestore methods
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  FieldValue,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import {
  // Firebase Storage methods
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {auth, db, isFirebaseReady} from "./firebaseInit";
import type { AuthUser } from "@/types/auth";
import type { FirestorePlayer } from "@/types/jass";
import { getPlayerIdForUser, syncDisplayNameAcrossCollections } from "./playerService";

// Type-Definition für Firebase Auth Fehler
interface FirebaseAuthError extends Error {
  code?: string;
  message: string;
}

/**
 * Helper function to map Firebase Auth User to application's AuthUser type.
 * Defined in this file.
 */
export const mapUserToAuthUser = (user: FirebaseAuthUser, firestoreUser?: Partial<FirestorePlayer> | null): AuthUser => {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    isAnonymous: user.isAnonymous,
    metadata: {
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
    },
    // Füge Felder aus Firestore hinzu, falls vorhanden
    lastActiveGroupId: firestoreUser?.lastActiveGroupId ?? null,
    statusMessage: firestoreUser?.statusMessage ?? null,
    playerId: firestoreUser?.playerId ?? null,
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
    console.error("createOrUpdateFirestoreUser: Invalid Firebase user object provided.");
    throw new Error("Invalid Firebase user data.");
  }

  if (!db) {
    console.error("createOrUpdateFirestoreUser: Firestore instance (db) is not initialized.");
    throw new Error("Firestore not initialized.");
  }

  try {
    const userDocRef = doc(db, "users", user.uid);

    const userData: Partial<FirestorePlayer> & { uid: string } = {
      uid: user.uid,
      displayName: user.displayName || "",
      photoURL: user.photoURL || null,
      lastLogin: serverTimestamp(),
    };

    if (isNewUser) {
      userData.createdAt = serverTimestamp();
      userData.statusMessage = "Grüezi! Ich jasse mit Jassguru.";
      userData.preferences = {
        theme: "light",
        notifications: true,
      };
    }

    // Erstelle das Objekt für Firestore ohne uid
    const { uid, ...dataToSave } = userData;

    await setDoc(userDocRef, dataToSave, {merge: true});
    // console.log(`Firestore user document for ${user.uid} ${isNewUser ? "created" : "updated"} successfully.`);
  } catch (error) {
    console.error(`Error ${isNewUser ? "creating" : "updating"} Firestore user document for ${user.uid}:`, error);
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
 * @return A promise that resolves when the update is complete.
 */
export const updateUserDocument = async (userId: string, dataToUpdate: Partial<FirestorePlayer>): Promise<void> => {
  // *** NEUES DETAILLIERTES LOGGING ***
  // console.log(`AUTH_SERVICE: updateUserDocument CALLED for user ${userId}`, "Data:", JSON.stringify(dataToUpdate));
  // Optional: Stacktrace loggen, um den Aufrufer zu finden (kann sehr lang sein)
  // console.trace("updateUserDocument called from:");
  // *** ENDE NEUES LOGGING ***

  if (!userId) {
    console.error("updateUserDocument: userId is missing.");
    throw new Error("User ID is required to update document.");
  }
  if (!dataToUpdate || typeof dataToUpdate !== "object" || Object.keys(dataToUpdate).length === 0) {
    console.warn("updateUserDocument: dataToUpdate is invalid or empty, no update performed for userId:", userId);
    return;
  }

  const forbiddenFields = ["uid", "email", "createdAt", "provider"];
  const invalidFields = Object.keys(dataToUpdate).filter((key) => forbiddenFields.includes(key));
  if (invalidFields.length > 0) {
    console.error(`updateUserDocument: Attempted to update forbidden fields: ${invalidFields.join(", ")} for user ${userId}`);
    throw new Error(`Updating fields ${invalidFields.join(", ")} is not allowed.`);
  }

  try {
    if (!db) {
      console.error("updateUserDocument: Firestore instance (db) is not initialized.");
      throw new Error("Firestore database instance is not available.");
    }
    const userDocRef = doc(db, "users", userId);

    // Add lastUpdated timestamp automatically
    const dataWithTimestamp: Partial<FirestorePlayer> & { lastUpdated: FieldValue } = {
      ...dataToUpdate,
      lastUpdated: serverTimestamp(),
    };

    await updateDoc(userDocRef, dataWithTimestamp);
    // *** LOGGING ERWEITERT ***
    // console.log(`AUTH_SERVICE: User document for ${userId} updated successfully. Fields:`, Object.keys(dataToUpdate).join(", "), "Written data: ", JSON.stringify(dataWithTimestamp));
  } catch (error) {
    console.error(`Error updating user document for ${userId}:`, dataToUpdate, error);
    throw new Error(`Failed to update user document for ${userId}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// --- AUTHENTICATION FUNCTIONS ---

/**
 * Registriert einen neuen Benutzer mit E-Mail und Passwort.
 * Setzt die Persistenz auf local.
 * Aktualisiert das Profil mit dem Anzeigenamen, erstellt/aktualisiert das Firestore-Dokument
 * und sendet eine Verifizierungs-E-Mail.
 */
export const registerWithEmail = async (email: string, password: string, displayName?: string): Promise<AuthUser> => {
  const currentAuth = getAuth();
  if (!isFirebaseReady) {
    console.warn("Firebase Auth or Firestore might not be ready. Registration might fail.");
  }
  try {
    await setPersistence(currentAuth, browserLocalPersistence);
    
    const userCredential = await createUserWithEmailAndPassword(currentAuth, email, password);
    const user = userCredential.user;

    if (user) {
      const promises: Promise<void | unknown>[] = [];

      if (displayName) {
        promises.push(
          firebaseUpdateProfile(user, {displayName})
            .catch((err) => console.error("Profil-Update fehlgeschlagen:", {userId: user.uid, error: err}))
        );
      }

      promises.push(createOrUpdateFirestoreUser(user, true));

      promises.push(
        sendEmailVerification(user)
          .then(() => {/* console.log("Verifizierungs-E-Mail gesendet an:", user.email) */})
          .catch((err) => console.error("Senden der Verifizierungs-E-Mail fehlgeschlagen:", {userId: user.uid, error: err}))
      );

      await Promise.all(promises);

      return mapUserToAuthUser(user);
    } else {
      throw new Error("Benutzerobjekt nach Erstellung nicht verfügbar.");
    }
  } catch (error) {
    console.error("Registrierungsfehler im Service:", {email, error});
    if (error instanceof Error) {
      const errorCode = (error as FirebaseAuthError).code;
      if (errorCode === "auth/email-already-in-use") {
        throw new Error("Diese E-Mail-Adresse wird bereits verwendet.");
      } else if (errorCode === "auth/weak-password") {
        throw new Error("Das Passwort ist zu schwach. Es muss mindestens 6 Zeichen lang sein.");
      }
    }
    throw new Error("Registrierung fehlgeschlagen. Bitte überprüfen Sie Ihre Eingaben.");
  }
};

/**
 * Meldet einen Benutzer mit E-Mail und Passwort an.
 * Setzt die Persistenz auf local.
 * Aktualisiert das lastLogin-Feld im Firestore-Dokument.
 */
export const loginWithEmail = async (email: string, password: string): Promise<AuthUser> => {
  const currentAuth = getAuth();
  if (!isFirebaseReady) {
    console.warn("Firebase Auth or Firestore might not be ready. Login might fail.");
  }
  try {
    await setPersistence(currentAuth, browserLocalPersistence);
    
    const userCredential = await signInWithEmailAndPassword(currentAuth, email, password);
    const user = userCredential.user;

    if (user) {
      createOrUpdateFirestoreUser(user, false).catch((err) => {
        console.error("Failed to update last login time on email login:", {userId: user.uid, error: err});
      });
      return mapUserToAuthUser(user);
    } else {
      console.error("User object is null after successful email login", {email});
      throw new Error("Anmeldung fehlgeschlagen: Kein Benutzerobjekt erhalten.");
    }
  } catch (error) {
    console.error("Login Fehler (Email):", {email, error});
    if (error instanceof Error) {
      const errorCode = (error as FirebaseAuthError).code;
      if (errorCode === "auth/user-not-found" || errorCode === "auth/wrong-password" || errorCode === "auth/invalid-credential") {
        throw new Error("Ungültige E-Mail-Adresse oder Passwort.");
      } else if (errorCode === "auth/user-disabled") {
        throw new Error("Dieses Benutzerkonto wurde deaktiviert.");
      }
    }
    throw new Error("Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.");
  }
};

/**
 * Meldet einen Benutzer über den Google Provider an.
 * Setzt die Persistenz auf local.
 * Erstellt oder aktualisiert das Firestore-Dokument.
 */
export const signInWithGoogleProvider = async (): Promise<AuthUser> => {
  const currentAuth = getAuth();
  if (!isFirebaseReady) {
    console.warn("Firebase Auth or Firestore might not be ready. Google Sign-In might fail.");
  }

  try {
    await setPersistence(currentAuth, browserLocalPersistence);
    
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(currentAuth, provider);
    const user = result.user;

    if (user) {
      const userDocRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userDocRef);
      const isNewUser = !docSnap.exists();

      await createOrUpdateFirestoreUser(user, isNewUser);

      return mapUserToAuthUser(user);
    } else {
      console.error("Google Sign-In: User object is null after successful popup sign-in.");
      throw new Error("Google Sign-In fehlgeschlagen: Kein Benutzerobjekt erhalten.");
    }
  } catch (error) {
    console.error("Google Sign-In Fehler:", {error});
    if (error instanceof Error) {
      const errorCode = (error as FirebaseAuthError).code;
      if (errorCode === "auth/popup-closed-by-user") {
        throw new Error("Google Sign-In wurde abgebrochen.");
      } else if (errorCode === "auth/account-exists-with-different-credential") {
        try {
          // Attempt to get the email from the credential if available
          // Firebase error structures can be complex, using 'any' is pragmatic here
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const email = (error as any)?.customData?.email;
          if (email) {
            const methods = await fetchSignInMethodsForEmail(currentAuth, email);
            throw new Error(`Ein Konto existiert bereits mit dieser E-Mail (${email}), aber mit einer anderen Anmeldemethode (${methods.join(", ")}). Bitte melden Sie sich mit dieser Methode an.`);
          }
        } catch (fetchError) {
          console.error("Error fetching sign-in methods during account-exists error:", fetchError);
        }
        throw new Error("Ein Konto existiert bereits mit dieser E-Mail, aber mit einer anderen Anmeldemethode.");
      }
    }
    throw new Error("Google Sign-In fehlgeschlagen. Bitte versuchen Sie es erneut.");
  }
};

/**
 * Sendet eine E-Mail zum Zurücksetzen des Passworts.
 */
export const sendPasswordReset = async (email: string): Promise<void> => {
  const currentAuth = getAuth();
  if (!isFirebaseReady) {
    console.warn("Firebase Auth not ready. Password reset might fail.");
  }
  try {
    await sendPasswordResetEmail(currentAuth, email);
    // console.log("Password reset email sent successfully to:", email);
  } catch (error) {
    console.error("Error sending password reset email:", {email, error});
    if (error instanceof Error && (error as FirebaseAuthError).code === "auth/user-not-found") {
      throw new Error("Fehler beim Senden der Passwort-Zurücksetzungs-E-Mail.");
    }
    throw new Error("Fehler beim Senden der Passwort-Zurücksetzungs-E-Mail.");
  }
};

/**
 * Meldet den aktuellen Benutzer ab.
 */
export const signOut = async (): Promise<void> => {
  const currentAuth = getAuth();
  try {
    await firebaseSignOut(currentAuth);
    // console.log("User signed out successfully.");
  } catch (error) {
    console.error("Error signing out:", error);
    throw new Error("Abmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.");
  }
};

export const logout = async (): Promise<void> => {
  if (!isFirebaseReady) {
    console.warn("Firebase nicht bereit, Logout übersprungen.");
    return;
  }
  try {
    const currentAuth = getAuth();
    await firebaseSignOut(currentAuth);
  } catch (error) {
    console.error("Fehler beim Abmelden:", error);
    throw new Error("Abmeldung fehlgeschlagen.");
  }
};

export const resendVerificationEmail = async (): Promise<void> => {
  if (!isFirebaseReady) {
    throw new Error("Firebase ist nicht initialisiert.");
  }
  const user = auth.currentUser;
  if (user) {
    try {
      await sendEmailVerification(user);
      // console.log("Verifizierungs-E-Mail erneut gesendet an:", user.email);
    } catch (error) {
      console.error("Fehler beim erneuten Senden der Verifizierungs-E-Mail:", error);
      throw new Error("Fehler beim Senden der Verifizierungs-E-Mail.");
    }
  } else {
    console.warn("resendVerificationEmail aufgerufen, ohne dass ein Benutzer angemeldet ist.");
    throw new Error("Kein Benutzer angemeldet, um die E-Mail erneut zu senden.");
  }
};

export const getUserDocument = async (uid: string): Promise<FirestorePlayer | null> => {
  if (!isFirebaseReady || !db) {
    console.warn("Firestore ist nicht bereit. Kann Benutzerdokument nicht abrufen.");
    return null;
  }
  try {
    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      return userDocSnap.data() as FirestorePlayer;
    } else {
      // console.log("Kein Firestore-Dokument für Benutzer gefunden:", uid);
      return null;
    }
  } catch (error) {
    console.error("Fehler beim Abrufen des Benutzerdokuments:", error);
    return null;
  }
};

/**
 * @returns The updated AuthUser object with the new photoURL.
 */
export const uploadProfilePicture = async (file: File, userId: string): Promise<AuthUser> => {
  if (!userId) {
    console.error("uploadProfilePicture: User ID is missing.");
    throw new Error("User ID is required to upload profile picture.");
  }

  const storage = getStorage();
  const storageRef = ref(storage, `profilePictures/${userId}/profile.${file.name.split('.').pop()}`);
  const currentAuth = getAuth();
  const currentUser = currentAuth.currentUser;

  if (!currentUser) {
    console.error("uploadProfilePicture: No current user found in auth.");
    throw new Error("Authentication error: No current user found.");
  }

  // console.log(`AUTH_SERVICE: Uploading profile picture for user ${userId} to path: ${storageRef.fullPath}`);

  try {
    // 1. Datei hochladen
    const snapshot = await uploadBytes(storageRef, file);
    // console.log(`AUTH_SERVICE: Profile picture uploaded for user ${userId}. Upload successful.`);

    // 2. Download-URL holen
    const downloadURL = await getDownloadURL(snapshot.ref);
    // console.log(`AUTH_SERVICE: Download URL obtained for user ${userId}:`, downloadURL);

    // 3. Firebase Auth Profil aktualisieren
    await firebaseUpdateProfile(currentUser, { photoURL: downloadURL });
    // console.log(`AUTH_SERVICE: Firebase Auth profile updated for user ${userId} with new photoURL.`);

    // --- NEUER SCHRITT 4: Firestore User-Dokument aktualisieren ---
    try {
      await updateUserDocument(userId, { photoURL: downloadURL });
      // console.log(`AUTH_SERVICE: Firestore 'users' document updated for user ${userId} with new photoURL.`);
    } catch (firestoreError) {
      console.error(`AUTH_SERVICE: Error updating Firestore 'users' document for user ${userId} with photoURL:`, firestoreError);
      // Wirf den Fehler weiter, damit der aufrufende Store ihn behandeln kann.
      throw new Error(`Profilbild in Datenbank konnte nicht gespeichert werden: ${firestoreError instanceof Error ? firestoreError.message : String(firestoreError)}`);
      // Eventuell Rollback von Auth Update? Vorerst nicht.
    }
    // --- ENDE NEUER SCHRITT 4 ---

    // 5. Aktualisierte Benutzerdaten (inkl. Firestore-Daten) abrufen und zurückgeben
    // Hinweis: Wir rufen getUserDocument auf, um sicherzustellen, dass wir die neuesten
    // Firestore-Daten haben, da mapUserToAuthUser diese verwendet.
    // Dies geht davon aus, dass die Cloud Function die Daten vom 'users' zum 'players'
    // Dokument synchronisiert hat oder dass getUserDocument indirekt auf das 'players'
    // Dokument zugreift, wenn 'users' nicht die nötigen Felder hat.
    // Wenn mapUserToAuthUser nur 'users' liest, ist das ok.
    const firestoreUserData = await getUserDocument(userId); // Holt Daten aus 'users' collection
    const updatedAuthUser = mapUserToAuthUser(currentUser, firestoreUserData); 
    
    // console.log(`AUTH_SERVICE: Returning updated AuthUser object for ${userId}:`, updatedAuthUser);
    return updatedAuthUser;

  } catch (error) {
    console.error(`AUTH_SERVICE: Error during profile picture upload process for user ${userId}:`, error);
    // Spezifischere Fehlerbehandlung basierend auf dem Fehlercode (Storage, Auth etc.)
    if (error instanceof Error && 'code' in error) {
        const storageErrorCode = (error as any).code;
        if (storageErrorCode === 'storage/unauthorized') {
            throw new Error("Berechtigungsfehler: Sie dürfen kein Profilbild hochladen.");
        } else if (storageErrorCode === 'storage/canceled') {
            throw new Error("Der Upload wurde abgebrochen.");
        } else if (storageErrorCode === 'storage/unknown') {
            throw new Error("Ein unbekannter Speicherfehler ist aufgetreten.");
        }
    }
    throw new Error(`Profilbild konnte nicht hochgeladen werden: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const updateUserProfile = async (updates: { displayName?: string; statusMessage?: string }): Promise<void> => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Kein angemeldeter Benutzer für die Profilaktualisierung.");
  }

  const userId = currentUser.uid;
  if (!userId) {
    throw new Error("Keine User-ID verfügbar.");
  }

  try {
    // Firebase Auth Profil aktualisieren (nur für displayName)
    if (updates.displayName) {
      try {
        await firebaseUpdateProfile(currentUser, { displayName: updates.displayName });
      } catch (authError) {
        console.error("Fehler beim Aktualisieren des Firebase Auth Profils:", authError);
        throw new Error("Fehler beim Aktualisieren des Anzeigenamens in Firebase Auth.");
      }
    }

    // Firestore User-Dokument aktualisieren
    await updateUserDocument(userId, updates);

    // NEU: Wenn DisplayName geändert wurde, synchronisiere ihn über alle Collections
    if (updates.displayName) {
      // *** HIER beginnt der try-Block für die Synchronisation ***
      try {
        // Player-ID für den User holen (falls verfügbar)
        const userDocRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const playerId = userData?.playerId;
          
          if (playerId) {
            // Synchronisiere DisplayName über alle Collections
            await syncDisplayNameAcrossCollections(
              userId, 
              playerId, 
              updates.displayName
            );
            console.log(`DisplayName "${updates.displayName}" für User ${userId} / Player ${playerId} erfolgreich synchronisiert.`);
          } else {
            console.warn(`Keine Player-ID für User ${userId} gefunden. Synchronisation nicht möglich.`);
          }
        } // Ende von if (userDocSnap.exists())
      // *** HIER endet der try-Block, gefolgt vom catch ***
      } catch (syncError) {
        console.error("Fehler bei der Synchronisation des DisplayName:", syncError);
        // Fehler hier nicht weiterwerfen, da das User-Dokument trotzdem aktualisiert wurde
      }
    } // Ende von if (updates.displayName)
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Benutzerprofils:", error);
    throw new Error("Benutzer-Profil konnte nicht aktualisiert werden.");
  }
};

/**
 * Checks if a given nickname (displayName) is already taken in the players collection.
 * Case-insensitive check by converting nickname to lowercase.
 * @param nickname - The nickname to check.
 * @returns A promise that resolves to true if the nickname is available, false otherwise.
 */
export const checkNicknameAvailability = async (nickname: string): Promise<boolean> => {
  if (!nickname || nickname.trim().length === 0) {
    return false; // Empty nickname is not valid/available
  }
  // *** Hier beginnt der try-Block ***
  try {
    const playersRef = collection(db, "players");
    // Perform a case-insensitive query by storing/querying a lowercase version
    const lowerCaseNickname = nickname.toLowerCase();
    const q = query(playersRef, where("lowercaseDisplayName", "==", lowerCaseNickname)); 
    const querySnapshot = await getDocs(q);
    return querySnapshot.empty; // True if no documents found (nickname available)
  } catch (error) {
    console.error("Error checking nickname availability:", error);
    // Decide how to handle errors, e.g., assume unavailable or re-throw
    // Assuming unavailable on error for safety
    return false; 
  }
  // *** Hier endet der try...catch-Block ***
};