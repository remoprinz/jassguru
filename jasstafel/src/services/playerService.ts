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
import {
  getDocFromServer,
  addDoc,
  collection,
  updateDoc,
  arrayRemove,
  arrayUnion
} from "firebase/firestore";
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
      metadata: {
        isOG: true, // Original Jasster Auszeichnung für frühe Nutzer
      },
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
 * Ergänzt fehlende Felder (photoURL, statusMessage) aus dem users-Dokument, falls sie im players-Dokument fehlen
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

    // Basisspielerdaten aus dem players-Dokument
    const playerData = playerDoc.data() as FirestorePlayer;
    
    // WICHTIG: Stellen wir sicher, dass die ID korrekt gesetzt ist
    playerData.id = playerDoc.id;

    // Überprüfen, ob bestimmte Felder fehlen und ergänzen aus users-Dokument
    if ((!playerData.photoURL || !playerData.statusMessage) && playerData.userId) {
      try {
        console.log(`getPlayerById: Feld(er) fehlen, versuche Daten aus users/${playerData.userId} zu ergänzen`);
        const userDocRef = doc(db, "users", playerData.userId);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          // Fehlende Felder ergänzen, ohne die vorhandenen zu überschreiben
          if (!playerData.photoURL && userData.photoURL) {
            console.log(`getPlayerById: Ergänze fehlendes photoURL aus users-Dokument für Player ${playerId}`);
            playerData.photoURL = userData.photoURL;
          }
          if (!playerData.statusMessage && userData.statusMessage) {
            console.log(`getPlayerById: Ergänze fehlendes statusMessage aus users-Dokument für Player ${playerId}`);
            playerData.statusMessage = userData.statusMessage;
          }
        } else {
          console.log(`getPlayerById: Kein users-Dokument gefunden für userId ${playerData.userId}`);
        }
      } catch (userError) {
        // Fehlschlag beim Abrufen der User-Daten nicht kritisch, wir verwenden was wir haben
        console.warn(`getPlayerById: Fehler beim Ergänzen aus users-Dokument:`, userError);
      }
    }

    return playerData;
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
 * Ergänzt fehlende Felder (photoURL, statusMessage) aus dem users-Dokument.
 * 
 * @param playerIds Array von Player-IDs, deren Existenz überprüft/sichergestellt werden soll
 * @param groupId ID der Gruppe, mit der diese Spieler verknüpft sind (für Platzhalter-Erstellung)
 * @returns Array der tatsächlich existierenden/erstellten Player-Dokumente
 */
