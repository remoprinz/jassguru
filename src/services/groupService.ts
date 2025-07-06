// src/services/groupService.ts
// Enthält Funktionen zur Verwaltung von Jassgruppen in Firestore.

import {
  db,
  doc as firestoreDoc,
  collection,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  getDoc,
  auth,
} from "./firebaseInit";
// import { documentId } from "firebase/firestore"; // Entfernt
import {
  GROUPS_COLLECTION,
  PLAYERS_COLLECTION,
  // USERS_COLLECTION <-- Removed unused import
} from "../constants/firestore";
import type { FirestoreGroup, FirestorePlayer } from "@/types/jass"; // Korrigierter Import
// Importiere die Funktion zum Sicherstellen des Players (wird in Phase 2.2 erstellt/refaktorisiert)
import {getPlayerIdForUser, getPlayerDocument} from "./playerService";
// Importiere die neue Funktion zum Aktualisieren des Benutzerdokuments
import {updateUserDocument} from "./authService";
// import { FirestorePlayer } from '../types/jass'; <-- Removed unused import
// Import Storage functions
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {useGroupStore} from "@/store/groupStore"; // Importiere den GroupStore
import {useAuthStore} from "@/store/authStore"; // Importiere den AuthStore
import { addDoc, arrayUnion, arrayRemove, Timestamp, documentId, runTransaction } from "firebase/firestore"; // documentId hier hinzugefügt, arrayRemove und runTransaction importiert
import { DEFAULT_FARBE_SETTINGS } from "@/config/FarbeSettings"; // Nur die Konstante von hier
import { DEFAULT_SCORE_SETTINGS } from "@/config/ScoreSettings"; // Importiere DEFAULT_SCORE_SETTINGS
import { DEFAULT_STROKE_SETTINGS } from "@/config/GameSettings"; // Importiere DEFAULT_STROKE_SETTINGS
import type { FarbeSettings, StrokeSettings, ScoreSettings, PlayerId, GroupId } from "@/types/jass"; 

/**
 * Erstellt eine neue Jassgruppe in Firestore.
 * Verknüpft den Ersteller als Admin und Mitglied.
 * Aktualisiert das Player- und User-Dokument des Erstellers.
 *
 * @param userId Die Firebase Auth User ID des Erstellers.
 * @param userDisplayName Der Anzeigename des Erstellers (für Player-Nickname).
 * @param groupName Der Name der neuen Gruppe.
 * @return Das vollständige FirestoreGroup-Objekt der neu erstellten Gruppe.
 */
