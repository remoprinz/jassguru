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
} from "firebase/storage";
import {auth, db, isFirebaseReady} from "./firebaseInit";
import type { AuthUser } from "@/types/auth";
import type { FirestorePlayer } from "@/types/jass";
import { getPlayerIdForUser, updatePlayerDocument } from "./playerService";

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
    profileTheme: firestoreUser?.profileTheme ?? null,
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
  if (!user || !user.uid || !db) {
    throw new Error("Invalid user or Firestore not initialized.");
  }

  try {
    const userDocRef = doc(db, "users", user.uid);
    const privateUserData: { email: string | null, displayName?: string | null, lastLogin: FieldValue, createdAt?: FieldValue, preferences?: object, statusMessage?: string } = {
      email: user.email,
      displayName: user.displayName, // displayName auch in Firestore speichern
      lastLogin: serverTimestamp(),
    };

    if (isNewUser) {
      privateUserData.createdAt = serverTimestamp();
      privateUserData.statusMessage = "Grüezi! Ich jasse mit Jassguru.";
      privateUserData.preferences = { theme: "light", notifications: true };
    }

    await setDoc(userDocRef, privateUserData, {merge: true});
  } catch (error) {
    console.error(`Error in createOrUpdateFirestoreUser for ${user.uid}:`, error);
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
  if (!userId || !dataToUpdate || Object.keys(dataToUpdate).length === 0) {
    return;
  }
  const forbiddenFields = ["uid", "email", "createdAt", "provider", "displayName", "photoURL"];
  if (Object.keys(dataToUpdate).some(key => forbiddenFields.includes(key))) {
    throw new Error("Attempted to update forbidden/public fields in private user document.");
  }
  try {
    const userDocRef = doc(db, "users", userId);
    await updateDoc(userDocRef, { ...dataToUpdate, lastUpdated: serverTimestamp() });
  } catch (error) {
    if (error instanceof Error && error.message.includes("No document to update")) {
      return;
    }
    console.error(`Error updating user document for ${userId}:`, error);
    throw new Error("Failed to update user document.");
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
  try {
    const currentAuth = getAuth();
    const userCredential = await createUserWithEmailAndPassword(currentAuth, email, password);
    const user = userCredential.user;

    if (displayName) {
      await firebaseUpdateProfile(user, {displayName});
    }
    await createOrUpdateFirestoreUser(user, true);
    await sendEmailVerification(user);

    return mapUserToAuthUser(user);
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
  try {
    const userCredential = await signInWithEmailAndPassword(getAuth(), email, password);
    const user = userCredential.user;
    if (user) {
      await createOrUpdateFirestoreUser(user, false);
      const firestoreUser = await getPrivateUserData(user.uid);
      return mapUserToAuthUser(user, firestoreUser);
    } else {
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
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(getAuth(), provider);
    const user = result.user;

    const userDocRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(userDocRef);
    await createOrUpdateFirestoreUser(user, !docSnap.exists());

    return mapUserToAuthUser(user);
  } catch (error) {
    console.error("Google Sign-In Fehler:", {error});
    if (error instanceof Error) {
      const errorCode = (error as FirebaseAuthError).code;
      if (errorCode === "auth/popup-closed-by-user") {
        throw new Error("Google Sign-In wurde abgebrochen.");
      } else if (errorCode === "auth/account-exists-with-different-credential") {
        const email = (error as any)?.customData?.email;
        if (email) {
          const methods = await fetchSignInMethodsForEmail(getAuth(), email);
          throw new Error(`Ein Konto existiert bereits mit dieser E-Mail (${email}), aber mit einer anderen Anmeldemethode (${methods.join(", ")}).`);
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
export const sendPasswordReset = (email: string): Promise<void> => sendPasswordResetEmail(getAuth(), email);

/**
 * Meldet den aktuellen Benutzer ab.
 */
export const signOut = (): Promise<void> => firebaseSignOut(getAuth());

export const logout = (): Promise<void> => firebaseSignOut(getAuth());

export const resendVerificationEmail = (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("No user logged in.");
  return sendEmailVerification(user);
};

/**
 * @returns The updated AuthUser object with the new photoURL.
 */
export const uploadProfilePicture = async (file: File, userId: string): Promise<AuthUser> => {
  const currentUser = getAuth().currentUser;
  if (!currentUser || currentUser.uid !== userId) throw new Error("Authentication error.");

  const storage = getStorage();
  const storageRef = ref(storage, `profileImages/${userId}/profile.${file.name.split('.').pop()}`);
  
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);
  
  await firebaseUpdateProfile(currentUser, { photoURL: downloadURL });

  const playerId = await getPlayerIdForUser(userId, currentUser.displayName);
  if (playerId) {
    await updatePlayerDocument(playerId, { photoURL: downloadURL });
  }

  const firestoreUserData = await getPrivateUserData(userId);
  return mapUserToAuthUser(currentUser, firestoreUserData);
};

export const updateUserProfile = async (updates: { displayName?: string; statusMessage?: string; profileTheme?: string }): Promise<void> => {
  const currentUser = getAuth().currentUser;
  if (!currentUser) throw new Error("No authenticated user found.");
  
  const { uid } = currentUser;

  if (updates.displayName) {
    await firebaseUpdateProfile(currentUser, { displayName: updates.displayName });
  }

  const playerId = await getPlayerIdForUser(uid, currentUser.displayName);
  if (playerId) {
    await updatePlayerDocument(playerId, updates);
  } else {
    console.warn(`Could not find player document for user ${uid} to sync profile updates.`);
  }
};

/**
 * Checks if a given nickname (displayName) is already taken in the players collection.
 * Case-insensitive check by converting nickname to lowercase.
 * @param nickname - The nickname to check.
 * @returns A promise that resolves to true if the nickname is available, false otherwise.
 */
export const checkNicknameAvailability = async (nickname: string): Promise<boolean> => {
  if (!nickname) return false;
  const playersRef = collection(db, "players");
  const lowerCaseNickname = nickname.toLowerCase();
  const q = query(playersRef, where("lowercaseDisplayName", "==", lowerCaseNickname)); 
  const querySnapshot = await getDocs(q);
  return querySnapshot.empty;
};

/**
 * Ruft die privaten Daten eines Benutzers aus der 'users'-Collection ab.
 * @param uid Die User-ID des Benutzers.
 * @returns Ein Promise, das das Benutzerdokument oder null auflöst.
 */
export const getPrivateUserData = async (uid: string): Promise<FirestorePlayer | null> => {
  if (!db) return null;
  const userDocRef = doc(db, "users", uid);
  const userDocSnap = await getDoc(userDocRef);
  return userDocSnap.exists() ? userDocSnap.data() as FirestorePlayer : null;
};