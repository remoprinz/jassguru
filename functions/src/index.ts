import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentUpdated, Change, FirestoreEvent, QueryDocumentSnapshot, DocumentOptions } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
// GELÖSCHT: Unbenutzter Import von PlayerComputedStats etc.
// import { FirestoreGroup } from "../../src/types/group"; // <-- Entfernt wegen Modul-Konflikt

// Initialisierung von Firebase Admin (nur einmal pro Instanz)
try {
  admin.initializeApp();
} catch (e) {
  console.info("Firebase Admin SDK already initialized.");
}

// --- NEU: Import für v2 Firestore Trigger ---
// import * as archiveLogic from './archiveGame'; // ENTFERNT
// import * as cleanupFunctions from './cleanupRounds'; // <-- ENTFERNT/AUSKOMMENTIERT
// --- Import für neue HTTPS Callable Function ---
import * as finalizeSessionLogic from './finalizeSession'; // <-- WIEDER AKTIV
// --- NEUE IMPORTE ---
import * as userManagementLogic from './userManagement'; // WIEDER HINZUGEFÜGT
import * as scheduledTaskLogic from './scheduledTasks'; // WIEDER HINZUGEFÜGT
// ------------------------------------------

// --- Globale Optionen für Gen 2 setzen --- 
setGlobalOptions({ region: "europe-west1" });

// --- Lokale Typdefinition START ---
// Notwendig, da der direkte Import von ../../src/types nicht zuverlässig funktioniert
interface FirestorePlayerInGroup {
  displayName: string | null;
  email: string | null;
  joinedAt: admin.firestore.Timestamp;
}

interface FirestoreGroup {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string | null;
  createdAt: admin.firestore.Timestamp;
  createdBy: string;
  playerIds: string[];
  adminIds: string[];
  isPublic: boolean;
  players?: { [key: string]: FirestorePlayerInGroup };
  updatedAt?: admin.firestore.Timestamp; // Optional, falls verwendet
}

// NEU: Lokale Typdefinitionen für Turniere START
interface FirestoreTournamentSettings {
  rankingMode: 'total_points' | 'wins' | 'average_score_per_passe';
  scoreSettings: Record<string, unknown>; // Geändert von any
  strokeSettings: Record<string, unknown>; // Geändert von any
  farbeSettings: Record<string, unknown>; // Geändert von any
  minParticipants?: number;
  maxParticipants?: number;
}

interface FirestoreTournamentInstance {
  id: string;
  name: string;
  description?: string;
  groupId?: string; // Turniere können optional einer Gruppe angehören
  instanceDate?: admin.firestore.Timestamp | null;
  status: 'upcoming' | 'active' | 'completed' | 'archived';
  createdBy: string;
  adminIds: string[];
  participantUids: string[];
  settings: FirestoreTournamentSettings;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  completedPasseCount?: number;
  // Weitere Felder bei Bedarf...
}
// NEU: Lokale Typdefinitionen für Turniere ENDE

const db = admin.firestore();

// Interface für die erwarteten Eingabedaten
interface GenerateTokenData {
  groupId: string;
}

// Interface für invalidateActiveGroupInvites
interface InvalidateInvitesData {
  groupId: string;
}

// Interface für joinGroupByToken
interface JoinGroupByTokenData {
  token: string;
}

// NEU: Interface für generateTournamentInviteToken
interface GenerateTournamentTokenData {
  tournamentId: string;
}

// NEU: Interface für acceptTournamentInviteFunction
interface AcceptTournamentInviteData {
  token: string;
}

// Importiere die neue Funktion
import * as tournamentGameLogic from "./tournamentGameProcessing";

/**
 * Generiert einen sicheren, zeitlich begrenzten Einladungstoken für eine Gruppe.
 * Nur Admins der Gruppe können diese Funktion aufrufen.
 */
export const generateGroupInviteToken = onCall<GenerateTokenData>(async (request) => {
    // 1. Authentifizierung prüfen (context.auth -> request.auth)
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Der Nutzer muss angemeldet sein, um einen Einladungscode zu generieren."
      );
    }

    const userId = request.auth.uid;
    const groupId = request.data.groupId; // data.groupId -> request.data.groupId

    // 2. Input validieren
    if (!groupId || typeof groupId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Die Gruppen-ID fehlt oder hat ein ungültiges Format."
      );
    }

    console.info(`User ${userId} requests invite token for group ${groupId}`);

    try {
      // 3. Admin-Berechtigung prüfen (Logik bleibt gleich)
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Gruppe nicht gefunden.");
      }

      const groupData = groupSnap.data();
      if (!groupData?.adminIds?.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Nur Gruppen-Admins können Einladungscodes generieren."
        );
      }

      // 4. Sicheren Token generieren (Logik bleibt gleich)
      const token = crypto.randomBytes(24).toString("hex");

      // 5. Ablaufdatum berechnen (Logik bleibt gleich)
      const now = admin.firestore.Timestamp.now();
      const expirationSeconds = now.seconds + (30 * 24 * 60 * 60); 
      const expiresAt = admin.firestore.Timestamp.fromMillis(expirationSeconds * 1000);

      // 6. Token in Firestore speichern (Logik bleibt gleich)
      const inviteData = {
        groupId: groupId,
        token: token,
        expiresAt: expiresAt,
        isValid: true,
        generatedBy: userId,
        createdAt: now,
      };

      await db.collection("groupInvites").add(inviteData);

      console.info(`Successfully generated invite token for group ${groupId} by user ${userId}`);

      // 7. Token an Client zurückgeben
      return {token: token};
    } catch (error) {
      console.error(`Error generating invite token for group ${groupId} by user ${userId}:`, error);
      if (error instanceof HttpsError) {
        throw error; 
      } else {
        throw new HttpsError(
          "internal",
          "Ein interner Fehler ist beim Generieren des Einladungscodes aufgetreten."
        );
      }
    }
  });