export const createGroup = async (
  userId: string,
  userDisplayName: string | null,
  groupName: string
): Promise<FirestoreGroup> => {
  if (!db) throw new Error("Firestore ist nicht initialisiert.");
  if (!userId) throw new Error("Ungültige Benutzer-ID.");
  if (!groupName || groupName.trim().length < 3 || groupName.trim().length > 50) {
    throw new Error("Ungültiger Gruppenname (muss 3-50 Zeichen lang sein).");
  }

  const trimmedGroupName = groupName.trim();
  const groupsCollectionRef = collection(db, GROUPS_COLLECTION);

  try {
    // NEU: Eindeutigkeitsprüfung für Gruppennamen
    const q = query(groupsCollectionRef, where("name", "==", trimmedGroupName));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      throw new Error(`Eine Gruppe mit dem Namen "${trimmedGroupName}" existiert bereits.`);
    }

    // 1. Player ID für den User sicherstellen
    if (process.env.NODE_ENV === 'development') {
    console.log(`createGroup: Getting playerId for user ${userId}...`);
  }
    const playerId = await getPlayerIdForUser(userId, userDisplayName);
    if (!playerId) {
      console.error(`createGroup: Could not get or create playerId for user ${userId}.`);
      throw new Error("Konnte keine Spieler-ID für den Benutzer finden oder erstellen.");
    }
          if (process.env.NODE_ENV === 'development') {
        console.log(`createGroup: Obtained playerId: ${playerId}`);
      }

    // 2. Neues Gruppen-Dokument erstellen
    const groupData = {
      name: trimmedGroupName,
      description: "Willkommen in unserer Jassrunde!",
      logoUrl: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId,
      adminIds: [userId],
      isPublic: true,
      // ✅ NEUE GRUPPE MIT KORREKTEN DEFAULT-EINSTELLUNGEN
      scoreSettings: DEFAULT_SCORE_SETTINGS,
      strokeSettings: DEFAULT_STROKE_SETTINGS,
      farbeSettings: DEFAULT_FARBE_SETTINGS,
      theme: 'yellow', // Default-Theme
      players: {
        [playerId]: {
          displayName: userDisplayName || "Unbekannt",
          email: auth.currentUser?.email || "",
          joinedAt: serverTimestamp() as unknown as Timestamp,
        },
      },
    };
          if (process.env.NODE_ENV === 'development') {
        console.log(`createGroup: Adding new group document with name '${trimmedGroupName}'...`);
      }
    const groupRef = await addDoc(groupsCollectionRef, groupData);
    const newGroupId = groupRef.id;
          if (process.env.NODE_ENV === 'development') {
        console.log(`createGroup: Successfully added group document with ID: ${newGroupId}`);
      }

    // NEU: Abrufen des gerade erstellten Dokuments, um das vollständige Objekt zurückzugeben
    const newGroupSnap = await getDoc(groupRef);

    // Korrigierter Spread Operator: Sicherstellen, dass data() ein Objekt ist
    if (!newGroupSnap.exists()) {
      console.error(`createGroup: Newly created group document ${newGroupId} not found immediately after creation.`);
      throw new Error("Konnte das neu erstellte Gruppendokument nicht abrufen.");
    }
    // Daten innerhalb des Blocks zuweisen und Typ explizit machen
    const groupDataFromSnap = newGroupSnap.data() as Omit<FirestoreGroup, 'id'>; 
    // Explizite Typzuweisung und Spread (sollte jetzt funktionieren)
    const newGroup: FirestoreGroup = { id: newGroupSnap.id, ...groupDataFromSnap };
          if (process.env.NODE_ENV === 'development') {
        console.log("createGroup: Successfully fetched newly created group object.");
      }

    // 3. Player-Dokument aktualisieren
    const playerRef = firestoreDoc(db, PLAYERS_COLLECTION, playerId);
          if (process.env.NODE_ENV === 'development') {
        console.log(`createGroup: Attempting to update player document ${playerId} to add groupId ${newGroupId}...`);
      }
    try {
      await updateDoc(playerRef, {
        groupIds: arrayUnion(newGroupId),
      });
              if (process.env.NODE_ENV === 'development') {
          console.log(`createGroup: Successfully updated player document ${playerId} with new groupId.`);
        }
      // Optional: Verify by fetching the player doc again immediately
      // const updatedPlayerDoc = await getPlayerDocument(playerId);
      // console.log("createGroup: Player doc groupIds after update:", updatedPlayerDoc?.groupIds);
    } catch (playerUpdateError) {
      console.error(`createGroup: FAILED to update player document ${playerId} with groupId ${newGroupId}:`, playerUpdateError);
      // Decide how to handle this: Throw error? Log and continue?
      // For now, log the error and throw a specific error to indicate partial success?
      throw new Error(`Gruppe erstellt (ID: ${newGroupId}), aber Spieler konnte nicht zur Gruppe hinzugefügt werden.`);
    }

    // 4. User-Dokument aktualisieren über den AuthService
          if (process.env.NODE_ENV === 'development') {
        console.log(`createGroup: Attempting to update user document ${userId} with lastActiveGroupId ${newGroupId}...`);
      }
    try {
      await updateUserDocument(userId, {lastActiveGroupId: newGroupId});
              if (process.env.NODE_ENV === 'development') {
          console.log(`createGroup: Successfully updated user document ${userId}.`);
        }
    } catch (userUpdateError) {
      // Log this error but maybe don't throw, as the group and player link exist
      console.error(`createGroup: FAILED to update user document ${userId} with lastActiveGroupId ${newGroupId}:`, userUpdateError);
    }

          if (process.env.NODE_ENV === 'development') {
        console.log(`Gruppe '${trimmedGroupName}' (ID: ${newGroupId}) erfolgreich erstellt für User ${userId}.`);
      }
    return newGroup; // Das vollständige Objekt zurückgeben
  } catch (error) {
    // Keep existing general error handling, but the specific errors above might provide more context
    console.error("Fehler beim Erstellen der Gruppe (Gesamt-Catch):"); // Add context
    // Avoid logging the error object itself again if it was already logged above
    if (!(error instanceof Error && error.message.includes("Spieler konnte nicht zur Gruppe hinzugefügt werden"))) {
      console.error(error); // Log the original error if it wasn't the player update error
    }

    if (error instanceof Error && error.message.startsWith("Eine Gruppe mit dem Namen")) {
      throw error;
    } else if (error instanceof Error && error.message.includes("Spieler konnte nicht zur Gruppe hinzugefügt werden")) {
      throw error; // Re-throw the specific error from player update catch block
    }
    throw new Error("Gruppe konnte nicht erstellt werden.");
  }
};

/**
 * Ruft die Daten einer einzelnen Jassgruppe anhand ihrer ID ab.
 *
 * @param groupId Die ID der abzurufenden Gruppe.
 * @return Das FirestoreGroup-Objekt oder null, wenn nicht gefunden.
 */
export const getGroupById = async (groupId: string): Promise<FirestoreGroup | null> => {
  if (!db) throw new Error("Firestore ist nicht initialisiert.");
  if (!groupId) {
    console.warn("getGroupById ohne groupId aufgerufen.");
    return null;
  }

  try {
    const groupRef = firestoreDoc(db, GROUPS_COLLECTION, groupId);
    const groupSnap = await getDoc(groupRef);

    if (groupSnap.exists()) {
      // Expliziter Typ für groupData
      const groupData = groupSnap.data() as Partial<FirestoreGroup>;
      // Stelle sicher, dass farbeSettings vorhanden sind oder setze Default
      const farbeSettings = groupData.farbeSettings ?? DEFAULT_FARBE_SETTINGS;

      // Kombiniere ID, Daten und farbeSettings - explizite Typzuweisung
      const finalGroup: FirestoreGroup = {
        id: groupSnap.id,
        ...groupData, // Spread des Partial<FirestoreGroup>
        farbeSettings: farbeSettings
      } as FirestoreGroup; // Cast am Ende beibehalten

      // --- ANREICHERUNG HIER EINFÜGEN, WENN NÖTIG ---
      // Wenn auch diese Funktion angereicherte Spieler braucht,
      // müsste hier eine ähnliche Logik wie in getUserGroupsByPlayerId eingefügt werden.
      // Beispiel (vereinfacht):
      // const playerIds = finalGroup.playerIds || [];
      // const enrichedPlayers = await fetchAndEnrichPlayers(playerIds, finalGroup.players); // Eigene Hilfsfunktion nötig
      // finalGroup.players = enrichedPlayers;
      // --- ENDE ANREICHERUNG BEISPIEL ---

      return finalGroup;
    } else {
      console.log(`Gruppe mit ID ${groupId} nicht gefunden.`);
      return null;
    }
  } catch (error) {
    console.error(`Fehler beim Abrufen der Gruppe ${groupId}:`, error);
    throw new Error("Fehler beim Abrufen der Gruppendaten.");
  }
};

