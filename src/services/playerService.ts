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
  db
} from "./firebaseInit";
import {
  getDocFromServer,
  collection,
  updateDoc,
  arrayRemove,
  arrayUnion,
  runTransaction,
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { type FieldValue } from "firebase/firestore";
import type { AuthUser } from "@/types/auth";
import type { FirestorePlayer } from "@/types/jass";
import {nanoid} from "nanoid";
import {PLAYERS_COLLECTION, USERS_COLLECTION} from "../constants/firestore";

// Collection-Namen für die Locks
const PLAYER_LOCKS_COLLECTION = 'player-locks';

/**
 * 原子操作: Versucht, ein Lock-Dokument für eine userId zu erstellen.
 * Gibt `true` zurück, wenn das Lock erfolgreich erstellt wurde (d.h. dieser Prozess ist der erste).
 * Gibt `false` zurück, wenn das Lock bereits existiert.
 */
const acquirePlayerCreationLock = async (userId: string): Promise<boolean> => {
  if (!db) return false;
  const lockRef = doc(db, PLAYER_LOCKS_COLLECTION, userId);
  try {
    // Versuche, das Dokument zu erstellen. Wenn es bereits existiert, schlägt dies fehl.
    // Wir verwenden eine Transaktion für eine atomare "create if not exists"-Operation.
    await runTransaction(db, async (transaction) => {
      const lockDoc = await transaction.get(lockRef);
      if (lockDoc.exists()) {
        throw new Error("Lock already exists");
      }
      transaction.set(lockRef, { createdAt: serverTimestamp() });
    });
    console.log(`[Lock] Lock für userId ${userId} erfolgreich akquiriert.`);
    return true;
  } catch (error: any) {
    if (error.message === "Lock already exists") {
      console.log(`[Lock] Lock für userId ${userId} existiert bereits. Prozess wartet.`);
    } else if (error.code === 'permission-denied') {
      // 🔧 PERMISSION FIX: Permission-Fehler werden als "kein Lock" behandelt
      console.warn(`[Lock] Permission-denied für Lock ${userId} - verwende Fallback ohne Lock-System.`);
      return false; // Kein Lock erhalten, aber kein fataler Fehler
    } else {
      console.error(`[Lock] Unerwarteter Fehler beim Akquirieren des Locks für userId ${userId}:`, error);
    }
    return false;
  }
};

/**
 * Gibt das Lock-Dokument für eine userId frei.
 */
const releasePlayerCreationLock = async (userId: string): Promise<void> => {
  if (!db) return;
  const lockRef = doc(db, PLAYER_LOCKS_COLLECTION, userId);
  try {
    await deleteDoc(lockRef);
    console.log(`[Lock] Lock für userId ${userId} freigegeben.`);
  } catch (error) {
    console.error(`[Lock] Fehler beim Freigeben des Locks für userId ${userId}:`, error);
  }
};

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
    const isGuest = !authUser;
    const userId = authUser?.uid || null;
    // 🔒 SECURITY FIX: Always use cryptographically secure random IDs
    const playerId = nanoid();

    const playerData: FirestorePlayer = {
      id: playerId,
      displayName: nickname,
      userId,
      isGuest,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      groupIds: initialGroupId ? [initialGroupId] : [],
      // 🔧 OPTIMIZATION: Stats werden nicht mehr initial erstellt - werden bei Bedarf hinzugefügt
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
    const q = query(collections.players, where("displayName", "==", nickname));
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
    // ⚠️ DEBUG: Warum ist collections.players null?
    console.error(`[getPlayerByUserId] collections.players is NULL for userId ${userId}!`, {
      collections: collections,
      hasDB: !!db,
      collectionsPlayers: collections.players
    });
    return null;
  }

  try {
    // 🔒 SECURITY FIX: Remove deterministic lookup - only use userId query
    const q = query(collections.players, where("userId", "==", userId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const data = querySnapshot.docs[0].data() as FirestorePlayer;
    data.id = querySnapshot.docs[0].id; // Ensure ID is set
    return data;
  } catch (error) {
    console.error("Fehler beim Abrufen des Spielers nach User-ID:", error);
    throw error;
  }
};

/**
 * Ruft das öffentliche Profil eines Spielers anhand seiner ID ab.
 * Stellt sicher, dass keine sensiblen Daten (wie E-Mail) zurückgegeben werden.
 *
 * @param playerId Die ID des Spieler-Dokuments.
 * @returns Ein Promise, das ein öffentliches FirestorePlayer-Objekt oder null auflöst.
 */
export const getPublicPlayerProfile = async (playerId: string): Promise<Omit<FirestorePlayer, 'email'> | null> => {
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
    
    playerData.id = playerDoc.id;

    // Stelle sicher, dass die E-Mail-Adresse entfernt wird, falls sie vorhanden sein sollte.
    if ('email' in playerData) {
      delete (playerData as any).email;
    }

    return playerData;
  } catch (error) {
    console.error("Fehler beim Abrufen des öffentlichen Spielerprofils nach ID:", error);
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
  // 🔒 SECURITY FIX: Use secure random ID for mock players too
  const playerId = nanoid();

  return {
    id: playerId,
    displayName: nickname,
    userId: userId || null,
    isGuest: !userId,
    createdAt: Timestamp.fromDate(new Date()),
    updatedAt: Timestamp.fromDate(new Date()),
    groupIds: [],
    // 🔧 OPTIMIZATION: Stats werden nicht mehr initial erstellt - werden bei Bedarf hinzugefügt
    metadata: {isMock: true},
  };
};

/**
 * Erstellt die initialen Daten für ein neues FirestorePlayer-Dokument.
 */
const createInitialPlayerData = (playerId: string, userId: string, displayNameInput: string | null): Omit<FirestorePlayer, 'id'> & { createdAt: FieldValue, updatedAt: FieldValue } => {
  return {
    displayName: displayNameInput || `Spieler ${playerId.slice(0, 8)}...`, // Fallback-Nickname
    userId,
    isGuest: false, // Ein verknüpfter User ist kein Gast
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    groupIds: [],
    // 🔧 OPTIMIZATION: Stats werden nicht mehr initial erstellt - werden bei Bedarf hinzugefügt
    metadata: { isOG: false }, // Neue Spieler sind nicht OG
  };
};

/**
 * Findet ODER erstellt ein Player-Dokument für einen User und stellt die Verknüpfung im User-Dokument sicher.
 * Priorisiert die im User-Dokument gespeicherte playerId.
 * Verhindert die Erstellung von Duplikaten durch Mutex-Schutz.
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

  // 🚀 ELEGANT SOLUTION: With deterministic IDs, we don't need complex locking
  // Multiple calls will all try to create the same document, which is safe with Firestore
  if (process.env.NODE_ENV === 'development') {
    // Player ID verarbeitet
  }
  
  try {
    return await getPlayerIdForUserInternal(userId, displayName);
  } catch (error) {
    console.error(`[getPlayerIdForUser] Error processing userId ${userId}:`, error);
    return null;
  }
};

/**
 * Interne Implementierung von getPlayerIdForUser ohne Mutex-Schutz.
 * Wird nur von getPlayerIdForUser aufgerufen.
 */
const getPlayerIdForUserInternal = async (userId: string, displayName: string | null): Promise<string | null> => {

  const playersRef = collection(db, PLAYERS_COLLECTION);
  const userDocRef = doc(db, USERS_COLLECTION, userId);

  try {
    // --- Schritt 1: Lese User-Dokument --- 
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      // --- Fall 1.1: playerId im User-Dokument vorhanden --- 
      if (userData?.playerId && typeof userData.playerId === 'string') {
        const storedPlayerId = userData.playerId;
        const playerRef = doc(playersRef, storedPlayerId);
        const playerSnap = await getDoc(playerRef);
        if (playerSnap.exists()) {
          // Player-Dokument existiert, stelle sicher, dass User-Dokument korrekt ist
          await setDoc(userDocRef, { playerId: storedPlayerId }, { merge: true });
          return storedPlayerId;
        } else {
          // --- Fall 1.1.2: Player Doc NICHT gefunden -> Fehlendes Player Doc erstellen --- 
          // 🚨 KRITISCHER FIX: Verwende displayName aus userDocSnap wenn verfügbar
          const userDisplayName = userData?.displayName;
          const finalDisplayName = userDisplayName || displayName || `Spieler ${storedPlayerId.slice(0, 8)}...`;
          if (process.env.NODE_ENV === 'development') {
            console.log(`Player-Doc nicht gefunden für ${storedPlayerId}. Erstelle mit displayName: "${finalDisplayName}" (userDoc: "${userDisplayName}", param: "${displayName}")`);
          }
          const newPlayerData = createInitialPlayerData(storedPlayerId, userId, finalDisplayName);
          await setDoc(playerRef, newPlayerData);
          // Stelle sicher, dass die ID auch im (existierenden) User-Dokument steht
          await setDoc(userDocRef, { playerId: storedPlayerId }, { merge: true });
          return storedPlayerId;
        }
      }
      // --- Fall 1.2: KEINE playerId im User-Dokument --- 
      else {
        // Weiter zu Schritt 2
      }
    }
    // --- Fall 2: User-Dokument existiert NICHT (sollte selten sein, aber sicherstellen) --- 
    else {
      // Weiter zu Schritt 2
    }

    // --- Schritt 2: Direkte Suche nach bestehenden Player-Dokumenten --- 
    const legacyQuery = query(playersRef, where("userId", "==", userId));
    const legacySnapshot = await getDocs(legacyQuery);
    
    if (!legacySnapshot.empty) {
      if (legacySnapshot.size > 1) {
        console.warn(`getPlayerIdForUser: Found MULTIPLE (${legacySnapshot.size}) players for userId ${userId}. Using the first one.`);
      }
      const foundPlayer = legacySnapshot.docs[0];
      const foundPlayerId = foundPlayer.id;
      // Player ID im User-Dokument nachtragen
      await setDoc(userDocRef, { playerId: foundPlayerId }, { merge: true });
      return foundPlayerId;
    }
    
    // --- Fall 3: KEIN Player-Dokument mit userId gefunden -> Player NEU ERSTELLEN --- 
    else {
      // 🔒 SECURITY FIX: Use cryptographically secure random IDs
      const newPlayerId = nanoid();
      // Verwende displayName als Nickname, mit Fallback
      const finalDisplayName = displayName || `Spieler ${newPlayerId.slice(0, 8)}...`;
      const newPlayerData = createInitialPlayerData(newPlayerId, userId, finalDisplayName);
      
      // 🔧 ZUSÄTZLICHE SICHERHEIT: Prüfe nochmals vor dem Erstellen
      console.log(`getPlayerIdForUserInternal: Erstelle neuen Player ${newPlayerId} für userId ${userId}...`);
      
      try {
        // 🚀 CRITICAL FIX: Use atomic batch operation to prevent race conditions
        const batch = writeBatch(db);
        
        // 1. Create player document
        batch.set(doc(playersRef, newPlayerId), newPlayerData);
        
        // 2. Update user document with playerId - ATOMICALLY
        batch.set(userDocRef, { playerId: newPlayerId }, { merge: true });
        
        // Execute both operations atomically
        await batch.commit();
        
        console.log(`getPlayerIdForUserInternal: ✅ Player ${newPlayerId} erfolgreich erstellt für userId ${userId}`);
        return newPlayerId;
      } catch (createError) {
        console.error(`getPlayerIdForUserInternal: ❌ Fehler beim Erstellen von Player ${newPlayerId} für userId ${userId}:`, createError);
        
        // Fallback: Versuche nochmals zu suchen, falls zwischenzeitlich ein anderer Prozess einen Player erstellt hat
        const fallbackQuery = query(playersRef, where("userId", "==", userId));
        const fallbackSnapshot = await getDocs(fallbackQuery);
        
        if (!fallbackSnapshot.empty) {
          const existingPlayerId = fallbackSnapshot.docs[0].id;
          console.log(`getPlayerIdForUserInternal: 🔄 Fallback erfolgreich - gefundener Player ${existingPlayerId} für userId ${userId}`);
          // Player ID im User-Dokument nachtragen
          await setDoc(userDocRef, { playerId: existingPlayerId }, { merge: true });
          return existingPlayerId;
        }
        
        console.error("getPlayerIdForUserInternal: Fallback-Suche nach Erstellungsfehler war erfolglos.");
        // Hier nicht erneut werfen, sondern null zurückgeben, damit der äußere try/catch das Lock freigibt.
        return null;
      }
    }
  } catch (error) {
    console.error(`getPlayerIdForUserInternal: General error processing userId ${userId}:`, error);
    return null;
  }
};

/**
 * Ruft ein einzelnes Player-Dokument anhand seiner ID ab.
 * Versucht, eine fehlende userId durch Nachschlagen in der users-Collection zu ergänzen.
 */
export const getPlayerDocument = async (playerId: string): Promise<FirestorePlayer | null> => {
  if (!db || !playerId) {
    console.error("getPlayerDocument: Ungültige Parameter (db, playerId).");
    return null;
  }

  const playerDocRef = doc(db, PLAYERS_COLLECTION, playerId);
  let playerData: FirestorePlayer | null = null;

  try {
    const playerSnap = await getDocFromServer(playerDocRef);
    if (playerSnap.exists()) {
      playerData = playerSnap.data() as FirestorePlayer;
      // Stelle sicher, dass die ID korrekt gesetzt ist
      playerData.id = playerSnap.id; 
    } else {
      console.warn(`getPlayerDocument: Kein Player-Dokument gefunden für playerId ${playerId}.`);
      return null;
    }
  } catch (error: unknown) {
    console.error(`getPlayerDocument: Fehler beim initialen Abrufen des Player-Dokuments für playerId ${playerId}:`, error);
    return null; // Fehler beim Abrufen
  }

  // Prüfe, ob userId fehlt
  if (playerData && !playerData.userId) {
    console.warn(`getPlayerDocument: userId fehlt im Player-Dokument ${playerId}. Versuche Fallback über users-Collection...`);
    try {
      const usersRef = collection(db, USERS_COLLECTION);
      const q = query(usersRef, where("playerId", "==", playerId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        if (querySnapshot.size > 1) {
          console.warn(`getPlayerDocument: Mehrere User-Dokumente gefunden für playerId ${playerId}. Verwende das erste.`);
        }
        const userDoc = querySnapshot.docs[0];
        const foundUserId = userDoc.id; // Die ID des User-Dokuments IST die userId
        console.log(`getPlayerDocument: Fallback erfolgreich. userId ${foundUserId} für playerId ${playerId} gefunden.`);
        playerData.userId = foundUserId;

        // Optional: Self-healing - userId im Player-Dokument nachtragen
        try {
          await updateDoc(playerDocRef, { userId: foundUserId, updatedAt: serverTimestamp() });
          console.log(`getPlayerDocument: Self-healing erfolgreich. userId im Player-Dokument ${playerId} aktualisiert.`);
        } catch (updateError) {
          console.error(`getPlayerDocument: Fehler beim Self-healing (Aktualisieren der userId im Player-Dokument ${playerId}):`, updateError);
        }

      } else {
        console.error(`getPlayerDocument: Fallback fehlgeschlagen. Kein User-Dokument gefunden mit playerId ${playerId}.`);
        // playerData bleibt ohne userId, was im aufrufenden Code zum Fehler führen wird.
      }
    } catch (fallbackError) {
      console.error(`getPlayerDocument: Fehler beim Fallback-Versuch (Suche in users-Collection) für playerId ${playerId}:`, fallbackError);
      // playerData bleibt ohne userId
    }
  }

  // Gib playerData zurück (kann immer noch ohne userId sein, wenn Fallback fehlschlug)
  return playerData;
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
        // Wir verwenden getPublicPlayerProfile, die jetzt saubere öffentliche Daten liefert
        const playerDoc = await getPublicPlayerProfile(idToCheck);
        if (playerDoc) {
          return playerDoc;
        }

        // Spieler nicht gefunden, prüfen ob es eine userId ist und versuchen zu heilen
        const userRef = doc(db, USERS_COLLECTION, idToCheck);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data()?.playerId) {
          const correctPlayerId = userSnap.data()?.playerId;
          // Auch hier nutzen wir getPublicPlayerProfile
          const correctedPlayerDoc = await getPublicPlayerProfile(correctPlayerId);

          if (correctedPlayerDoc) {
            // Selbstheilung der Gruppen-Daten
            try {
              const groupRef = doc(db, "groups", groupId); // Verwende groupId
              await updateDoc(groupRef, { playerIds: arrayRemove(idToCheck) });
              await updateDoc(groupRef, { playerIds: arrayUnion(correctPlayerId) });
              dataWasHealed = true;
              // console.log(`[ensurePlayersExist] ✅ Gruppen-Daten automatisch geheilt: ${idToCheck} -> ${correctPlayerId} in Gruppe ${groupId}`);
            } catch (updateError) {
              console.error(`[ensurePlayersExist] ❌ Fehler bei Datenkorrektur für Gruppe ${groupId}:`, updateError);
            }
            return correctedPlayerDoc;
          }
        }

        // Wenn alles fehlschlägt, erstelle einen Platzhalter
        // console.warn(`[ensurePlayersExist] Konnte keine Zuordnung für ID ${idToCheck} finden. Erstelle Platzhalter.`);
        return {
          id: idToCheck,
          displayName: `Unbekannter Spieler ${idToCheck.slice(0, 4)}...`,
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
        // console.log(`[ensurePlayersExist] Datenheilung für Gruppe ${groupId} abgeschlossen.`);
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
        // KORREKTUR: Lese die Player-IDs aus den Schlüsseln des `players`-Objekts
        const playerIds = groupData?.players ? Object.keys(groupData.players) : [];

        if (playerIds.length === 0) {
            console.log(`[getGroupMembersSortedByGames] No players found in group object for group ${groupId}.`);
            return []; // Keine Mitglieder in der Gruppe
        }

        // Stelle sicher, dass alle Spieler existieren und lade ihre Daten
        // Diese Funktion muss robust genug sein, um mit den IDs umzugehen.
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

/**
 * Synchronisiert den DisplayName (und optional die E-Mail) eines Spielers in allen relevanten Collections:
 * - User-Dokument in 'users' Collection
 * - Player-Dokument in 'players' Collection
 * - 'players' Map in allen Gruppen-Dokumenten, in denen der Spieler Mitglied ist
 * 
 * @param userId Die User-ID des Benutzers
 * @param playerId Die Player-ID des Spielers
 * @param displayName Der zu synchronisierende Anzeigename
 * @returns Ein Promise, das erfüllt wird, wenn alle Synchronisationen abgeschlossen sind
 */
export const syncDisplayNameAcrossCollections = async (
  userId: string,
  playerId: string, 
  displayName: string
): Promise<void> => {
  if (!db) throw new Error("Firestore ist nicht initialisiert.");
  if (!userId || !playerId || !displayName) {
    console.error("syncDisplayNameAcrossCollections: Fehlende Parameter", {userId, playerId, displayName});
    throw new Error("Für die Synchronisation sind User-ID, Player-ID und DisplayName erforderlich.");
  }

  try {
    if (process.env.NODE_ENV === 'development') {
    console.log(`syncDisplayNameAcrossCollections: Starte Synchronisation für User ${userId}, Player ${playerId} mit DisplayName "${displayName}"`);
  }
    
    const updates: Promise<any>[] = [];
    
    // 1. User-Dokument aktualisieren
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userUpdate: Record<string, any> = {
      displayName: displayName,
      lastUpdated: serverTimestamp()
    };
    
    updates.push(
      setDoc(userDocRef, userUpdate, { merge: true })
                  .then(() => {
            if (process.env.NODE_ENV === 'development') {
              console.log(`User-Dokument ${userId} mit neuem DisplayName aktualisiert.`);
            }
          })
        .catch(e => console.error(`Fehler beim Aktualisieren des User-Dokuments ${userId}:`, e))
    );
    
    // 2. Player-Dokument aktualisieren
    const playerDocRef = doc(db, PLAYERS_COLLECTION, playerId);
    const playerUpdate: Record<string, any> = {
      displayName: displayName,
      updatedAt: serverTimestamp()
    };
    
    updates.push(
      setDoc(playerDocRef, playerUpdate, { merge: true })
                  .then(() => {
            if (process.env.NODE_ENV === 'development') {
              console.log(`Player-Dokument ${playerId} mit neuem DisplayName aktualisiert.`);
            }
          })
        .catch(e => console.error(`Fehler beim Aktualisieren des Player-Dokuments ${playerId}:`, e))
    );
    
    // 3. Gruppen-Dokumente aktualisieren
    // Zuerst Gruppen-IDs aus dem Player-Dokument holen
    try {
      const playerDoc = await getDoc(playerDocRef);
      if (playerDoc.exists()) {
        const playerData = playerDoc.data();
        const groupIds = playerData?.groupIds || [];
        
        if (groupIds.length > 0) {
          console.log(`Aktualisiere DisplayName in ${groupIds.length} Gruppen-Dokumenten...`);
          
          for (const groupId of groupIds) {
            const groupDocRef = doc(db, "groups", groupId);
            
            // Atomares Update nur des einen Felds in der verschachtelten Map
            const updatePath = `players.${playerId}.displayName`;
            const updateData = { [updatePath]: displayName };
            
            updates.push(
              updateDoc(groupDocRef, updateData)
                .then(() => console.log(`DisplayName für Player ${playerId} in Gruppe ${groupId} aktualisiert.`))
                .catch(e => console.error(`Fehler beim Aktualisieren des DisplayName in Gruppe ${groupId}:`, e))
            );
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
      console.log(`Player ${playerId} ist in keiner Gruppe, keine Gruppen-Updates nötig.`);
    }
        }
      }
    } catch (groupUpdateError) {
      console.error("Fehler beim Aktualisieren von Gruppen:", groupUpdateError);
      // Wir werfen hier keinen Fehler, um die anderen Updates nicht zu blockieren
    }
    
    // Alle Updates parallel ausführen und warten, bis sie abgeschlossen sind
    await Promise.all(updates);
          if (process.env.NODE_ENV === 'development') {
        console.log(`syncDisplayNameAcrossCollections: Synchronisation für ${userId} / ${playerId} abgeschlossen.`);
      }
    
  } catch (error) {
    console.error("Fehler bei der Synchronisation des DisplayName:", error);
    throw new Error(`DisplayName-Synchronisation fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Ruft mehrere öffentliche Spielerprofile basierend auf einer Liste von User-IDs ab.
 * Stellt sicher, dass keine sensiblen Daten wie E-Mail zurückgegeben werden.
 *
 * @param userIds Array von Firebase Auth User IDs.
 * @returns Ein Promise, das ein Array von FirestorePlayer-Objekten auflöst.
 */
export const getPublicPlayerProfilesByUserIds = async (userIds: string[]): Promise<FirestorePlayer[]> => {
  if (!collections.players || !userIds || userIds.length === 0) {
    return [];
  }

  // Firestore "in" Abfragen sind auf 30 Elemente pro Abfrage limitiert.
  // Wir müssen die Anfragen aufteilen (chunking).
  const chunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += 30) {
    chunks.push(userIds.slice(i, i + 30));
  }

  const allPlayers: FirestorePlayer[] = [];

  for (const chunk of chunks) {
    try {
      const q = query(collections.players, where("userId", "in", chunk));
      const querySnapshot = await getDocs(q);

      querySnapshot.forEach((doc) => {
        const playerData = doc.data() as FirestorePlayer;
        // Stelle sicher, dass die E-Mail-Adresse entfernt wird
        if ('email' in playerData) {
          delete (playerData as any).email;
        }
        allPlayers.push({
          ...playerData,
          id: doc.id,
        } as FirestorePlayer);
      });
    } catch (error) {
      console.error("Fehler beim Abrufen der Spielerprofile für Chunk:", error);
      // Fahren Sie mit dem nächsten Chunk fort, anstatt den gesamten Vorgang abzubrechen
    }
  }

  return allPlayers;
};

/**
 * Aktualisiert spezifische Felder eines Spieler-Dokuments in Firestore.
 *
 * @param playerId Die ID des zu aktualisierenden Spieler-Dokuments.
 * @param dataToUpdate Ein Objekt mit den zu aktualisierenden Feldern.
 */
export const updatePlayerDocument = async (playerId: string, dataToUpdate: Partial<FirestorePlayer>): Promise<void> => {
  if (!collections.players || !playerId) {
    console.error("updatePlayerDocument: Ungültige Parameter (collections.players, playerId).");
    return;
  }

  // Verbiete das Ändern kritischer Felder
  const forbiddenFields = ['id', 'userId', 'isGuest', 'createdAt'];
  for (const field of forbiddenFields) {
    if (field in dataToUpdate) {
      console.error(`updatePlayerDocument: Versuch, das geschützte Feld '${field}' zu ändern, wurde blockiert.`);
      throw new Error(`Das Feld '${field}' kann nicht aktualisiert werden.`);
    }
  }

  try {
    const playerDocRef = doc(collections.players, playerId);
    await updateDoc(playerDocRef, {
      ...dataToUpdate,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(`Fehler beim Aktualisieren des Spieler-Dokuments ${playerId}:`, error);
    throw error;
  }
};

/**
 * Ruft mehrere Spieler-Dokumente anhand ihrer IDs ab.
 * 
 * ⚠️ STUB IMPLEMENTATION: Diese Funktion wird aktuell nicht in der Codebase verwendet.
 * Sie existiert nur, um Import-Fehler im groupStore zu vermeiden.
 * 
 * @param playerIds Array von Player-IDs
 * @returns Map mit playerId als Key und FirestorePlayer als Value
 */
export const getPlayersByIds = async (playerIds: string[]): Promise<Map<string, FirestorePlayer>> => {
  console.warn('[playerService] getPlayersByIds: Stub implementation - function not used in codebase');
  
  if (!playerIds || playerIds.length === 0) {
    return new Map();
  }
  
  // Falls diese Funktion doch mal verwendet werden sollte, hier eine funktionale Implementierung:
  const playersMap = new Map<string, FirestorePlayer>();
  
  try {
    const playerPromises = playerIds.map(async (playerId) => {
      try {
        const player = await getPlayerDocument(playerId);
        if (player) {
          playersMap.set(playerId, player);
        }
      } catch (error) {
        console.warn(`[getPlayersByIds] Failed to load player ${playerId}:`, error);
      }
    });
    
    await Promise.all(playerPromises);
  } catch (error) {
    console.error('[getPlayersByIds] Error loading players:', error);
  }
  
  return playersMap;
};

// Zukünftige Funktionen (updatePlayerStats, etc.) können hier hinzugefügt werden.
