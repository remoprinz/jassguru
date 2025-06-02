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
import * as archiveLogic from './archiveGame';
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
    console.log("--- joinGroupByToken V9 START --- (Gen 2)"); 
    // 1. Authentifizierung prüfen (context.auth -> request.auth)
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Der Nutzer muss angemeldet sein, um einer Gruppe beizutreten."
      );
    }

    const userId = request.auth.uid;
    // request.auth.token enthält die dekodierten Token-Claims
    const userDisplayName = request.auth.token.name || "Unbekannter Jasser";
    const userEmail = request.auth.token.email; // Kann undefined sein
    const token = request.data.token; // data.token -> request.data.token

    // 2. Input validieren
    if (!token || typeof token !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Der Einladungscode fehlt oder hat ein ungültiges Format."
      );
    }

    console.info(`User ${userId} attempts to join group with token ${token}`);
    
    let groupId: string | null = null; 

    try {
      // 3. Token-Dokument finden (Logik bleibt gleich)
      const tokenQuery = db.collection("groupInvites").where("token", "==", token);
      const tokenQuerySnapshot = await tokenQuery.get();

      if (tokenQuerySnapshot.empty) {
        throw new HttpsError("not-found", "Einladungscode nicht gefunden oder ungültig.");
      }

      const tokenDocSnapshot = tokenQuerySnapshot.docs[0];
      const tokenDataOutside = tokenDocSnapshot.data();
      const tokenDocId = tokenDocSnapshot.id;

      // 4. Token validieren (Logik bleibt gleich)
      if (!tokenDataOutside) {
        console.error(`T3.E1: tokenDoc exists but tokenData is undefined! Token: ${token}`);
        throw new HttpsError("internal", "Fehler beim Lesen der Token-Daten.");
      }

      if (!tokenDataOutside.isValid) {
        throw new HttpsError("permission-denied", "Dieser Einladungscode ist nicht mehr gültig.");
      }

      const now = admin.firestore.Timestamp.now();
      if (tokenDataOutside.expiresAt.toMillis() < now.toMillis()) {
        await tokenDocSnapshot.ref.update({isValid: false});
        throw new HttpsError("permission-denied", "Dieser Einladungscode ist abgelaufen.");
      }

      groupId = tokenDataOutside.groupId;
      if (!groupId) {
          console.error(`Initial Error: groupId missing in token data for ${tokenDocId}`);
          throw new HttpsError("internal", "Gruppen-ID im Token nicht gefunden.");
      }

      // --- Transaktion starten (Logik innen bleibt weitgehend gleich) --- 
      try {
        console.info(`Starting transaction for user ${userId} joining group ${groupId}`);
        const joinResult = await db.runTransaction(async (transaction: admin.firestore.Transaction) => {
          // --- SCHRITT 1: PRELIMINARY READS --- 
          const userRef = db.collection("users").doc(userId);
          const userSnap = await transaction.get(userRef);
          const tokenRef = db.collection("groupInvites").doc(tokenDocId);
          const tokenDoc = await transaction.get(tokenRef);

          // --- SCHRITT 2: VALIDATE TOKEN & GET GROUP ID (within Tx) --- 
          if (!tokenDoc.exists) {
            console.error(`Transaction Error: Token document ${tokenDocId} disappeared!`);
            throw new Error("Einladungscode konnte nicht erneut gelesen werden.");
          }
          const tokenData = tokenDoc.data();
          if (!tokenData || !tokenData.isValid || tokenData.expiresAt.toMillis() < admin.firestore.Timestamp.now().toMillis()) {
            console.warn(`Transaction Warning: Token ${tokenDocId} became invalid or expired during transaction.`);
            throw new Error("Einladungscode wurde während des Vorgangs ungültig oder ist abgelaufen.");
          }
          const currentGroupId = tokenData.groupId;
          if (!currentGroupId || typeof currentGroupId !== 'string') { 
            console.error("Transaction Error: groupId missing or invalid in token data during transaction.");
            throw new Error("Gruppen-ID im Token nicht gefunden oder ungültig.");
          }

          // --- SCHRITT 3: REMAINING READS (using validated currentGroupId) --- 
          const groupRef = db.collection("groups").doc(currentGroupId);
          const groupSnap = await transaction.get(groupRef);
          let playerVerifySnap: admin.firestore.DocumentSnapshot | null = null;
          let playerQuerySnapshot: admin.firestore.QuerySnapshot | null = null;
          let initialPlayerId: string | null = null;
          if (userSnap.exists && userSnap.data()?.playerId) {
            initialPlayerId = userSnap.data()?.playerId;
            const playerVerifyRef = db.collection("players").doc(initialPlayerId!);
            playerVerifySnap = await transaction.get(playerVerifyRef);
          } else {
            const playerQuery = db.collection("players").where("userId", "==", userId);
            playerQuerySnapshot = await transaction.get(playerQuery);
          }

          // --- SCHRITT 4: VALIDIERUNG & LOGIK (basierend auf Reads) --- 
          if (!groupSnap.exists) {
            console.error(`Transaction Error: Group ${currentGroupId} not found.`);
            throw new Error("Die zugehörige Gruppe wurde nicht gefunden.");
          }
          const groupData = groupSnap.data()!;
          if (!groupData) {
            console.error(`Transaction Error: Could not read data for group ${currentGroupId}.`);
            throw new Error("Fehler beim Lesen der Gruppendaten.");
          }
          if (groupData.playerIds?.includes(userId)) {
            console.log(`Transaction: User ${userId} is already a member of group ${currentGroupId}.`);
            const existingGroupData = { id: groupSnap.id, ...groupData } as FirestoreGroup;
            return {success: true, alreadyMember: true, group: existingGroupData };
          }
          let finalPlayerId: string | null = null;
          let createNewPlayer = false;
          if (initialPlayerId && playerVerifySnap?.exists) {
            finalPlayerId = initialPlayerId;
            console.log(`TxLogic: Confirmed existing player ${finalPlayerId} from user doc.`);
          } else if (playerQuerySnapshot && !playerQuerySnapshot.empty) {
            if (playerQuerySnapshot.size > 1) {
              console.warn(`TxLogic: Found MULTIPLE (${playerQuerySnapshot.size}) player docs for userId ${userId}! Using first one.`);
            }
            finalPlayerId = playerQuerySnapshot.docs[0].id;
            console.log(`TxLogic: Found existing player ${finalPlayerId} via query.`);
          } else {
            finalPlayerId = crypto.randomBytes(12).toString('hex');
            createNewPlayer = true;
            console.log(`TxLogic: Will create new player with ID ${finalPlayerId}.`);
          }
          if (!finalPlayerId) {
             console.error("TxLogic: CRITICAL - Could not determine finalPlayerId!");
             throw new Error("Konnte die Spieler-ID nicht bestimmen.");
          }
          let newPlayerData: unknown = null;
          if (createNewPlayer) {
             newPlayerData = {
                userId: userId,
                nickname: userDisplayName || `Spieler_${userId.substring(0, 6)}`,
                isGuest: false,
                stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
                groupIds: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
             };
          }
          let userUpdateData: unknown = {
             playerId: finalPlayerId,
             lastActiveGroupId: currentGroupId,
             lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          };
          if (!userSnap.exists) {
             userUpdateData = {
                ...(userUpdateData as object),
                displayName: userDisplayName,
                email: userEmail,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastLogin: admin.firestore.FieldValue.serverTimestamp(), 
             };
          }

          // --- SCHRITT 5: ALLE WRITES --- 
          if (createNewPlayer) {
            const newPlayerRef = db.collection("players").doc(finalPlayerId);
            transaction.set(newPlayerRef, newPlayerData);
          }
          if (!userSnap.exists) {
            const completeUserData = {
              ...(userUpdateData as object),
              lastActiveGroupId: currentGroupId,
            };
            transaction.set(userRef, completeUserData);
          } else {
            const currentUserData = userSnap.data();
            if (currentUserData?.playerId !== finalPlayerId || currentUserData?.lastActiveGroupId !== currentGroupId) {
               transaction.update(userRef, {
                  playerId: finalPlayerId,
                  lastActiveGroupId: currentGroupId,
                  lastUpdated: admin.firestore.FieldValue.serverTimestamp()
               });
            } else {
              // Kein Update nötig
            }
          }
          const playerRef = db.collection("players").doc(finalPlayerId);
          transaction.update(playerRef, {
             groupIds: admin.firestore.FieldValue.arrayUnion(currentGroupId),
             updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          const groupPlayerEntry = {
             displayName: userDisplayName,
             email: userEmail,
             joinedAt: admin.firestore.Timestamp.now(),
          };
          console.log(`[Tx Detail] Updating group ${currentGroupId}: Adding playerId=${finalPlayerId} to playerIds array and metadata to players.${userId}`);
          transaction.update(groupRef, {
             playerIds: admin.firestore.FieldValue.arrayUnion(finalPlayerId),
             [`players.${userId}`]: groupPlayerEntry,
             updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          const resultingGroupData = {
            id: groupSnap.id, 
            ...groupData, 
            playerIds: [...(groupData.playerIds || []), finalPlayerId], 
            players: {
              ...(groupData.players || {}),
              [userId]: groupPlayerEntry
            }
          } as FirestoreGroup;
          return {success: true, alreadyMember: false, group: resultingGroupData };
        }).catch((transactionError: Error) => {
          console.error(`Error during transaction V9 execution for user ${userId}, group ${groupId || 'UNKNOWN'}:`, transactionError);
          throw new HttpsError(
            "internal",
            `Interner Fehler beim Beitritt zur Gruppe: ${transactionError.message}`
          );
        });
        
        console.info(`Transaction V9 completed successfully for user ${userId} joining group ${groupId}.`); 
        return joinResult;
      } catch (error) {
        console.error(`Outer error joining group ${groupId || '(groupId not determined yet)'} for user ${userId}:`, error);
        if (error instanceof HttpsError) {
          throw error; 
        } else {
          throw new HttpsError(
            "internal",
            "Ein äußerer Fehler ist beim Beitreten zur Gruppe aufgetreten."
          );
        }
      }
    } catch (error) {
      console.error(`Outer error joining group ${groupId || '(groupId not determined yet)'} for user ${userId}:`, error);
      if (error instanceof HttpsError) {
        throw error;
      } else {
        throw new HttpsError(
          "internal",
          "Ein äußerer Fehler ist beim Beitreten zur Gruppe aufgetreten."
        );
      }
    }
  });

// --- finalizeSessionSummary (Callable Function wird exportiert) ---
export const finalizeSessionSummary = finalizeSessionLogic.finalizeSessionSummary; // <-- WIEDER AKTIV

// --- archivecompletedgame (Trigger wird exportiert) - NUR EINMAL! ---
export const archivecompletedgame = archiveLogic.archivecompletedgame;

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
  // Expliziter Typ für die erwarteten Daten
  const data = request.data as { name?: string; description?: string; isPublic?: boolean };

  if (!data || typeof data.name !== "string" || data.name.trim() === "") {
    throw new HttpsError("invalid-argument", "Gruppenname fehlt oder ist ungültig.");
  }

  const newGroupRef = db.collection("groups").doc(); // Automatisch generierte ID

  // Verwende das lokale FirestoreGroup-Interface für Strukturklarheit
  const newGroupData: Partial<FirestoreGroup> = {
    name: data.name.trim(),
    description: typeof data.description === "string" ? data.description.trim() : "",
    isPublic: typeof data.isPublic === "boolean" ? data.isPublic : false,
    createdAt: admin.firestore.Timestamp.now(),
    createdBy: userId,
    playerIds: [userId],
    adminIds: [userId], // Der Ersteller ist automatisch Admin
    // players Subcollection wird später gefüllt oder bleibt leer
  };

  try {
    await newGroupRef.set(newGroupData);
    console.log(`Group ${newGroupRef.id} created by user ${userId}`);
    return { success: true, groupId: newGroupRef.id };
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
  // Expliziter Typ für die erwarteten Daten
  const data = request.data as { groupId?: string; playerToAddUid?: string };

  if (!data || typeof data.groupId !== "string" || typeof data.playerToAddUid !== "string") {
    throw new HttpsError("invalid-argument", "Gruppen-ID oder Spieler-ID fehlt.");
  }
  const { groupId, playerToAddUid } = data;

  const groupRef = db.collection("groups").doc(groupId);

  try {
    await db.runTransaction(async (transaction) => {
      const groupSnap = await transaction.get(groupRef);
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Gruppe nicht gefunden.");
      }

      const groupData = groupSnap.data() as FirestoreGroup | undefined;
      if (!groupData?.adminIds?.includes(adminUserId)) {
        throw new HttpsError("permission-denied", "Nur Admins dürfen Spieler hinzufügen.");
      }

      if (groupData.playerIds?.includes(playerToAddUid)) {
        console.log(`Player ${playerToAddUid} is already in group ${groupId}.`);
        return; // Nichts zu tun
      }

      // Spieler-Daten abrufen (optional, für players-Subcollection)
      // const playerProfileRef = db.collection("users").doc(playerToAddUid);
      // const playerProfileSnap = await transaction.get(playerProfileRef);
      // const playerData = playerProfileSnap.data();

      // Update playerIds array
      transaction.update(groupRef, {
        playerIds: admin.firestore.FieldValue.arrayUnion(playerToAddUid),
        // Optional: Update players Subcollection
        // [`players.${playerToAddUid}.displayName`]: playerData?.displayName ?? "Unknown",
        // [`players.${playerToAddUid}.joinedAt`]: admin.firestore.Timestamp.now(),
      });
    });

    console.log(`Player ${playerToAddUid} added to group ${groupId} by admin ${adminUserId}`);
    return { success: true };
  } catch (error) {
    console.error(`Error adding player ${playerToAddUid} to group ${groupId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    } else {
      throw new HttpsError("internal", "Spieler konnte nicht hinzugefügt werden.");
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
      const tournamentRef = db.collection("tournaments").doc(tournamentIdToJoin!);
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

// ... (restliche Funktionen wie scheduledFirestoreBackup etc.) ... 