/**
 * Ruft alle Gruppen ab, in denen ein Benutzer Mitglied ist.
 * @param userId Die ID des Benutzers.
 * @return Ein Promise, das ein Array von FirestoreGroup-Objekten auflöst.
 */
export const getUserGroups = async (userId: string): Promise<FirestoreGroup[]> => {
  if (!db) throw new Error("Firestore ist nicht initialisiert.");
  if (!userId) {
    console.warn("getUserGroups ohne userId aufgerufen.");
    return [];
  }

  try {
    // 1. Player ID für den User holen
    const playerId = await getPlayerIdForUser(userId, null);
    if (!playerId) {
      console.log(`Keine Spieler-ID für Benutzer ${userId} gefunden.`);
      return [];
    }

    // 2. Player-Dokument holen, um groupIds zu bekommen
    const playerDoc = await getPlayerDocument(playerId);

    if (!playerDoc || !playerDoc.groupIds || playerDoc.groupIds.length === 0) {
      console.log(`Spieler ${playerId} ist in keiner Gruppe (nach Prüfung des empfangenen playerDoc). groupIds:`, playerDoc?.groupIds);
      return [];
    }

    const groupIds = playerDoc.groupIds;

    // 3. Alle Gruppen-Dokumente für die gefundenen IDs holen
    const allGroups: FirestoreGroup[] = []; // Wird jetzt angereichert
    const foundGroupIds = new Set<string>(); // Zum Nachverfolgen gefundener IDs
    const chunkSize = 30;

    // Temporäre Liste für Rohdaten, um später anzureichern
    const groupDocs: { id: string; data: Omit<FirestoreGroup, 'id'> }[] = []; 

    for (let i = 0; i < groupIds.length; i += chunkSize) {
      const chunk = groupIds.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;
      const groupsQuery = query(collection(db, GROUPS_COLLECTION), where(documentId(), "in", chunk));
      
      try {
        const groupsSnapshot = await getDocs(groupsQuery);
        groupsSnapshot.forEach((doc) => {
          const data = doc.data() as Omit<FirestoreGroup, 'id'> | undefined;
          if (data) {
            // Rohdaten temporär speichern
            groupDocs.push({id: doc.id, data: data}); 
            foundGroupIds.add(doc.id);
          } else {
             console.warn(`getUserGroups: Document data for group ${doc.id} was undefined.`);
          }
        });
      } catch (queryError) {
          console.error(`getUserGroups: Error fetching chunk with IDs [${chunk.join(', ')}]:`, queryError);
      }
    }

    // --- Log fehlende Gruppen --- 
    const requestedIdSet = new Set(groupIds);
    const missingGroupIds = Array.from(requestedIdSet).filter(id => !foundGroupIds.has(id));
    if (missingGroupIds.length > 0) {
      console.warn(`getUserGroups: WARNING - Could not find group documents for ${missingGroupIds.length} requested IDs using 'in' query:`, missingGroupIds);
      // Optional: Diagnose wie zuvor kann hier bleiben
    }
    // --- Ende Log fehlende Gruppen --- 

    // === ANREICHERUNGSLOGIK (ähnlich wie in getUserGroupsByPlayerId) ===
    const enrichedGroups: FirestoreGroup[] = [];
    const allPlayerIdsToFetch = new Set<string>();

    groupDocs.forEach(groupDoc => {
      (groupDoc.data.playerIds || []).forEach(pid => allPlayerIdsToFetch.add(pid));
    });

    const playerIdsArray = Array.from(allPlayerIdsToFetch);
    const playersMap = new Map<string, FirestorePlayer>();

    if (playerIdsArray.length > 0) {
      // console.log(`getUserGroups: Fetching data for ${playerIdsArray.length} unique players...`);
      const playerChunkSize = 30;
      for (let i = 0; i < playerIdsArray.length; i += playerChunkSize) {
          const playerChunk = playerIdsArray.slice(i, i + playerChunkSize);
          if (playerChunk.length === 0) continue;
          const playersQuery = query(collection(db, PLAYERS_COLLECTION), where(documentId(), "in", playerChunk));
          try {
              const playersSnapshot = await getDocs(playersQuery);
              playersSnapshot.forEach((playerSnap) => {
                  const playerData = playerSnap.data() as FirestorePlayer | undefined;
                  if (playerData) {
                    playersMap.set(playerSnap.id, { ...playerData, id: playerSnap.id });
                  } else {
                     console.warn(`getUserGroups: Player document data for ID ${playerSnap.id} was undefined.`);
                  }
              });
          } catch (playerQueryError) {
              console.error(`getUserGroups: Error fetching player chunk with IDs [${playerChunk.join(', ')}]:`, playerQueryError);
          }
      }
      // console.log(`getUserGroups: Successfully fetched data for ${playersMap.size} players.`);
    }

    for (const groupDoc of groupDocs) {
      const groupData = groupDoc.data;
      const groupPlayerIds = groupData.playerIds || [];
      const enrichedPlayersData: FirestoreGroup['players'] = {};

      for (const pId of groupPlayerIds) {
        const currentPlayerData = playersMap.get(pId);
        const originalPlayerData = (groupData.players as any)?.[pId];

        if (currentPlayerData) {
          const displayName = currentPlayerData.displayName || "Unbekannt";
          const joinedAt = originalPlayerData?.joinedAt instanceof Timestamp ? originalPlayerData.joinedAt : Timestamp.now();
          enrichedPlayersData[pId] = { displayName: displayName, joinedAt: joinedAt };
        } else {
          enrichedPlayersData[pId] = {
            displayName: "Unbekannter Spieler",
            joinedAt: originalPlayerData?.joinedAt instanceof Timestamp ? originalPlayerData.joinedAt : Timestamp.now(),
          };
        }
      }
      const enrichedGroup: FirestoreGroup = {
        id: groupDoc.id,
        ...groupData,
        players: enrichedPlayersData,
        farbeSettings: groupData.farbeSettings ?? DEFAULT_FARBE_SETTINGS,
      };
      enrichedGroups.push(enrichedGroup);
    }
    // === ENDE ANREICHERUNGSLOGIK ===

    // console.log(`getUserGroups: Returning ${enrichedGroups.length} ENRICHED group objects for user ${userId}.`);
    return enrichedGroups; // Angereicherte Gruppen zurückgeben
  } catch (error) {
    console.error(`Fehler beim Abrufen der Gruppen für Benutzer ${userId}:`, error);
    throw new Error("Gruppen konnten nicht abgerufen werden.");
  }
};