/**
 * Macht alle aktuell gültigen Einladungstokens für eine Gruppe ungültig.
 * Nur Admins der Gruppe können diese Funktion aufrufen.
 */
export const invalidateActiveGroupInvites = onCall<InvalidateInvitesData>(async (request) => {
    // 1. Authentifizierung prüfen (context.auth -> request.auth)
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Der Nutzer muss angemeldet sein, um Einladungscodes zurückzusetzen."
      );
    }

    const userId = request.auth.uid;
    const groupId = request.data.groupId; // data.groupId -> request.data.groupId

    // 2. Input validieren
    if (!groupId || typeof groupId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Die Gruppen-ID fehlt oder hat ein ungültiges Format."
      );
    }

    console.info(`User ${userId} requests invalidation of active invites for group ${groupId}`);

    try {
      // 3. Admin-Berechtigung prüfen (Logik bleibt gleich)
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Gruppe nicht gefunden.");
      }

      const groupData = groupSnap.data();
      if (!groupData?.adminIds?.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Nur Gruppen-Admins können Einladungscodes zurücksetzen."
        );
      }

      // 4. Alle gültigen Tokens für die Gruppe abfragen (Logik bleibt gleich)
      const invitesQuery = db.collection("groupInvites")
        .where("groupId", "==", groupId)
        .where("isValid", "==", true);

      const querySnapshot = await invitesQuery.get();

      if (querySnapshot.empty) {
        console.info(`No active invites found for group ${groupId} to invalidate.`);
        return {success: true, invalidatedCount: 0}; 
      }

      // 5. Batch Write vorbereiten (Logik bleibt gleich)
      const batch = db.batch();
      querySnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
        batch.update(doc.ref, {isValid: false});
      });

      // 6. Batch ausführen (Logik bleibt gleich)
      await batch.commit();

      const invalidatedCount = querySnapshot.size;
      console.info(`Successfully invalidated ${invalidatedCount} active invites for group ${groupId} by user ${userId}`);

      // 7. Erfolg zurückgeben
      return {success: true, invalidatedCount: invalidatedCount};
    } catch (error) {
      console.error(`Error invalidating invites for group ${groupId} by user ${userId}:`, error);
      if (error instanceof HttpsError) {
        throw error;
      } else {
        throw new HttpsError(
          "internal",
          "Ein interner Fehler ist beim Zurücksetzen der Einladungscodes aufgetreten."
        );
      }
    }
  });

/**
 * Ermöglicht einem authentifizierten Nutzer, einer Gruppe mittels eines gültigen Tokens beizutreten.
 * FIX V2: Stellt sicher, dass alle Reads vor Writes in der Transaktion erfolgen.
 */
