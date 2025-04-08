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
  auth
} from "./firebaseInit";
import { getDocFromServer, addDoc, collection } from "firebase/firestore";
import type { AuthUser } from "@/types/auth";
import type { FirestorePlayer } from "@/types/jass";
import {nanoid} from "nanoid";
import {PLAYERS_COLLECTION, USERS_COLLECTION} from "../constants/firestore";

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
      metadata: {},
    };

    await setDoc(doc(collections.players, playerId), playerData);

    // Player ID zum User-Dokument hinzufügen, wenn der Spieler kein Gast ist
    if (authUser && collections.users) {
      const userRef = doc(collections.users, authUser.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        await setDoc(userRef, {playerId}, {merge: true});
      }
    }

    return playerData;
  } catch (error) {
    console.error("Fehler beim Erstellen des Spielers:", error);
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
    const q = query(collections.players, where("nickname", "==", nickname));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    return querySnapshot.docs[0].data() as FirestorePlayer;
  } catch (error) {
    console.error("Fehler beim Abrufen des Spielers nach Nickname:", error);
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
    const q = query(collections.players, where("userId", "==", userId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    return querySnapshot.docs[0].data() as FirestorePlayer;
  } catch (error) {
    console.error("Fehler beim Abrufen des Spielers nach User-ID:", error);
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
    console.error("Fehler beim Abrufen des Spielers nach ID:", error);
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
    metadata: {isMock: true},
  };
};

/**
 * Findet ODER erstellt ein Player-Dokument für einen User und stellt die Verknüpfung im User-Dokument sicher.
 * Priorisiert die im User-Dokument gespeicherte playerId.
 * Verhindert die Erstellung von Duplikaten.
 *
 * @param userId Die Firebase Auth User ID.
 * @param displayName Der Anzeigename des Users (wird für initialen Nickname verwendet).
 * @return Die ID des Player-Dokuments oder null bei schweren Fehlern.
 */
export const getPlayerIdForUser = async (userId: string, displayName: string | null): Promise<string | null> => {
  if (!db || !userId) {
    console.error("getPlayerIdForUser: Ungültige Parameter (db, userId).");
    return null;
  }

  const playersRef = collection(db, PLAYERS_COLLECTION);
  const userDocRef = doc(db, USERS_COLLECTION, userId);

  try {
    // --- Schritt 1: Lese User-Dokument --- 
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      // --- Fall 1.1: playerId im User-Dokument vorhanden --- 
      if (userData?.playerId && typeof userData.playerId === 'string') {
        const existingPlayerId = userData.playerId;
        const playerRef = doc(db, PLAYERS_COLLECTION, existingPlayerId);
        const playerSnap = await getDoc(playerRef);
        if (playerSnap.exists()) {
          return existingPlayerId;
        } else {
          // Inkonsistenz: playerId im User-Doc, aber Player-Doc fehlt! 
          console.warn(`getPlayerIdForUser: PlayerId ${existingPlayerId} found in user ${userId}, but player document MISSING! Clearing invalid playerId and attempting fallback/create.`);
          try {
             await setDoc(userDocRef, { playerId: null, updatedAt: serverTimestamp() }, { merge: true }); 
          } catch (deleteError) {
             console.error(`getPlayerIdForUser: Failed to set invalid playerId to null for user ${userId}:`, deleteError);
          }
          // Gehe weiter zu Schritt 2 (Query Fallback)
        }
      }
      // --- Fall 1.2: User-Dokument existiert, aber KEINE playerId --- 
    }

    // --- Schritt 2: Query Fallback (nur wenn Schritt 1 keine gültige, existierende playerId lieferte) --- 
    const playerQuery = query(playersRef, where("userId", "==", userId));
    const querySnapshot = await getDocs(playerQuery);

    if (!querySnapshot.empty) {
      // --- Fall 2.1: Spieler über Query gefunden --- 
      if (querySnapshot.size > 1) {
        // Sollte nicht passieren, aber loggen!
        console.warn(`getPlayerIdForUser: WARNING - Found MULTIPLE (${querySnapshot.size}) players via query for userId ${userId}! Using the first one found.`);
      }
      const foundPlayerId = querySnapshot.docs[0].id;
      console.log(`getPlayerIdForUser: Player ${foundPlayerId} found via query fallback for User ${userId}.`);
      
      // --- WICHTIG: Gefundene ID im User-Dokument speichern/aktualisieren --- 
      try {
        await setDoc(userDocRef, 
            { 
              playerId: foundPlayerId, 
              updatedAt: serverTimestamp(), 
            }, 
            { merge: true });
      } catch (userUpdateError) {
        console.error(`getPlayerIdForUser: FAILED to store/update found playerId ${foundPlayerId} in user document ${userId}:`, userUpdateError);
      }
      return foundPlayerId;
    }

    // --- Schritt 3 & 4 entfernt: Player-Erstellung wird durch onCreateUserDocument Cloud Function gehandhabt ---
    // Die Funktion sollte hier null zurückgeben, wenn keine PlayerId gefunden wurde.
    // Der Aufrufer (z.B. authStore) muss damit umgehen, dass die ID evtl. erst später verfügbar ist.
    console.warn(`getPlayerIdForUser: No PlayerId found for User ${userId} via user document or query. Cloud Function onCreateUserDocument should handle creation.`);
    return null;

  } catch (error) {
    console.error(`getPlayerIdForUser: General error processing userId ${userId}:`, error);
    return null;
  }
};