export const ensurePlayersExist = async (
  playerIds: string[],
  groupId: string
): Promise<FirestorePlayer[]> => {
  if (!collections.players) {
    console.warn("ensurePlayersExist: players collection not available (offline?). Returning empty array.");
    return [];
  }
  
  if (!playerIds || playerIds.length === 0) {
    return [];
  }

  let dataWasHealed = false;

  try {
    const validPlayerIds = playerIds.filter((id): id is string => 
        typeof id === 'string' && id.trim() !== ''
    );

    const memberPromises = validPlayerIds.map(async (idToCheck) => {
      try {
        // Wir verwenden getPlayerById, die jetzt fehlende Felder ergänzt
        const playerDoc = await getPlayerById(idToCheck);
        if (playerDoc) {
          return playerDoc;
        }

        // Spieler nicht gefunden, prüfen ob es eine userId ist und versuchen zu heilen
        const userRef = doc(db, USERS_COLLECTION, idToCheck);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data()?.playerId) {
          const correctPlayerId = userSnap.data()?.playerId;
          // Auch hier nutzen wir getPlayerById für die Ergänzung fehlender Felder
          const correctedPlayerDoc = await getPlayerById(correctPlayerId);

          if (correctedPlayerDoc) {
            // Selbstheilung der Gruppen-Daten
            try {
              const groupRef = doc(db, "groups", groupId); // Verwende groupId
              await updateDoc(groupRef, { playerIds: arrayRemove(idToCheck) });
              await updateDoc(groupRef, { playerIds: arrayUnion(correctPlayerId) });
              dataWasHealed = true;
              console.log(`[ensurePlayersExist] ✅ Gruppen-Daten automatisch geheilt: ${idToCheck} -> ${correctPlayerId} in Gruppe ${groupId}`);
            } catch (updateError) {
              console.error(`[ensurePlayersExist] ❌ Fehler bei Datenkorrektur für Gruppe ${groupId}:`, updateError);
            }
            return correctedPlayerDoc;
          }
        }

        // Wenn alles fehlschlägt, erstelle einen Platzhalter
        console.warn(`[ensurePlayersExist] Konnte keine Zuordnung für ID ${idToCheck} finden. Erstelle Platzhalter.`);
        return {
          id: idToCheck,
          nickname: `Unbekannter Spieler ${idToCheck.slice(0, 4)}...`,
          userId: null,
          isGuest: false, // Annahme: Ein Platzhalter ist eher kein expliziter Gast
          createdAt: Timestamp.fromDate(new Date()),
          updatedAt: Timestamp.fromDate(new Date()),
          groupIds: [groupId],
          stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
          _isPlaceholder: true // Markierung für UI-Behandlung
        } as FirestorePlayer;
      } catch (error) {
        console.error(`[ensurePlayersExist] Fehler beim Laden/Korrigieren von ID ${idToCheck}:`, error);
        return null;
      }
    });

    const memberResults = await Promise.all(memberPromises);
    const validMembers = memberResults.filter((member): member is FirestorePlayer => member !== null);
    
    if (dataWasHealed) {
        // Optional: Hier könnte man eine Benachrichtigung triggern, aber Services sollten UI-agnostisch sein.
        console.log(`[ensurePlayersExist] Datenheilung für Gruppe ${groupId} abgeschlossen.`);
    }

    return validMembers;
  } catch (err) {
    console.error("[ensurePlayersExist] Schwerwiegender Fehler beim Laden der Mitgliederdetails:", err);
    throw new Error("Mitgliederdetails konnten nicht sichergestellt werden.");
  }
};

/**
 * Lädt alle Mitglieder einer Gruppe, stellt deren Existenz sicher (mit Selbstheilung)
 * und sortiert sie absteigend nach der Anzahl gespielter Spiele.
 *
 * @param groupId Die ID der Gruppe.
 * @returns Ein Promise, das ein Array von sortierten FirestorePlayer-Objekten auflöst.
 */
export const getGroupMembersSortedByGames = async (groupId: string): Promise<FirestorePlayer[]> => {
    if (!collections.groups) {
        console.warn("getGroupMembersSortedByGames: groups collection not available.");
        return [];
    }

    try {
        const groupRef = doc(collections.groups, groupId);
        const groupSnap = await getDoc(groupRef);

        if (!groupSnap.exists()) {
            console.warn(`getGroupMembersSortedByGames: Group with id ${groupId} not found.`);
            return [];
        }

        const groupData = groupSnap.data();
        const playerIds = groupData?.playerIds as string[] | undefined;

        if (!playerIds || playerIds.length === 0) {
            return []; // Keine Mitglieder in der Gruppe
        }

        // Stelle sicher, dass alle Spieler existieren und lade ihre Daten
        const members = await ensurePlayersExist(playerIds, groupId);

        // Sortiere die Mitglieder nach gamesPlayed absteigend
        const sortedMembers = [...members].sort((a, b) => 
            (b.stats?.gamesPlayed ?? 0) - (a.stats?.gamesPlayed ?? 0)
        );

        return sortedMembers;
      
    } catch (error) {
        console.error(`Fehler beim Laden und Sortieren der Mitglieder für Gruppe ${groupId}:`, error);
        throw new Error("Mitglieder konnten nicht geladen oder sortiert werden.");
    }
};

// Zukünftige Funktionen (updatePlayerStats, etc.) können hier hinzugefügt werden.