/**
 * Ruft alle Gruppen ab, in denen ein Spieler Mitglied ist, basierend auf seiner Player-ID.
 * NEU: Reichert die `players`-Map jeder Gruppe mit aktuellen Spielerdaten an.
 * @param playerId Die ID des Spieler-Dokuments.
 * @return Ein Promise, das ein Array von angereicherten FirestoreGroup-Objekten auflöst.
 */
export const getUserGroupsByPlayerId = async (playerId: string): Promise<FirestoreGroup[]> => {
  if (!db) throw new Error("Firestore ist nicht initialisiert.");
  if (!playerId) {
    console.warn("getUserGroupsByPlayerId ohne playerId aufgerufen.");
    return [];
  }

  try {
    // 1. Player-Dokument holen, um groupIds zu bekommen
    const playerDoc = await getPlayerDocument(playerId);

    if (!playerDoc || !playerDoc.groupIds || playerDoc.groupIds.length === 0) {
      if (process.env.NODE_ENV === 'development') {
      console.log(`Spieler ${playerId} ist in keiner Gruppe (laut Player-Dokument).`);
    }
      return [];
    }

    const groupIds = playerDoc.groupIds;

    // 2. Alle Gruppen-Dokumente für die gefundenen IDs holen
    const groupDocs: { id: string; data: Omit<FirestoreGroup, 'id'> }[] = []; // Temporäre Liste für Rohdaten
    const foundGroupIds = new Set<string>();
    const chunkSize = 30; // Firestore 'in' query limit

    for (let i = 0; i < groupIds.length; i += chunkSize) {
      const chunk = groupIds.slice(i, i + chunkSize);
      if (chunk.length === 0) continue; // Überspringe leere Chunks

      const groupsQuery = query(collection(db, GROUPS_COLLECTION), where(documentId(), "in", chunk));
      
      try {
        const groupsSnapshot = await getDocs(groupsQuery);
        groupsSnapshot.forEach((doc) => {
          // Stelle sicher, dass doc.data() nicht undefined ist
          const data = doc.data() as Omit<FirestoreGroup, 'id'> | undefined; 
          if (data) {
            groupDocs.push({id: doc.id, data: data });
            foundGroupIds.add(doc.id);
          } else {
            console.warn(`getUserGroupsByPlayerId: Document data for group ${doc.id} was undefined.`);
          }
        });
      } catch (queryError) {
          console.error(`getUserGroupsByPlayerId: Error fetching group chunk with IDs [${chunk.join(', ')}]:`, queryError);
      }
    }

    // Log fehlende Gruppen (wie vorher)
    const requestedIdSet = new Set(groupIds);
    const missingGroupIds = Array.from(requestedIdSet).filter(id => !foundGroupIds.has(id));
    if (missingGroupIds.length > 0) {
      console.warn(`getUserGroupsByPlayerId: WARNING - Could not find group documents for ${missingGroupIds.length} requested IDs using 'in' query:`, missingGroupIds);
    }

    // === NEU: Schritt 3: Spielerdaten anreichern ===
    const enrichedGroups: FirestoreGroup[] = [];
    const allPlayerIdsToFetch = new Set<string>();

    // Sammle alle PlayerIDs aus allen geladenen Gruppen
    groupDocs.forEach(groupDoc => {
      (groupDoc.data.playerIds || []).forEach(pid => allPlayerIdsToFetch.add(pid));
    });

    const playerIdsArray = Array.from(allPlayerIdsToFetch);
    const playersMap = new Map<string, FirestorePlayer>();

    // Lade alle benötigten Spieler-Dokumente effizient in Batches
    if (playerIdsArray.length > 0) {
      // console.log(`getUserGroupsByPlayerId: Fetching data for ${playerIdsArray.length} unique players...`);
      const playerChunkSize = 30; // Firestore 'in' query limit
      for (let i = 0; i < playerIdsArray.length; i += playerChunkSize) {
          const playerChunk = playerIdsArray.slice(i, i + playerChunkSize);
          if (playerChunk.length === 0) continue;

          const playersQuery = query(collection(db, PLAYERS_COLLECTION), where(documentId(), "in", playerChunk));
          try {
              const playersSnapshot = await getDocs(playersQuery);
              playersSnapshot.forEach((playerSnap) => {
                  const playerData = playerSnap.data() as FirestorePlayer | undefined;
                  if (playerData) {
                    // Füge die ID zum Player-Objekt hinzu, da sie nicht standardmäßig enthalten ist
                    playersMap.set(playerSnap.id, { ...playerData, id: playerSnap.id }); 
                  } else {
                     console.warn(`getUserGroupsByPlayerId: Player document data for ID ${playerSnap.id} was undefined.`);
                  }
              });
          } catch (playerQueryError) {
              console.error(`getUserGroupsByPlayerId: Error fetching player chunk with IDs [${playerChunk.join(', ')}]:`, playerQueryError);
          }
      }
      // console.log(`getUserGroupsByPlayerId: Successfully fetched data for ${playersMap.size} players.`);
    } else {
      // console.log("getUserGroupsByPlayerId: No player IDs found in any groups to fetch.");
    }

    // Erstelle die angereicherten Gruppenobjekte
    for (const groupDoc of groupDocs) {
      const groupData = groupDoc.data;
      const groupPlayerIds = groupData.playerIds || [];
      const enrichedPlayersData: FirestoreGroup['players'] = {}; // Typ explizit setzen

      for (const pId of groupPlayerIds) {
        const currentPlayerData = playersMap.get(pId);
        const originalPlayerData = (groupData.players as any)?.[pId]; // Ursprüngliche Daten für joinedAt

        if (currentPlayerData) {
          const displayName = currentPlayerData.displayName || "Unbekannt";
          const joinedAt = originalPlayerData?.joinedAt instanceof Timestamp ? originalPlayerData.joinedAt : Timestamp.now();

          enrichedPlayersData[pId] = {
            displayName: displayName,
            joinedAt: joinedAt,
            // email hier nicht hinzufügen, da es im Original-Objekt auch nicht standardmäßig war
            // und potenziell sensible Daten sind.
          };
        } else {
          // Spieler-Dokument wurde nicht gefunden, obwohl ID in group.playerIds war
          if (process.env.NODE_ENV === 'development') {
          console.warn(`getUserGroupsByPlayerId: Player data for ID ${pId} not found in fetched playersMap for group ${groupDoc.id}. Using placeholder.`);
        }
          enrichedPlayersData[pId] = {
            displayName: "Unbekannter Spieler",
            joinedAt: originalPlayerData?.joinedAt instanceof Timestamp ? originalPlayerData.joinedAt : Timestamp.now(),
          };
        }
      }

      // Erstelle das finale, angereicherte Gruppenobjekt
      const enrichedGroup: FirestoreGroup = {
        id: groupDoc.id,
        ...groupData, // Originaldaten der Gruppe
        players: enrichedPlayersData, // Überschreibe mit den angereicherten Spielerdaten
        // Stelle sicher, dass Default-Einstellungen angewendet werden, falls nicht vorhanden
        farbeSettings: groupData.farbeSettings ?? DEFAULT_FARBE_SETTINGS, 
        // scoreSettings und strokeSettings sollten idealerweise auch Defaults haben,
        // aber fügen wir sie hier nicht hinzu, wenn sie nicht Teil des ursprünglichen Typs sind
      };
      enrichedGroups.push(enrichedGroup);
    }
    // === ENDE NEU ===

    // console.log(`getUserGroupsByPlayerId: Returning ${enrichedGroups.length} ENRICHED group objects for player ${playerId}.`);
    return enrichedGroups;

  } catch (error) {
    console.error(`getUserGroupsByPlayerId: General error for player ${playerId}:`, error);
    throw new Error("Fehler beim Abrufen der Gruppendaten des Spielers.");
  }
};

