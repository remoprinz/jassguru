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
import {FirestoreGroup} from "../types/group";
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
    console.log(`createGroup: Getting playerId for user ${userId}...`);
    const playerId = await getPlayerIdForUser(userId, userDisplayName);
    if (!playerId) {
      console.error(`createGroup: Could not get or create playerId for user ${userId}.`);
      throw new Error("Konnte keine Spieler-ID für den Benutzer finden oder erstellen.");
    }
    console.log(`createGroup: Obtained playerId: ${playerId}`);

    // 2. Neues Gruppen-Dokument erstellen
    const groupData: Omit<FirestoreGroup, "id"> = {
      name: trimmedGroupName,
      description: "Willkommen in unserer Jassrunde!",
      logoUrl: null,
      createdAt: serverTimestamp() as unknown as Timestamp,
      createdBy: userId,
      playerIds: [playerId],
      adminIds: [userId],
      isPublic: true,
      players: {
        [userId]: {
          displayName: userDisplayName || "Unbekannt",
          email: auth.currentUser?.email || "",
          joinedAt: serverTimestamp() as unknown as Timestamp,
        },
      },
    };
    console.log(`createGroup: Adding new group document with name '${trimmedGroupName}'...`);
    const groupRef = await addDoc(groupsCollectionRef, groupData);
    const newGroupId = groupRef.id;
    console.log(`createGroup: Successfully added group document with ID: ${newGroupId}`);

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
    console.log("createGroup: Successfully fetched newly created group object.");

    // 3. Player-Dokument aktualisieren
    const playerRef = firestoreDoc(db, PLAYERS_COLLECTION, playerId);
    console.log(`createGroup: Attempting to update player document ${playerId} to add groupId ${newGroupId}...`);
    try {
      await updateDoc(playerRef, {
        groupIds: arrayUnion(newGroupId),
      });
      console.log(`createGroup: Successfully updated player document ${playerId} with new groupId.`);
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
    console.log(`createGroup: Attempting to update user document ${userId} with lastActiveGroupId ${newGroupId}...`);
    try {
      await updateUserDocument(userId, {lastActiveGroupId: newGroupId});
      console.log(`createGroup: Successfully updated user document ${userId}.`);
    } catch (userUpdateError) {
      // Log this error but maybe don't throw, as the group and player link exist
      console.error(`createGroup: FAILED to update user document ${userId} with lastActiveGroupId ${newGroupId}:`, userUpdateError);
    }

    console.log(`Gruppe '${trimmedGroupName}' (ID: ${newGroupId}) erfolgreich erstellt für User ${userId}.`);
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
      // Wichtig: ID manuell hinzufügen, da sie nicht im Dokument selbst gespeichert ist
      return {id: groupSnap.id, ...groupSnap.data()} as FirestoreGroup;
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
    const allGroups: FirestoreGroup[] = [];
    const foundGroupIds = new Set<string>(); // Zum Nachverfolgen gefundener IDs
    const chunkSize = 30;

    for (let i = 0; i < groupIds.length; i += chunkSize) {
      const chunk = groupIds.slice(i, i + chunkSize);
      const groupsQuery = query(collection(db, GROUPS_COLLECTION), where(documentId(), "in", chunk));
      
      try {
        const groupsSnapshot = await getDocs(groupsQuery);
        groupsSnapshot.forEach((doc) => {
          const data = doc.data() as Omit<FirestoreGroup, 'id'>;
          allGroups.push({id: doc.id, ...data});
          foundGroupIds.add(doc.id);
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
      
      // --- DIAGNOSE: Versuche, die erste fehlende Gruppe direkt mit getDoc abzurufen ---
      const firstMissingId = missingGroupIds[0];
      console.log(`getUserGroups: DIAGNOSIS - Attempting to fetch first missing group ${firstMissingId} directly via getDoc...`);
      try {
        const singleDocRef = firestoreDoc(db, GROUPS_COLLECTION, firstMissingId);
        const singleDocSnap = await getDoc(singleDocRef); // Verwende getDoc hier, nicht getDocFromServer
        if (singleDocSnap.exists()) {
          console.log(`getUserGroups: DIAGNOSIS SUCCESS - Found group ${firstMissingId} via getDoc! Data:`, singleDocSnap.data());
          // Optional: Man könnte die gefundene Gruppe hier zu allGroups hinzufügen
          // const missingGroupData = singleDocSnap.data() as Omit<FirestoreGroup, 'id'>;
          // allGroups.push({ id: singleDocSnap.id, ...missingGroupData });
          // Aber fürs Debugging reicht das Log
        } else {
          console.error(`getUserGroups: DIAGNOSIS FAILED - Group ${firstMissingId} NOT FOUND even with direct getDoc! This is unexpected.`);
        }
      } catch (directGetError) {
        console.error(`getUserGroups: DIAGNOSIS ERROR - Error fetching group ${firstMissingId} directly via getDoc:`, directGetError);
      }
      // --- ENDE DIAGNOSE ---
    }
    // --- Ende Log fehlende Gruppen --- 

    console.log(`getUserGroups: Returning ${allGroups.length} full group objects for user ${userId}.`);
    return allGroups;
  } catch (error) {
    console.error(`Fehler beim Abrufen der Gruppen für Benutzer ${userId}:`, error);
    throw new Error("Gruppen konnten nicht abgerufen werden.");
  }
};

/**
 * Ruft alle Gruppen ab, in denen ein Spieler Mitglied ist, basierend auf seiner Player-ID.
 * @param playerId Die ID des Spieler-Dokuments.
 * @return Ein Promise, das ein Array von FirestoreGroup-Objekten auflöst.
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
      console.log(`Spieler ${playerId} ist in keiner Gruppe (laut Player-Dokument).`);
      return [];
    }

    const groupIds = playerDoc.groupIds;

    // 2. Alle Gruppen-Dokumente für die gefundenen IDs holen
    const allGroups: FirestoreGroup[] = [];
    const foundGroupIds = new Set<string>();
    const chunkSize = 30;

    for (let i = 0; i < groupIds.length; i += chunkSize) {
      const chunk = groupIds.slice(i, i + chunkSize);
      const groupsQuery = query(collection(db, GROUPS_COLLECTION), where(documentId(), "in", chunk));
      
      try {
        const groupsSnapshot = await getDocs(groupsQuery);
        groupsSnapshot.forEach((doc) => {
          const data = doc.data() as Omit<FirestoreGroup, 'id'>;
          allGroups.push({id: doc.id, ...data});
          foundGroupIds.add(doc.id);
        });
      } catch (queryError) {
          console.error(`getUserGroupsByPlayerId: Error fetching chunk with IDs [${chunk.join(', ')}]:`, queryError);
      }
    }

    // Log fehlende Gruppen (wie in getUserGroups)
    const requestedIdSet = new Set(groupIds);
    const missingGroupIds = Array.from(requestedIdSet).filter(id => !foundGroupIds.has(id));
    if (missingGroupIds.length > 0) {
      console.warn(`getUserGroupsByPlayerId: WARNING - Could not find group documents for ${missingGroupIds.length} requested IDs using 'in' query:`, missingGroupIds);
      // Optional: Fallback to individual fetches if needed, but log for now.
    }

    console.log(`getUserGroupsByPlayerId: Returning ${allGroups.length} full group objects for player ${playerId}.`);
    return allGroups;

  } catch (error) {
    console.error(`Fehler beim Abrufen der Gruppen für Spieler ${playerId}:`, error);
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
    await updateDoc(groupRef, {
      logoUrl: downloadURL,
      updatedAt: serverTimestamp(), // Optional: Update-Zeitstempel setzen
    });
    console.log(`Firestore Gruppe ${groupId} mit neuer logoUrl aktualisiert.`);

    // NEU: Direkte Aktualisierung des GroupStore
    useGroupStore.getState().updateGroupInList(groupId, {logoUrl: downloadURL});
    console.log(`GroupStore für Gruppe ${groupId} mit neuer logoUrl direkt aktualisiert.`);

    // NEU: Versuch, das Neuladen der Gruppen zu erzwingen, um UI-Update sicherzustellen
    const authState = useAuthStore.getState();
    if (authState.user) {
      try {
        console.log(`GroupService: Reloading groups for user ${authState.user.uid} after logo upload...`);
        await useGroupStore.getState().loadUserGroups(authState.user.uid);
        console.log(`GroupService: User groups reloaded for ${authState.user.uid}.`);
        // Stelle sicher, dass die gerade aktualisierte Gruppe auch die aktive ist
        const reloadedGroup = useGroupStore.getState().userGroups.find((g) => g.id === groupId) || null;
        useGroupStore.getState().setCurrentGroup(reloadedGroup);
        console.log("GroupService: Set current group after reload to:", reloadedGroup?.name);
      } catch (reloadError) {
        console.error("GroupService: Fehler beim Neuladen der Gruppen nach Logo-Upload:", reloadError);
        // Fehler hier nicht weiterwerfen, da der Upload erfolgreich war.
      }
    }

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

// Hier könnten später weitere Funktionen hinzukommen (updateGroup, addPlayerToGroup, etc.)