/**
 * Ruft ein einzelnes Player-Dokument anhand seiner ID ab.
 * Beinhaltet eine detailliertere Fehlerbehandlung.
 */
export const getPlayerDocument = async (playerId: string): Promise<FirestorePlayer | null> => {
  if (!db || !playerId) {
    console.error("getPlayerDocument: Ungültige Parameter (db, playerId).");
    return null;
  }

  const playerDocRef = doc(db, PLAYERS_COLLECTION, playerId);

  try {
    const playerDocSnap = await getDoc(playerDocRef);

    if (playerDocSnap.exists()) {
      return {id: playerDocSnap.id, ...playerDocSnap.data()} as FirestorePlayer;
    } else {
      console.log(`getPlayerDocument: Kein Dokument gefunden für playerId ${playerId}.`);
      return null;
    }
  } catch (error: unknown) {
    console.error(`getPlayerDocument: Fehler beim Abrufen des Dokuments für playerId ${playerId}:`, error);
    // Prüfe auf spezifische Fehlercodes, wenn nötig
    if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') {
      console.error(`getPlayerDocument: BERECHTIGUNGSFEHLER beim Lesen von Player ${playerId}.`);
      // Eventuell einen spezifischen Wert oder einen Fehler werfen, um dem Aufrufer dies mitzuteilen?
      // Aktuell geben wir null zurück, was vom Frontend als "nicht gefunden" interpretiert wird.
      // Besser wäre es, den Fehler weiterzugeben oder einen Status zurückzugeben.
    }
    // Gib null zurück, um das aktuelle Verhalten beizubehalten, aber mit detaillierterem Logging.
    return null;
  }
};

/**
 * Stellt sicher, dass für jede playerId in einer Gruppe ein gültiges Player-Dokument existiert.
 * Erstellt fehlende Player-Dokumente als Platzhalter, wenn notwendig.
 * 
 * @param playerIds Array von Player-IDs, deren Existenz überprüft/sichergestellt werden soll
 * @param groupId ID der Gruppe, mit der diese Spieler verknüpft sind (für Platzhalter-Erstellung)
 * @returns Array der tatsächlich existierenden/erstellten Player-Dokumente
 */
export const ensurePlayersExist = async (
  playerIds: string[],
  groupId: string
): Promise<FirestorePlayer[]> => {
  if (!db) {
    console.error("ensurePlayersExist: Firestore ist nicht initialisiert.");
    return [];
  }
  
  if (!playerIds || playerIds.length === 0) {
    return [];
  }

  const validPlayers: FirestorePlayer[] = [];
  const missingPlayerIds: string[] = [];

  // Schritt 1: Überprüfen, welche Player-Dokumente bereits existieren
  for (const playerId of playerIds) {
    try {
      const player = await getPlayerDocument(playerId);
      if (player) {
        validPlayers.push(player);
      } else {
        missingPlayerIds.push(playerId);
      }
    } catch (error) {
      console.error(`ensurePlayersExist: Fehler beim Prüfen von Player ${playerId}:`, error);
      missingPlayerIds.push(playerId);
    }
  }

  // Wenn alle Player existieren, sind wir fertig
  if (missingPlayerIds.length === 0) {
    return validPlayers;
  }

  console.log(`ensurePlayersExist: ${missingPlayerIds.length} fehlende Player-Dokumente gefunden für Gruppe ${groupId}.`);

  // Schritt 2: Für fehlende Player-IDs Platzhalter erstellen
  for (const missingPlayerId of missingPlayerIds) {
    try {
      const playerRef = doc(db, PLAYERS_COLLECTION, missingPlayerId);
      
      // Versuche zunächst, eine Zuordnung zu einem User zu finden (falls Inkonsistenz entstand)
      // Dies ist ein "Best Effort"-Versuch
      const usersQuery = query(collection(db, USERS_COLLECTION), where("playerId", "==", missingPlayerId));
      const userSnapshot = await getDocs(usersQuery);
      
      let userId = null;
      let nickname = `Spieler_${missingPlayerId.substring(0, 6)}`;
      
      if (!userSnapshot.empty) {
        // Wir haben einen User gefunden, der mit dieser playerId verknüpft ist!
        const userData = userSnapshot.docs[0].data();
        userId = userSnapshot.docs[0].id;
        nickname = userData.displayName || nickname;
        console.log(`ensurePlayersExist: Zugehörigen User ${userId} zu Player ${missingPlayerId} gefunden.`);
      }
      
      // Erstelle den Platzhalter-Player
      const placeholderData: FirestorePlayer = {
        id: missingPlayerId,
        nickname: nickname,
        userId: userId,
        isGuest: !userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        groupIds: [groupId],
        stats: {
          gamesPlayed: 0,
          wins: 0,
          totalScore: 0,
        },
        metadata: {
          isPlaceholder: true,
          createdByEnsurePlayersExist: true,
          createdAt: new Date().toISOString()
        }
      };
      
      // ID wird nicht in Firestore geschrieben, nur als Teil des Dokument-Pfads verwendet
      const { id, ...dataToSave } = placeholderData;
      
      await setDoc(playerRef, dataToSave);
      console.log(`ensurePlayersExist: Platzhalter für Player ${missingPlayerId} erstellt.`);
      
      validPlayers.push(placeholderData);
      
    } catch (error) {
      console.error(`ensurePlayersExist: Fehler beim Erstellen des Platzhalters für ${missingPlayerId}:`, error);
    }
  }

  return validPlayers;
};

// Zukünftige Funktionen (updatePlayerStats, etc.) können hier hinzugefügt werden.