export const joinGroupByToken = onCall<JoinGroupByTokenData>(async (request) => {
    console.log("--- joinGroupByToken V11 START --- (Gen 2 mit manueller Korrektur)");

    if (!request.auth) {
        console.error("[joinGroupByToken LOG] Fehler: Nicht authentifiziert.");
        throw new HttpsError("unauthenticated", "Der Nutzer muss angemeldet sein, um einer Gruppe beizutreten.");
    }

    const userId = request.auth.uid;
    const userDisplayNameFromToken = request.auth.token.name || "Unbekannter Jasser (aus Token)";
    const userEmailFromToken = request.auth.token.email;
    const token = request.data.token;

    if (!token || typeof token !== "string") {
        console.error(`[joinGroupByToken LOG] Fehler: Ungültiger Token-Input: ${token}`);
        throw new HttpsError("invalid-argument", "Der Einladungscode fehlt oder hat ein ungültiges Format.");
    }

    let groupIdFromToken: string | null = null;

    try {
        const tokenQuery = db.collection("groupInvites").where("token", "==", token);
        const tokenQuerySnapshot = await tokenQuery.get();

        if (tokenQuerySnapshot.empty) {
            console.error(`[joinGroupByToken LOG] Fehler: Token ${token} nicht in groupInvites gefunden.`);
            throw new HttpsError("not-found", "Einladungscode nicht gefunden oder ungültig.");
        }

        const tokenDocSnapshot = tokenQuerySnapshot.docs[0];
        const tokenDataOutside = tokenDocSnapshot.data();
        const tokenDocId = tokenDocSnapshot.id;

        if (!tokenDataOutside) {
            throw new HttpsError("internal", "Fehler beim Lesen der Token-Daten.");
        }

        if (!tokenDataOutside.isValid) {
            throw new HttpsError("permission-denied", "Dieser Einladungscode ist nicht mehr gültig.");
        }

        const now = admin.firestore.Timestamp.now();
        if (tokenDataOutside.expiresAt.toMillis() < now.toMillis()) {
            await tokenDocSnapshot.ref.update({ isValid: false });
            throw new HttpsError("permission-denied", "Dieser Einladungscode ist abgelaufen.");
        }

        groupIdFromToken = tokenDataOutside.groupId;
        if (!groupIdFromToken) {
            throw new HttpsError("internal", "Gruppen-ID im Token nicht gefunden.");
        }

        const joinResult = await db.runTransaction(async (transaction: admin.firestore.Transaction) => {
            const userRef = db.collection("users").doc(userId);
            const userSnap = await transaction.get(userRef);

            const tokenRef = db.collection("groupInvites").doc(tokenDocId);
            const tokenDoc = await transaction.get(tokenRef);

            if (!tokenDoc.exists) {
                throw new Error("Einladungscode konnte nicht erneut gelesen werden.");
            }
            const tokenDataInTx = tokenDoc.data();
            if (!tokenDataInTx || !tokenDataInTx.isValid || tokenDataInTx.expiresAt.toMillis() < admin.firestore.Timestamp.now().toMillis()) {
                throw new Error("Einladungscode wurde während des Vorgangs ungültig oder ist abgelaufen.");
            }
            const currentGroupIdInTx = tokenDataInTx.groupId;
            if (!currentGroupIdInTx || typeof currentGroupIdInTx !== 'string') {
                throw new Error("Gruppen-ID im Token nicht gefunden oder ungültig.");
            }

            const groupRef = db.collection("groups").doc(currentGroupIdInTx);
            const groupSnap = await transaction.get(groupRef);

            if (!groupSnap.exists) {
                throw new Error("Die zugehörige Gruppe wurde nicht gefunden.");
            }
            const groupData = groupSnap.data();
            if (!groupData) {
                throw new Error("Fehler beim Lesen der Gruppendaten.");
            }

            let playerVerifySnap: admin.firestore.DocumentSnapshot | null = null;
            let playerQuerySnapshot: admin.firestore.QuerySnapshot | null = null;
            let initialPlayerIdFromUserDoc: string | null = null;

            if (userSnap.exists && userSnap.data()?.playerId) {
                initialPlayerIdFromUserDoc = userSnap.data()?.playerId;
                if (initialPlayerIdFromUserDoc) { // Sichere Prüfung
                    const playerVerifyRef = db.collection("players").doc(initialPlayerIdFromUserDoc);
                    playerVerifySnap = await transaction.get(playerVerifyRef);
                }
            } else {
                const playerQuery = db.collection("players").where("userId", "==", userId).limit(1);
                playerQuerySnapshot = await transaction.get(playerQuery);
            }

            const finalUserDisplayName = userSnap.exists && userSnap.data()?.displayName ? userSnap.data()?.displayName : userDisplayNameFromToken;
            const finalUserEmail = userSnap.exists && userSnap.data()?.email ? userSnap.data()?.email : userEmailFromToken;

            let finalPlayerId: string | null = null;
            let createNewPlayerDoc = false;

            if (initialPlayerIdFromUserDoc && playerVerifySnap?.exists) {
                finalPlayerId = initialPlayerIdFromUserDoc;
            } else if (playerQuerySnapshot && !playerQuerySnapshot.empty) {
                finalPlayerId = playerQuerySnapshot.docs[0].id;
                if (userSnap.exists && userSnap.data()?.playerId !== finalPlayerId) {
                    transaction.update(userRef, { playerId: finalPlayerId, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
                }
            } else {
                finalPlayerId = crypto.randomBytes(12).toString('hex');
                createNewPlayerDoc = true;
            }

            if (!finalPlayerId) {
                throw new Error("Konnte die Spieler-ID nicht bestimmen.");
            }

            if (groupData.playerIds?.includes(finalPlayerId)) {
                if (!groupData.players || !groupData.players[finalPlayerId]) {
                    const missingPlayerEntry = {
                        displayName: finalUserDisplayName,
                        email: finalUserEmail ?? null,
                        joinedAt: admin.firestore.Timestamp.now(),
                    };
                    transaction.update(groupRef, {
                        [`players.${finalPlayerId}`]: missingPlayerEntry,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    if (!groupData.players) groupData.players = {};
                    groupData.players[finalPlayerId] = missingPlayerEntry;
                }
                return { success: true, alreadyMember: true, group: { id: groupSnap.id, ...groupData } };
            }

            if (createNewPlayerDoc) {
                const newPlayerRef = db.collection("players").doc(finalPlayerId);
                transaction.set(newPlayerRef, {
                    userId: userId,
                    nickname: finalUserDisplayName || `Spieler_${userId.substring(0, 6)}`,
                    displayName: finalUserDisplayName,
                    email: finalUserEmail ?? null,
                    isGuest: false,
                    stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
                    groupIds: [currentGroupIdInTx],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            } else {
                const existingPlayerRef = db.collection("players").doc(finalPlayerId);
                transaction.update(existingPlayerRef, {
                    groupIds: admin.firestore.FieldValue.arrayUnion(currentGroupIdInTx),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            const userUpdateData = {
                playerId: finalPlayerId,
                lastActiveGroupId: currentGroupIdInTx,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            };
            if (!userSnap.exists) {
                transaction.set(userRef, { ...userUpdateData, displayName: finalUserDisplayName, email: finalUserEmail ?? null, createdAt: admin.firestore.FieldValue.serverTimestamp(), lastLogin: admin.firestore.FieldValue.serverTimestamp() });
            } else {
                transaction.update(userRef, userUpdateData);
            }

            const groupPlayerEntry = {
                displayName: finalUserDisplayName,
                email: finalUserEmail ?? null,
                joinedAt: admin.firestore.Timestamp.now(),
            };

            transaction.update(groupRef, {
                playerIds: admin.firestore.FieldValue.arrayUnion(finalPlayerId),
                [`players.${finalPlayerId}`]: groupPlayerEntry,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            const resultingGroupData = {
              id: groupSnap.id, 
              ...groupData,
              playerIds: [...(groupData.playerIds || []), finalPlayerId].filter((id, index, self) => self.indexOf(id) === index),
              players: { ...(groupData.players || {}), [finalPlayerId]: groupPlayerEntry }
            };

            return { success: true, alreadyMember: false, group: resultingGroupData };
        });

        return joinResult;
    } catch (error) {
        console.error(`[joinGroupByToken LOG] Fehler beim Beitritt:`, error);
        if (error instanceof HttpsError) {
            throw error;
        } else if (error instanceof Error) {
            throw new HttpsError("internal", `Interner Fehler: ${error.message}`);
        } else {
            throw new HttpsError("internal", "Ein unbekannter interner Fehler ist aufgetreten.");
        }
    }
});

// --- finalizeSession (Callable Function wird exportiert) ---
export const finalizeSession = finalizeSessionLogic.finalizeSession;

// --- archivecompletedgame (Trigger wird exportiert) - NUR EINMAL! ---
// export const archivecompletedgame = archiveLogic.archivecompletedgame; // ENTFERNT

// --- cleanupOldData (Scheduled Function) ---
export const cleanupOldData = scheduledTaskLogic.cleanupOldData; 

// --- NEU: scheduledFirestoreBackup (Scheduled Function) ---
export const scheduledFirestoreBackup = scheduledTaskLogic.scheduledFirestoreBackup;

// --- Trigger aus userManagement.ts ---
export const syncUserNameOnChange = userManagementLogic.syncUserNameOnChange;

/**
 * Erstellt eine neue Gruppe in Firestore.
 */
export const createNewGroup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentifizierung erforderlich.");
  }
  const userId = request.auth.uid;
  const userDisplayName = request.auth.token.name || "Unbekannter Jasser";
  const userEmail = request.auth.token.email;

  // Expliziter Typ für die erwarteten Daten
  const data = request.data as { name?: string; description?: string; isPublic?: boolean };

  if (!data || typeof data.name !== "string" || data.name.trim() === "") {
    throw new HttpsError("invalid-argument", "Gruppenname fehlt oder ist ungültig.");
  }

  const newGroupRef = db.collection("groups").doc(); // Automatisch generierte ID

  try {
    // --- Ermittle playerDocId für den Ersteller ---
    let playerDocId: string | null = null;
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();

    if (userSnap.exists && userSnap.data()?.playerId) {
      // Überprüfe, ob dieser Player-Datensatz auch wirklich existiert
      const playerCheckRef = db.collection("players").doc(userSnap.data()?.playerId);
      const playerCheckSnap = await playerCheckRef.get();
      if (playerCheckSnap.exists) {
        playerDocId = userSnap.data()?.playerId;
        console.log(`[createNewGroup] Found existing playerDocId ${playerDocId} from user doc for creator ${userId}.`);
      } else {
        console.warn(`[createNewGroup] playerDocId ${userSnap.data()?.playerId} from user doc for ${userId} does not exist in players collection. Will create new.`);
        // Fallback, falls der Player-Eintrag fehlt
      }
    }

    if (!playerDocId) {
      // Versuche, den Spieler über die userId in der players Collection zu finden
      const playerQuery = db.collection("players").where("userId", "==", userId).limit(1);
      const playerQuerySnapshot = await playerQuery.get();
      if (!playerQuerySnapshot.empty) {
        playerDocId = playerQuerySnapshot.docs[0].id;
        console.log(`[createNewGroup] Found existing playerDocId ${playerDocId} via query for creator ${userId}.`);
        // Stelle sicher, dass der User-Doc auch diesen PlayerId hat
        if (userSnap.exists && userSnap.data()?.playerId !== playerDocId) {
          await userRef.update({ playerId: playerDocId, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
          console.log(`[createNewGroup] Updated user doc for ${userId} with correct playerDocId ${playerDocId}.`);
        } else if (!userSnap.exists) {
          // Erstelle User-Dokument, falls es nicht existiert (sollte selten sein für eingeloggte User)
          await userRef.set({
            displayName: userDisplayName,
            email: userEmail,
            playerId: playerDocId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`[createNewGroup] Created new user doc for ${userId} with playerDocId ${playerDocId}.`);
        }
      }
    }

    let newPlayerCreated = false;
    if (!playerDocId) {
      // Wenn immer noch kein playerDocId, erstelle einen neuen Player-Datensatz
      playerDocId = crypto.randomBytes(12).toString('hex');
      const newPlayerRef = db.collection("players").doc(playerDocId);
      const newPlayerData = {
        userId: userId,
        nickname: userDisplayName || `Spieler_${userId.substring(0, 6)}`,
        isGuest: false,
        stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
        groupIds: [newGroupRef.id], // Die neue Gruppe direkt hinzufügen
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        displayName: userDisplayName, // displayName vom Auth-Token
        email: userEmail, // email vom Auth-Token
      };
      await newPlayerRef.set(newPlayerData);
      newPlayerCreated = true;
      console.log(`[createNewGroup] Created new player entry with playerDocId ${playerDocId} for creator ${userId}.`);

      // Aktualisiere oder erstelle User-Dokument mit neuem playerDocId
      if (userSnap.exists) {
        await userRef.update({ playerId: playerDocId, lastActiveGroupId: newGroupRef.id, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
      } else {
        await userRef.set({
            displayName: userDisplayName,
            email: userEmail,
            playerId: playerDocId,
            lastActiveGroupId: newGroupRef.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } else {
        // Wenn PlayerDocId existiert, stelle sicher, dass die neue groupID in groupIds-Array ist
        const playerRefToUpdate = db.collection("players").doc(playerDocId);
        await playerRefToUpdate.update({
            groupIds: admin.firestore.FieldValue.arrayUnion(newGroupRef.id),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
         console.log(`[createNewGroup] Ensured group ${newGroupRef.id} is in playerDoc ${playerDocId} groupIds.`);
    }
    // --- Ende Ermittlung playerDocId ---

    // Verwende das lokale FirestoreGroup-Interface für Strukturklarheit
    const newGroupData: Omit<FirestoreGroup, 'id'> & { players: Record<string, FirestorePlayerInGroup> } = {
      name: data.name.trim(),
      description: typeof data.description === "string" ? data.description.trim() : "",
      isPublic: typeof data.isPublic === "boolean" ? data.isPublic : false,
      createdAt: admin.firestore.Timestamp.now(),
      createdBy: userId, // authUid des Erstellers
      playerIds: [playerDocId], // playerDocId des Erstellers
      adminIds: [userId], // authUid des Erstellers bleibt Admin
      players: {
        [playerDocId]: { // playerDocId als Schlüssel
          displayName: userDisplayName,
          email: userEmail ?? null,
          joinedAt: admin.firestore.Timestamp.now(),
        }
      },
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await newGroupRef.set(newGroupData);

    // Update user document with lastActiveGroupId
    if (!newPlayerCreated) { // Nur wenn nicht schon oben beim Erstellen des Players passiert
        if (userSnap.exists) {
            const userData = userSnap.data();
            if (userData?.lastActiveGroupId !== newGroupRef.id) {
                 await userRef.update({ lastActiveGroupId: newGroupRef.id, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
            }
        } else {
            // Sollte nicht passieren, da userSnap oben geholt wird, aber zur Sicherheit
             await userRef.set({
                displayName: userDisplayName,
                email: userEmail,
                playerId: playerDocId,
                lastActiveGroupId: newGroupRef.id,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastLogin: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true }); // merge falls doch Race Condition
        }
    }

    console.log(`Group ${newGroupRef.id} created by user ${userId} (playerDocId: ${playerDocId}). Initial players object:`, newGroupData.players);
    return { success: true, groupId: newGroupRef.id, playerDocId: playerDocId };
  } catch (error) {
    console.error(`Error creating group for user ${userId}:`, error);
    throw new HttpsError("internal", "Gruppe konnte nicht erstellt werden.");
  }
});

/**
 * Fügt einen Spieler zu einer bestehenden Gruppe hinzu (nur Admins).
 */
export const addPlayerToGroup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentifizierung erforderlich.");
  }
  const adminUserId = request.auth.uid;
  const data = request.data as { groupId?: string; playerToAddAuthUid?: string }; // Umbenannt zur Klarheit

  if (!data || typeof data.groupId !== "string" || typeof data.playerToAddAuthUid !== "string") {
    throw new HttpsError("invalid-argument", "Gruppen-ID oder Spieler-Authentifizierungs-ID fehlt.");
  }
  const { groupId, playerToAddAuthUid } = data;

  const groupRef = db.collection("groups").doc(groupId);

  try {
    let playerDocIdToAdd: string | null = null;
    let playerDisplayName = "Unbekannter Jasser";
    let playerEmail: string | null = null;

    // Schritt 1: Finde den User und seinen playerDocId
    const userToAddRef = db.collection("users").doc(playerToAddAuthUid);
    const userToAddSnap = await userToAddRef.get();

    if (userToAddSnap.exists) {
      const userToAddData = userToAddSnap.data();
      playerDisplayName = userToAddData?.displayName || playerDisplayName;
      playerEmail = userToAddData?.email || null;
      if (userToAddData?.playerId) {
        // Überprüfe, ob dieser Player-Datensatz auch wirklich existiert
        const playerCheckRef = db.collection("players").doc(userToAddData.playerId);
        const playerCheckSnap = await playerCheckRef.get();
        if (playerCheckSnap.exists) {
          playerDocIdToAdd = userToAddData.playerId;
          console.log(`[addPlayerToGroup] Found existing playerDocId ${playerDocIdToAdd} from user doc for user ${playerToAddAuthUid}.`);
        } else {
          console.warn(`[addPlayerToGroup] playerDocId ${userToAddData.playerId} from user doc for ${playerToAddAuthUid} does not exist in players collection.`);
          // playerDocIdToAdd bleibt null, wird unten behandelt
        }
      }
    }

    // Schritt 2: Falls playerDocId nicht im User-Dokument, suche in der "players"-Collection
    if (!playerDocIdToAdd) {
      const playerQuery = db.collection("players").where("userId", "==", playerToAddAuthUid).limit(1);
      const playerQuerySnapshot = await playerQuery.get();
      if (!playerQuerySnapshot.empty) {
        playerDocIdToAdd = playerQuerySnapshot.docs[0].id;
        const playerData = playerQuerySnapshot.docs[0].data();
        playerDisplayName = playerData?.displayName || playerData?.nickname || playerDisplayName;
        // playerEmail könnte hier auch aus playerDaten kommen, falls vorhanden
        console.log(`[addPlayerToGroup] Found existing playerDocId ${playerDocIdToAdd} via query for user ${playerToAddAuthUid}.`);
        // Stelle sicher, dass der User-Doc auch diesen PlayerId hat (falls userDoc existiert)
        if (userToAddSnap.exists && userToAddSnap.data()?.playerId !== playerDocIdToAdd) {
          await userToAddRef.update({ playerId: playerDocIdToAdd, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
        }
      } else {
        // Optional: Wenn der Spieler gar nicht existiert, könnte man hier einen Fehler werfen oder einen neuen erstellen.
        // Fürs Erste werfen wir einen Fehler, da "addPlayerToGroup" impliziert, dass der Spieler existiert.
        throw new HttpsError("not-found", `Spieler mit authUid ${playerToAddAuthUid} konnte nicht in der Players-Collection gefunden werden und hat keinen PlayerId im User-Dokument.`);
      }
    }

    if (!playerDocIdToAdd) {
        // Sollte durch die Logik oben eigentlich nicht erreicht werden, aber als Sicherheitsnetz
        throw new HttpsError("internal", `Konnte playerDocId für ${playerToAddAuthUid} nicht ermitteln.`);
    }

    await db.runTransaction(async (transaction) => {
      const groupSnap = await transaction.get(groupRef);
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Gruppe nicht gefunden.");
      }

      const groupData = groupSnap.data() as FirestoreGroup | undefined;
      if (!groupData?.adminIds?.includes(adminUserId)) {
        throw new HttpsError("permission-denied", "Nur Admins dürfen Spieler hinzufügen.");
      }

      // Verwende playerDocIdToAdd statt playerToAddAuthUid für die Überprüfung und das Hinzufügen
      if (groupData.playerIds?.includes(playerDocIdToAdd)) {
        console.log(`Player (docId: ${playerDocIdToAdd}) is already in group ${groupId}.`);
        // Prüfe, ob der Eintrag im players-Objekt fehlt oder aktualisiert werden muss
        if (!groupData.players?.[playerDocIdToAdd]) {
            console.log(`Player (docId: ${playerDocIdToAdd}) is in playerIds but missing in players object. Adding now.`);
            transaction.update(groupRef, {
                [`players.${playerDocIdToAdd}`]: {
                    displayName: playerDisplayName,
                    email: playerEmail,
                    joinedAt: admin.firestore.Timestamp.now(),
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return; // Nichts weiter zu tun, wenn schon Mitglied und Eintrag vorhanden
      }

      // Spieler zum playerIds Array hinzufügen
      transaction.update(groupRef, {
        playerIds: admin.firestore.FieldValue.arrayUnion(playerDocIdToAdd),
        [`players.${playerDocIdToAdd}`]: {
          displayName: playerDisplayName,
          email: playerEmail,
          joinedAt: admin.firestore.Timestamp.now(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Füge die groupId zum groupIds Array des Spielers hinzu
      const playerRef = db.collection("players").doc(playerDocIdToAdd);
      transaction.update(playerRef, {
        groupIds: admin.firestore.FieldValue.arrayUnion(groupId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    console.log(`Player (docId: ${playerDocIdToAdd}, authUid: ${playerToAddAuthUid}) added to group ${groupId} by admin ${adminUserId}`);
    return { success: true, playerDocIdAdded: playerDocIdToAdd };
  } catch (error) {
    console.error(`Error adding player (authUid: ${playerToAddAuthUid}) to group ${groupId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    } else {
      throw new HttpsError("internal", "Spieler konnte nicht hinzugefügt werden." + (error instanceof Error ? ` (${error.message})` : ""));
    }
  }
});

// NEU: Funktion zum Generieren eines Einladungstokens für ein Turnier
export const generateTournamentInviteToken = onCall<GenerateTournamentTokenData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Der Nutzer muss angemeldet sein, um einen Turnier-Einladungscode zu generieren."
    );
  }

  const userId = request.auth.uid;
  const tournamentId = request.data.tournamentId;

  if (!tournamentId || typeof tournamentId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Die Turnier-ID fehlt oder hat ein ungültiges Format."
    );
  }

  console.info(`User ${userId} requests invite token for tournament ${tournamentId}`);

  try {
    const tournamentRef = db.collection("tournaments").doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();

    if (!tournamentSnap.exists) {
      throw new HttpsError("not-found", "Turnier nicht gefunden.");
    }

    const tournamentData = tournamentSnap.data() as FirestoreTournamentInstance | undefined;
    if (!tournamentData?.adminIds?.includes(userId)) {
      throw new HttpsError(
        "permission-denied",
        "Nur Turnier-Admins können Einladungscodes generieren."
      );
    }
    
    // Token-Generierung (analog zu Gruppen)
    const token = crypto.randomBytes(24).toString("hex");
    const now = admin.firestore.Timestamp.now();
    // Token-Ablaufzeit: z.B. 7 Tage (konfigurierbar)
    const expirationSeconds = now.seconds + (7 * 24 * 60 * 60); 
    const expiresAt = admin.firestore.Timestamp.fromMillis(expirationSeconds * 1000);

    const inviteTokenData = {
      tournamentId: tournamentId,
      token: token,
      expiresAt: expiresAt,
      isValid: true,
      generatedBy: userId,
      createdAt: now,
    };

    // Token in neuer Collection speichern, z.B. 'tournamentInviteTokens'
    await db.collection("tournamentInviteTokens").add(inviteTokenData);

    console.info(`Successfully generated invite token for tournament ${tournamentId} by user ${userId}`);
    return { token: token };
  } catch (error) {
    console.error(`Error generating invite token for tournament ${tournamentId} by user ${userId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    } else {
      throw new HttpsError(
        "internal",
        "Ein interner Fehler ist beim Generieren des Turnier-Einladungscodes aufgetreten."
      );
    }
  }
});

// NEU: Funktion zum Einlösen eines Turnier-Einladungstokens
export const acceptTournamentInviteFunction = onCall<AcceptTournamentInviteData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Der Nutzer muss angemeldet sein, um einer Einladung zu folgen."
    );
  }

  const userId = request.auth.uid;
  const tokenString = request.data.token;

  if (!tokenString || typeof tokenString !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Der Einladungscode fehlt oder hat ein ungültiges Format."
    );
  }

  console.info(`User ${userId} attempts to join tournament with token ${tokenString}`);
  let tournamentIdToJoin: string | null = null;

  try {
    // 1. Token-Dokument finden
    const tokenQuery = db.collection("tournamentInviteTokens").where("token", "==", tokenString);
    const tokenQuerySnapshot = await tokenQuery.get();

    if (tokenQuerySnapshot.empty) {
      throw new HttpsError("not-found", "Einladungscode nicht gefunden oder ungültig.");
    }

    const tokenDocSnapshot = tokenQuerySnapshot.docs[0];
    const tokenData = tokenDocSnapshot.data();

    if (!tokenData) {
      throw new HttpsError("internal", "Fehler beim Lesen der Token-Daten.");
    }

    // 2. Token validieren (Gültigkeit, Ablaufdatum)
    if (!tokenData.isValid) {
      throw new HttpsError("permission-denied", "Dieser Einladungscode ist nicht mehr gültig.");
    }

    const now = admin.firestore.Timestamp.now();
    if (tokenData.expiresAt.toMillis() < now.toMillis()) {
      // Token als ungültig markieren, wenn abgelaufen
      await tokenDocSnapshot.ref.update({ isValid: false });
      throw new HttpsError("permission-denied", "Dieser Einladungscode ist abgelaufen.");
    }

    tournamentIdToJoin = tokenData.tournamentId;
    if (!tournamentIdToJoin) {
      throw new HttpsError("internal", "Turnier-ID im Token nicht gefunden.");
    }

    // 3. Turnierbeitritt in einer Transaktion
    const joinResult = await db.runTransaction(async (transaction) => {
      // Type Guard um TypeScript zu versichern, dass tournamentIdToJoin ein string ist
      if (!tournamentIdToJoin) {
        throw new Error("Turnier-ID ist ungültig");
      }
      const tournamentRef = db.collection("tournaments").doc(tournamentIdToJoin);
      const tournamentSnap = await transaction.get(tournamentRef);

      if (!tournamentSnap.exists) {
        throw new Error("Turnier nicht gefunden."); // Wird von HttpsError unten behandelt
      }

      const tournamentData = tournamentSnap.data() as FirestoreTournamentInstance | undefined;
      if (!tournamentData) {
        throw new Error("Fehler beim Lesen der Turnierdaten.");
      }

      // Prüfen, ob Turnier den Beitritt erlaubt (Status 'active' oder 'upcoming')
      if (tournamentData.status !== 'active' && tournamentData.status !== 'upcoming') {
        throw new Error("Diesem Turnier kann derzeit nicht beigetreten werden (Status: " + tournamentData.status + ").");
      }

      // Prüfen, ob User bereits Teilnehmer ist
      if (tournamentData.participantUids?.includes(userId)) {
        console.log(`User ${userId} is already a participant of tournament ${tournamentIdToJoin}.`);
        return { success: true, alreadyMember: true, tournamentId: tournamentIdToJoin };
      }

      // Max-Participants-Limit prüfen
      const maxParticipants = tournamentData.settings?.maxParticipants;
      if (maxParticipants && maxParticipants > 0 && tournamentData.participantUids?.length >= maxParticipants) {
        throw new Error("Das Turnier hat bereits die maximale Teilnehmerzahl erreicht.");
      }

      // User zur Teilnehmerliste hinzufügen
      transaction.update(tournamentRef, {
        participantUids: admin.firestore.FieldValue.arrayUnion(userId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Optional: Token als verbraucht markieren (isValid: false)
      // Für einmalige Verwendung, hier einkommentieren:
      // transaction.update(tokenDocSnapshot.ref, { isValid: false });

      return { success: true, alreadyMember: false, tournamentId: tournamentIdToJoin };
    });

    console.info(`User ${userId} successfully joined tournament ${joinResult.tournamentId}`);
    return joinResult;
  } catch (error) {
    console.error(`Error for user ${userId} joining tournament with token ${tokenString}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    } else {
      // Transaktionsfehler oder andere interne Fehler in HttpsError umwandeln
      throw new HttpsError("internal", error instanceof Error ? error.message : "Beitritt zum Turnier fehlgeschlagen.");
    }
  }
});

// ============================================
// === Cloud Function zur Synchronisation von User zu Player ===
// ============================================

// Interface für die User-Daten
interface FirestoreUser { 
  displayName?: string;
  photoURL?: string | null;
  statusMessage?: string;
  playerId?: string;
}

/**
 * Synchronisiert Änderungen an displayName, photoURL und statusMessage
 * von einem /users/{userId} Dokument zum entsprechenden /players/{playerId} Dokument.
 * Verwendet Firestore v2 Trigger.
 */
export const syncUserProfileToPlayer = onDocumentUpdated(
  // Pfad und Optionen
  { document: "users/{userId}", region: "europe-west1" } as DocumentOptions<"users/{userId}">,
  // Event Handler mit korrekten Typen
  async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, { userId: string }>) => {
    const change = event.data;
    if (!change) {
      console.log(`[syncUserProfileToPlayer] Event data missing for event ID: ${event.id}. Exiting.`);
      return null;
    }

    // Korrektes Typ-Casting für beforeData und afterData
    const beforeData = change.before.data() as FirestoreUser | undefined;
    const afterData = change.after.data() as FirestoreUser | undefined; 
    const userId = event.params.userId;

    if (!afterData) {
       console.log(`[syncUserProfileToPlayer] Document users/${userId} deleted. No sync needed.`);
       return null;
    }

    const nameChanged = beforeData?.displayName !== afterData.displayName;
    const photoChanged = beforeData?.photoURL !== afterData.photoURL;
    const statusChanged = beforeData?.statusMessage !== afterData.statusMessage;

    if (!nameChanged && !photoChanged && !statusChanged) {
      return null;
    }

    const playerId = afterData.playerId; 
    if (!playerId || typeof playerId !== 'string') {
      console.warn(`[syncUserProfileToPlayer] No valid playerId found in users/${userId}. Cannot sync.`);
      return null;
    }

    console.log(`[syncUserProfileToPlayer] Changes detected for user ${userId}. Syncing to player ${playerId}.`);

    const playerUpdateData: { [key: string]: unknown } = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (nameChanged) {
        playerUpdateData.displayName = afterData.displayName ?? null; 
    }
    if (photoChanged) {
        playerUpdateData.photoURL = afterData.photoURL ?? null; 
    }
    // if (statusChanged) { ... }

    const playerRef = admin.firestore().collection("players").doc(playerId);
    try {
      await playerRef.set(playerUpdateData, { merge: true }); 
      console.log(`[syncUserProfileToPlayer] Successfully synced user ${userId} changes to player ${playerId}.`);
      return null;
    } catch (error) {
      console.error(`[syncUserProfileToPlayer] Error updating player document ${playerId} for user ${userId}:`, error);
      return null;
    }
  }
);

// ============================================
// === Andere Funktionen bleiben unverändert ===
// ============================================ 

// --- Trigger aus tournamentGameProcessing.ts ---
export const processTournamentGameCompletion = tournamentGameLogic.processTournamentGameCompletion;

// --- NEU: Finalize Tournament (Callable Function) ---
export { finalizeTournament } from './finalizeTournament';

// --- Session Merge Functions ---
export { mergeSessions } from './mergeSessions';

// ... (restliche Funktionen wie scheduledFirestoreBackup etc.) ... 