/**
 * Lädt ein Logo für eine Gruppe hoch, aktualisiert Firestore und löscht optional das alte Logo.
 * @param groupId Die ID der Gruppe.
 * @param file Die hochzuladende Logo-Datei.
 * @return Die öffentliche URL des hochgeladenen Logos.
 */
export const uploadGroupLogo = async (groupId: string, file: File): Promise<string> => {
  if (!db) throw new Error("Firestore ist nicht initialisiert.");
  if (!groupId) throw new Error("Gruppen-ID fehlt.");
  if (!file) throw new Error("Keine Datei zum Hochladen ausgewählt.");

  const storage = getStorage();
  if (!storage) throw new Error("Firebase Storage nicht initialisiert.");

  const groupRef = firestoreDoc(db, GROUPS_COLLECTION, groupId);

  // Optional: Altes Logo löschen
  try {
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      const oldLogoUrl = groupSnap.data()?.logoUrl;
      if (oldLogoUrl) {
        try {
          const oldImageRef = ref(storage, oldLogoUrl);
          console.log(`Versuche altes Logo zu löschen: ${oldLogoUrl}`);
          await deleteObject(oldImageRef);
          console.log("Altes Gruppenlogo gelöscht.");
        } catch (deleteError: unknown) {
          // Check if the error is an object with a code property
          let deleteErrorCode: string | undefined = undefined;
          if (typeof deleteError === "object" && deleteError !== null && "code" in deleteError) {
            deleteErrorCode = (deleteError as { code: string }).code;
          }

          if (deleteErrorCode !== "storage/object-not-found") {
            console.warn("Konnte altes Gruppenlogo nicht löschen:", deleteError);
          } else {
            console.log("Altes Gruppenlogo existierte nicht oder konnte nicht gefunden werden (ignoriert).");
          }
        }
      }
    } else {
      throw new Error(`Gruppe mit ID ${groupId} nicht gefunden.`);
    }
  } catch (error) {
    console.error("Fehler beim Abrufen der Gruppe zum Löschen des alten Logos:", error);
    // Weiterlaufen lassen oder Fehler werfen? Werfen ist sicherer.
    throw new Error("Fehler bei der Vorbereitung des Logo-Uploads.");
  }

  // Definiere den Pfad im Storage (eindeutig pro Gruppe)
  // Verwende einen konsistenten Namen, z.B. 'logo' mit der passenden Endung
  const fileExtension = file.name.split(".").pop() || "png"; // Fallback auf png
  // Alter Pfad
  // const filePath = `groupLogos/${groupId}/logo.${fileExtension}`;

  // NEUER PFAD: Füge die userId als Verzeichnisebene hinzu, um einfachere Storage-Regeln zu ermöglichen
  // Das erlaubt uns, die simple "request.auth.uid == userId"-Regel zu verwenden, genau wie bei Profilbildern.
  const authUser = auth.currentUser;
  if (!authUser) {
    throw new Error("Kein authentifizierter Benutzer für Logo-Upload.");
  }
  const userId = authUser.uid;
  const filePath = `groupLogos/${userId}/${groupId}/logo.${fileExtension}`;

  const storageRef = ref(storage, filePath);

  try {
    // Dateivalidierung (Typ, Größe)
    const fileType = file.type.toLowerCase();
    if (!fileType.startsWith("image/")) {
      throw new Error("Die Datei ist kein Bild.");
    }
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > 2) { // Limit auf 2MB für Logos
      throw new Error(`Logo ist zu groß (${fileSizeInMB.toFixed(2)} MB). Maximum: 2 MB.`);
    }

    // Datei hochladen
    console.log(`Lade Gruppenlogo hoch nach ${filePath}...`);
    const uploadResult = await uploadBytes(storageRef, file);
    console.log("Upload erfolgreich.");

    // Download-URL holen
    const downloadURL = await getDownloadURL(uploadResult.ref);
    console.log("Download URL erhalten:", downloadURL);

    // Gruppen-Dokument in Firestore aktualisieren
    try {
      await updateDoc(groupRef, {
        logoUrl: downloadURL,
        updatedAt: serverTimestamp(), // Optional: Update-Zeitstempel setzen
      });
      console.log(`Firestore Gruppe ${groupId} mit neuer logoUrl aktualisiert.`);
    } catch (updateError) {
      // Stille Behandlung für "No document to update" Fehler
      if (updateError instanceof Error && updateError.message.includes("No document to update")) {
        console.warn(`GROUP_SERVICE: Group ${groupId} does not exist, silently ignoring logo URL update.`);
        // Trotzdem die Download-URL zurückgeben, da der Upload erfolgreich war
      } else {
        console.error(`Fehler beim Aktualisieren der logoUrl für Gruppe ${groupId}:`, updateError);
        throw new Error("Fehler beim Aktualisieren der Gruppe mit neuer Logo-URL.");
      }
    }

    // ✅ DIREKTE Store-Aktualisierung (reicht völlig aus!)
    useGroupStore.getState().updateGroupInList(groupId, {logoUrl: downloadURL});
    console.log(`GroupStore für Gruppe ${groupId} mit neuer logoUrl direkt aktualisiert.`);

    // ❌ ENTFERNT: Unnötiges Reload verursachte Race Condition und setzte currentGroup auf undefined
    // Die direkte Store-Aktualisierung oben funktioniert perfekt!

    return downloadURL;
  } catch (error: unknown) {
    console.error("Fehler beim Hochladen des Gruppenlogos oder Aktualisieren von Firestore:", error);
    // Type check before accessing potential properties
    if (typeof error === "object" && error !== null && "code" in error && error instanceof Error) {
      const errorCode = (error as { code: string }).code;
      // TODO: Spezifische Storage-Fehlercodes behandeln (storage/unauthorized etc.)
      throw new Error(`Fehler beim Logo-Upload (${errorCode}): ${error.message}`);
    } else if (error instanceof Error) {
      // Throw with the error message if it's a standard Error
      throw new Error(`Fehler beim Logo-Upload: ${error.message}`);
    }
    // Fallback for non-Error types
    throw new Error("Fehler beim Hochladen des Gruppenlogos.");
  }
};

