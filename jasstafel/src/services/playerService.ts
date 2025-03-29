import {
  db,
  collections,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  isFirebaseReady
} from './firebaseInit';
import { AuthUser, FirestorePlayer } from '../types/jass';
import { nanoid } from 'nanoid';

/**
 * Erstellt einen neuen Spieler in Firestore
 */
export const createPlayer = async (
  nickname: string,
  authUser: AuthUser | null = null, // Null für Gastspieler
  initialGroupId?: string
): Promise<FirestorePlayer> => {
  // Offline-Modus oder Entwicklungsmodus prüfen
  if (!isFirebaseReady || !collections.players) {
    // Mock-Player für Offline/Entwicklung
    return createMockPlayer(nickname, authUser?.uid);
  }

  try {
    // Prüfen, ob Spieler mit diesem Nickname bereits existiert
    const existingPlayer = await getPlayerByNickname(nickname);
    if (existingPlayer) {
      throw new Error(`Ein Spieler mit dem Nickname '${nickname}' existiert bereits.`);
    }

    // Neuen Spieler erstellen
    const playerId = nanoid();
    const isGuest = !authUser;
    const userId = authUser?.uid || null;

    const playerData: FirestorePlayer = {
      id: playerId,
      nickname,
      userId,
      isGuest,
      createdAt: serverTimestamp(),
      groupIds: initialGroupId ? [initialGroupId] : [],
      metadata: {}
    };

    await setDoc(doc(collections.players, playerId), playerData);
    
    // Player ID zum User-Dokument hinzufügen, wenn der Spieler kein Gast ist
    if (authUser && collections.users) {
      const userRef = doc(collections.users, authUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        await setDoc(userRef, { playerId }, { merge: true });
      }
    }

    return playerData;
  } catch (error) {
    console.error('Fehler beim Erstellen des Spielers:', error);
    throw error;
  }
};

/**
 * Spieler anhand des Nicknamens abrufen
 */
export const getPlayerByNickname = async (nickname: string): Promise<FirestorePlayer | null> => {
  if (!isFirebaseReady || !collections.players) {
    // Im Offline-Modus simulieren wir, dass der Spieler nicht existiert
    return null;
  }

  try {
    const q = query(collections.players, where('nickname', '==', nickname));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }

    return querySnapshot.docs[0].data() as FirestorePlayer;
  } catch (error) {
    console.error('Fehler beim Abrufen des Spielers nach Nickname:', error);
    throw error;
  }
};

/**
 * Spieler anhand der Benutzer-ID abrufen
 */
export const getPlayerByUserId = async (userId: string): Promise<FirestorePlayer | null> => {
  if (!isFirebaseReady || !collections.players) {
    // Im Offline-Modus simulieren wir, dass der Spieler nicht existiert
    return null;
  }

  try {
    const q = query(collections.players, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }

    return querySnapshot.docs[0].data() as FirestorePlayer;
  } catch (error) {
    console.error('Fehler beim Abrufen des Spielers nach User-ID:', error);
    throw error;
  }
};

/**
 * Spieler anhand der ID abrufen
 */
export const getPlayerById = async (playerId: string): Promise<FirestorePlayer | null> => {
  if (!isFirebaseReady || !collections.players) {
    // Im Offline-Modus simulieren wir, dass der Spieler nicht existiert
    return null;
  }

  try {
    const playerDoc = await getDoc(doc(collections.players, playerId));
    
    if (!playerDoc.exists()) {
      return null;
    }

    return playerDoc.data() as FirestorePlayer;
  } catch (error) {
    console.error('Fehler beim Abrufen des Spielers nach ID:', error);
    throw error;
  }
};

/**
 * Gastspieler erstellen
 */
export const createGuestPlayer = async (nickname: string, initialGroupId?: string): Promise<FirestorePlayer> => {
  return createPlayer(nickname, null, initialGroupId);
};

/**
 * Mock-Player für Offline-Modus oder Entwicklungsumgebung
 */
const createMockPlayer = (nickname: string, userId?: string): FirestorePlayer => {
  const playerId = nanoid();
  
  return {
    id: playerId,
    nickname,
    userId: userId || null,
    isGuest: !userId,
    createdAt: new Date().toISOString(), // Für Mock verwenden wir einen String statt Timestamp
    groupIds: [],
    metadata: { isMock: true }
  };
}; 