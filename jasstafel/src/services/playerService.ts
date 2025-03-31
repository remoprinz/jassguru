import {
  collections,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  db,
} from './firebaseInit';
import { AuthUser, FirestorePlayer } from '../types/jass';
import { nanoid } from 'nanoid';
import { PLAYERS_COLLECTION } from '../constants/firestore';
import { addDoc, collection } from 'firebase/firestore';

/**
 * Erstellt einen neuen Spieler in Firestore
 */
export const createPlayer = async (
  nickname: string,
  authUser: AuthUser | null = null, // Null für Gastspieler
  initialGroupId?: string
): Promise<FirestorePlayer> => {
  // Offline-Modus oder Entwicklungsmodus prüfen
  if (!collections.players) {
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
      updatedAt: serverTimestamp(),
      groupIds: initialGroupId ? [initialGroupId] : [],
      stats: {
        gamesPlayed: 0,
        wins: 0,
        totalScore: 0,
      },
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
  if (!collections.players) {
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
  if (!collections.players) {
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
  if (!collections.players) {
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
 * Erstellt einen Mock-Spieler für die Offline-Entwicklung
 */
const createMockPlayer = (nickname: string, userId?: string): FirestorePlayer => {
  const playerId = nanoid();
  
  return {
    id: playerId,
    nickname,
    userId: userId || null,
    isGuest: !userId,
    createdAt: Timestamp.fromDate(new Date()),
    updatedAt: Timestamp.fromDate(new Date()),
    groupIds: [],
    stats: {
      gamesPlayed: 0,
      wins: 0,
      totalScore: 0,
    },
    metadata: { isMock: true }
  };
};

/**
 * Findet oder erstellt ein Player-Dokument für einen gegebenen User.
 * Sucht zuerst nach einem Player mit der userId. Wenn keiner existiert, wird ein neuer erstellt.
 *
 * @param userId Die Firebase Auth User ID.
 * @param displayName Der Anzeigename des Users (wird für den initialen Nickname verwendet).
 * @returns Die ID des gefundenen oder neu erstellten Player-Dokuments oder null bei Fehlern.
 */
export const getPlayerIdForUser = async (userId: string, displayName: string | null): Promise<string | null> => {
  if (!db) {
    console.error("getPlayerIdForUser: Firestore ist nicht initialisiert.");
    return null;
  }
  if (!userId) {
    console.error("getPlayerIdForUser: Ungültige userId.");
    return null;
  }

  const playersRef = collection(db, PLAYERS_COLLECTION);
  const q = query(playersRef, where("userId", "==", userId));

  try {
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const playerId = querySnapshot.docs[0].id;
      console.log(`getPlayerIdForUser: Vorhandener Spieler gefunden für User ${userId}: ${playerId}`);
      return playerId;
    } else {
      console.log(`getPlayerIdForUser: Kein Spieler gefunden für User ${userId}, erstelle neuen Spieler.`);
      const newPlayerData: Omit<FirestorePlayer, 'id'> = {
        userId: userId,
        nickname: displayName || `Spieler_${userId.substring(0, 6)}`,
        isGuest: false,
        stats: {
          gamesPlayed: 0,
          wins: 0,
          totalScore: 0,
        },
        groupIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const playerDocRef = await addDoc(playersRef, newPlayerData);
      console.log(`getPlayerIdForUser: Neuer Spieler erstellt mit ID: ${playerDocRef.id} für User ${userId}`);
      return playerDocRef.id;
    }
  } catch (error) {
    console.error(`getPlayerIdForUser: Fehler beim Suchen/Erstellen des Spielers für User ${userId}:`, error);
    return null;
  }
};

/**
 * Ruft das Player-Dokument anhand seiner ID ab.
 *
 * @param playerId Die ID des Player-Dokuments.
 * @returns Ein Promise, das das FirestorePlayer-Objekt oder null auflöst, wenn nicht gefunden oder Fehler.
 */
export const getPlayerDocument = async (playerId: string): Promise<FirestorePlayer | null> => {
  if (!db) {
    console.error("getPlayerDocument: Firestore ist nicht initialisiert.");
    return null;
  }
  if (!playerId) {
    console.warn("getPlayerDocument ohne playerId aufgerufen.");
    return null;
  }

  try {
    const playerRef = doc(db, PLAYERS_COLLECTION, playerId);
    const playerSnap = await getDoc(playerRef);

    if (playerSnap.exists()) {
      return { id: playerSnap.id, ...(playerSnap.data() as Omit<FirestorePlayer, 'id'>) };
    } else {
      console.log(`getPlayerDocument: Spieler-Dokument mit ID ${playerId} nicht gefunden.`);
      return null;
    }
  } catch (error) {
    console.error(`getPlayerDocument: Fehler beim Abrufen des Spieler-Dokuments ${playerId}:`, error);
    return null;
  }
};

// Zukünftige Funktionen (updatePlayerStats, etc.) können hier hinzugefügt werden.