/**
 * Aktualisiert die Rolle eines Gruppenmitglieds (Admin <-> Mitglied).
 * Führt Berechtigungsprüfungen durch (nur Admins können dies tun)
 * und verhindert das Entfernen des letzten Admins.
 *
 * @param groupId Die ID der Gruppe.
 * @param targetPlayerId Die Spieler-ID des Mitglieds, dessen Rolle geändert werden soll.
 * @param newRole Die neue Rolle ('admin' oder 'member').
 * @param requestingUserId Die User-ID des Benutzers, der die Änderung anfordert.
 * @throws Wirft Fehler bei fehlender Berechtigung, ungültigen Daten oder wenn der letzte Admin entfernt werden soll.
 */
export const updateGroupMemberRole = async (
  groupId: string,
  targetPlayerId: string,
  newRole: 'admin' | 'member',
  requestingUserId: string
): Promise<string> => {
  if (!db) throw new Error("Firestore ist nicht initialisiert.");
  if (!groupId || !targetPlayerId || !requestingUserId) {
    throw new Error("Ungültige IDs für Gruppen- oder Spieleroperation.");
  }
  if (newRole !== 'admin' && newRole !== 'member') {
    throw new Error("Ungültige Zielrolle angegeben.");
  }
  
  const groupRef = firestoreDoc(db, GROUPS_COLLECTION, groupId);

  try {
    // Die Transaktion gibt das Ergebnis des inneren Callbacks zurück.
    const resultUserId = await runTransaction(db, async (transaction) => {
      const groupSnap = await transaction.get(groupRef);

      if (!groupSnap.exists()) {
        throw new Error(`Gruppe mit ID ${groupId} nicht gefunden.`);
      }

      const groupData = groupSnap.data() as FirestoreGroup; // Type assertion
      const groupCreatorId = groupData.createdBy;

      // --- NEUER SCHRITT: Lade Player-Dokument, um targetUserId zu erhalten --- 
      const playerRef = firestoreDoc(db, PLAYERS_COLLECTION, targetPlayerId);
      const playerSnap = await transaction.get(playerRef);

      if (!playerSnap.exists()) {
        console.error(`[Tx Detail] Fehler: Player-Dokument ${targetPlayerId} nicht gefunden.`);
        throw new Error(`Spieler-Dokument ${targetPlayerId} nicht gefunden.`);
      }
      const targetUserId = playerSnap.data()?.userId;
      if (!targetUserId) {
        console.error(`[Tx Detail] Fehler: Player-Dokument ${targetPlayerId} hat keine verknüpfte userId.`);
        throw new Error(`Zielspieler ${targetPlayerId} ist kein registrierter Benutzer und kann nicht zum Admin ernannt/entfernt werden.`);
      }
      console.log(`[Tx Detail] Ziel-UserID für Player ${targetPlayerId} ermittelt: ${targetUserId}`);
      // --- ENDE NEUER SCHRITT --- 

      // 1. Berechtigungsprüfung: Ist der anfordernde Benutzer Admin?
      if (!groupData.adminIds || !groupData.adminIds.includes(requestingUserId)) {
        throw new Error("Nur Admins dürfen Mitgliederrollen ändern.");
      }

      // --- NEUER SCHRITT: Prüfen, ob der Gründer entfernt werden soll --- 
      if (targetUserId === groupCreatorId) {
        console.error(`[Tx Detail] Versuch, den Gruppengründer (${targetUserId}) als Admin zu entfernen.`);
        throw new Error("Der Gruppengründer kann nicht als Admin entfernt werden.");
      }
      // --- ENDE NEUER SCHRITT --- 

      const currentAdminIds = groupData.adminIds || [];
      // Prüfe Admin-Status anhand der targetUserId
      const isTargetCurrentlyAdmin = currentAdminIds.includes(targetUserId);

      if (newRole === 'admin') {
        // Zum Admin ernennen
        if (isTargetCurrentlyAdmin) {
          console.log(`Spieler ${targetPlayerId} ist bereits Admin in Gruppe ${groupId}.`);
          return targetUserId; // Keine Änderung, aber ID zurückgeben
        }
        console.log(`[Tx Detail] Ernenne User ${targetUserId} (Player ${targetPlayerId}) zum Admin.`);
        transaction.update(groupRef, {
          adminIds: arrayUnion(targetUserId),
          updatedAt: serverTimestamp()
        });
        console.log(`Benutzer ${targetUserId} (Spieler ${targetPlayerId}) erfolgreich zum Admin in Gruppe ${groupId} ernannt.`);

      } else { // newRole === 'member'
        // Zum Mitglied zurückstufen (Admin-Status entfernen)
        if (!isTargetCurrentlyAdmin) {
          console.log(`Spieler ${targetPlayerId} ist bereits nur Mitglied in Gruppe ${groupId}.`);
          return targetUserId; // Keine Änderung, aber ID zurückgeben
        }

        // 3. Schutzprüfung: Letzten Admin nicht entfernen
        // WICHTIG: Prüfe auf <= 1, *bevor* der Gründer-Check durchgeführt wird,
        //          falls der Gründer der einzige Admin ist.
        if (currentAdminIds.length <= 1) {
          console.error("[Tx Detail] Versuch, den letzten Admin zu entfernen.");
          throw new Error("Der letzte Admin der Gruppe kann nicht entfernt werden.");
        }

        console.log(`[Tx Detail] Entferne Admin-Status für User ${targetUserId} (Player ${targetPlayerId})`);
        transaction.update(groupRef, {
          adminIds: arrayRemove(targetUserId),
          updatedAt: serverTimestamp()
        });
        console.log(`Admin-Status für Spieler ${targetPlayerId} in Gruppe ${groupId} erfolgreich entfernt.`);
      }

      // Funktion gibt jetzt die targetUserId zurück
      return targetUserId; 
    });

    // Gib die resultierende UserId zurück
    return resultUserId;

  } catch (error) {
    console.error(`Fehler beim Aktualisieren der Mitgliedsrolle für Spieler ${targetPlayerId} in Gruppe ${groupId}:`, error);
    // Fehler weiterwerfen, damit er im Store/UI behandelt werden kann
    if (error instanceof Error) {
        throw error; // Spezifischen Fehler weitergeben
    }
    throw new Error("Die Mitgliedsrolle konnte nicht aktualisiert werden.");
  }
};

/**
 * Aktualisiert spezifische Einstellungen einer Gruppe in Firestore.
 * Derzeit unterstützt: name, description, isPublic, farbeSettings.
 *
 * @param groupId Die ID der zu aktualisierenden Gruppe.
 * @param settings Ein Objekt mit den zu aktualisierenden Einstellungen.
 * @throws Wirft Fehler, wenn Firestore nicht initialisiert ist oder das Update fehlschlägt.
 */
export const updateGroupSettings = async (
  groupId: string,
  settings: Partial<Pick<FirestoreGroup, 'name' | 'description' | 'isPublic' | 'farbeSettings'>>
): Promise<void> => {
  if (!db) throw new Error("Firestore ist nicht initialisiert.");
  if (!groupId) throw new Error("Gruppen-ID fehlt.");
  if (!settings || Object.keys(settings).length === 0) {
    console.warn("updateGroupSettings ohne Einstellungen aufgerufen.");
    return;
  }

  const groupRef = firestoreDoc(db, GROUPS_COLLECTION, groupId);

  const updateData: Partial<FirestoreGroup> & { updatedAt: Timestamp } = {
    ...settings,
    updatedAt: serverTimestamp() as unknown as Timestamp,
  };

  Object.keys(updateData).forEach(key => {
    if (updateData[key as keyof typeof updateData] === undefined) {
      delete updateData[key as keyof typeof updateData];
    }
  });

  try {
    console.log(`Aktualisiere Gruppe ${groupId} mit Einstellungen:`, updateData);
    await updateDoc(groupRef, updateData);
    console.log(`Gruppe ${groupId} erfolgreich aktualisiert.`);
  } catch (error) {
    console.error(`Fehler beim Aktualisieren der Gruppe ${groupId}:`, error);
    
    // Stille Behandlung für "No document to update" Fehler
    if (error instanceof Error && error.message.includes("No document to update")) {
      console.warn(`GROUP_SERVICE: Group ${groupId} does not exist, silently ignoring settings update.`);
      return;
    }
    
    throw new Error("Fehler beim Aktualisieren der Gruppeneinstellungen.");
  }
};

/**
 * Ruft die detaillierten Spielerobjekte für alle Mitglieder einer Gruppe ab.
 * @param groupId Die ID der Gruppe.
 * @return Ein Promise, das ein Array von FirestorePlayer-Objekten auflöst.
 */
export const fetchGroupMembers = async (groupId: string): Promise<FirestorePlayer[]> => {
  if (!db) throw new Error("Firestore ist nicht initialisiert.");
  if (!groupId) {
    console.warn("fetchGroupMembers ohne groupId aufgerufen.");
    return [];
  }

  try {
    const group = await getGroupById(groupId);
    if (!group || !group.playerIds || group.playerIds.length === 0) {
      console.log(`[groupService] Keine Player-IDs in Gruppe ${groupId} gefunden oder Gruppe existiert nicht.`);
      return [];
    }

    const playerPromises = group.playerIds.map(playerId => getPlayerDocument(playerId));
    const players = await Promise.all(playerPromises);
    
    // Filtere null-Werte heraus (falls ein Player-Dokument nicht gefunden wurde)
    const validPlayers = players.filter((p): p is FirestorePlayer => !!p);
    
    console.log(`[groupService] Fetched ${validPlayers.length} member profiles for group ${groupId}.`);
    return validPlayers;

  } catch (error) {
    console.error(`[groupService] Fehler beim Abrufen der Gruppenmitglieder für Gruppe ${groupId}:`, error);
    // Im Fehlerfall eine leere Liste zurückgeben, um die UI nicht zu blockieren
    return []; 
  }
};

/**
 * Holt die Details einer Gruppe mit zusätzlichen, aktualisierten Metadaten.
 * @param groupId Die ID der Gruppe.
 * @returns Ein Promise mit den Gruppendetails oder null, wenn die Gruppe nicht gefunden wurde.
 */
export const getGroupDetails = async (groupId: string): Promise<FirestoreGroup | null> => {
  if (!groupId) {
    console.error("getGroupDetails called without groupId.");
    return null;
  }

  // console.log(`[getGroupDetails] Fetching details for group: ${groupId}`);

  try {
    const groupDocRef = firestoreDoc(db, GROUPS_COLLECTION, groupId);
    const groupSnapshot = await getDoc(groupDocRef);

    if (!groupSnapshot.exists()) {
      console.warn(`Group with ID ${groupId} not found.`);
      return null;
    }

    const groupData = groupSnapshot.data() as Omit<FirestoreGroup, 'id'>;
    
    // Basis-Gruppe mit ID
    const group: FirestoreGroup = {
      id: groupId,
      ...groupData,
      // Stelle sicher, dass Default-Werte vorhanden sind
      players: groupData.players || {},
      playerIds: groupData.playerIds || [],
      adminIds: groupData.adminIds || [],
      scoreSettings: groupData.scoreSettings || DEFAULT_SCORE_SETTINGS,
      strokeSettings: groupData.strokeSettings || DEFAULT_STROKE_SETTINGS,
      farbeSettings: groupData.farbeSettings || DEFAULT_FARBE_SETTINGS,
    };

    // console.log(`[getGroupDetails] Details found for group: ${groupId}.`);
    return group;
  } catch (error) {
    console.error(`[getGroupDetails] Error fetching group ${groupId}:`, error);
    throw new Error(`Failed to fetch group details: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Hier könnten später weitere Funktionen hinzukommen (updateGroup, addPlayerToGroup, etc.)
