import {https, region as functionsRegion} from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
// import { FirestoreGroup } from "../../src/types/group"; // <-- Entfernt wegen Modul-Konflikt

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
// --- Lokale Typdefinition ENDE ---

// Initialisierung von Firebase Admin (nur einmal pro Instanz)
try {
  admin.initializeApp();
} catch (e) {
  console.info("Firebase Admin SDK already initialized.");
}

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

/**
 * Generiert einen sicheren, zeitlich begrenzten Einladungstoken für eine Gruppe.
 * Nur Admins der Gruppe können diese Funktion aufrufen.
 */
export const generateGroupInviteToken = functionsRegion("europe-west1")
  .https.onCall(async (data: GenerateTokenData, context: https.CallableContext) => {
    // 1. Authentifizierung prüfen
    if (!context.auth) {
      throw new https.HttpsError(
        "unauthenticated",
        "Der Nutzer muss angemeldet sein, um einen Einladungscode zu generieren."
      );
    }

    const userId = context.auth.uid;
    const groupId = data.groupId;

    // 2. Input validieren
    if (!groupId || typeof groupId !== "string") {
      throw new https.HttpsError(
        "invalid-argument",
        "Die Gruppen-ID fehlt oder hat ein ungültiges Format."
      );
    }

    console.info(`User ${userId} requests invite token for group ${groupId}`);

    try {
      // 3. Admin-Berechtigung prüfen
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new https.HttpsError("not-found", "Gruppe nicht gefunden.");
      }

      const groupData = groupSnap.data();
      if (!groupData?.adminIds?.includes(userId)) {
        throw new https.HttpsError(
          "permission-denied",
          "Nur Gruppen-Admins können Einladungscodes generieren."
        );
      }

      // 4. Sicheren Token generieren
      const token = crypto.randomBytes(24).toString("hex"); // 24 Bytes -> 48 hex chars

      // 5. Ablaufdatum berechnen (30 Tage)
      const now = admin.firestore.Timestamp.now();
      const expirationSeconds = now.seconds + (30 * 24 * 60 * 60); // 30 Tage in Sekunden
      const expiresAt = admin.firestore.Timestamp.fromMillis(expirationSeconds * 1000);

      // 6. Token in Firestore speichern
      const inviteData = {
        groupId: groupId,
        token: token,
        expiresAt: expiresAt,
        isValid: true,
        generatedBy: userId, // Optional: Wer hat's erstellt?
        createdAt: now, // Optional: Wann erstellt?
      };

      await db.collection("groupInvites").add(inviteData);

      console.info(`Successfully generated invite token for group ${groupId} by user ${userId}`);

      // 7. Token an Client zurückgeben
      return {token: token};
    } catch (error) {
      console.error(`Error generating invite token for group ${groupId} by user ${userId}:`, error);
      if (error instanceof https.HttpsError) {
        throw error; // Eigene Fehler weiterwerfen
      } else {
        // Allgemeine Fehler maskieren
        throw new https.HttpsError(
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
export const invalidateActiveGroupInvites = functionsRegion("europe-west1")
  .https.onCall(async (data: InvalidateInvitesData, context: https.CallableContext) => {
    // 1. Authentifizierung prüfen
    if (!context.auth) {
      throw new https.HttpsError(
        "unauthenticated",
        "Der Nutzer muss angemeldet sein, um Einladungscodes zurückzusetzen."
      );
    }

    const userId = context.auth.uid;
    const groupId = data.groupId;

    // 2. Input validieren
    if (!groupId || typeof groupId !== "string") {
      throw new https.HttpsError(
        "invalid-argument",
        "Die Gruppen-ID fehlt oder hat ein ungültiges Format."
      );
    }

    console.info(`User ${userId} requests invalidation of active invites for group ${groupId}`);

    try {
      // 3. Admin-Berechtigung prüfen (identisch zu generateGroupInviteToken)
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new https.HttpsError("not-found", "Gruppe nicht gefunden.");
      }

      const groupData = groupSnap.data();
      if (!groupData?.adminIds?.includes(userId)) {
        throw new https.HttpsError(
          "permission-denied",
          "Nur Gruppen-Admins können Einladungscodes zurücksetzen."
        );
      }

      // 4. Alle gültigen Tokens für die Gruppe abfragen
      const invitesQuery = db.collection("groupInvites")
        .where("groupId", "==", groupId)
        .where("isValid", "==", true);

      const querySnapshot = await invitesQuery.get();

      if (querySnapshot.empty) {
        console.info(`No active invites found for group ${groupId} to invalidate.`);
        return {success: true, invalidatedCount: 0}; // Keine Fehler, nichts zu tun
      }

      // 5. Batch Write vorbereiten, um alle gefundenen Tokens ungültig zu machen
      const batch = db.batch();
      querySnapshot.forEach((doc) => {
        batch.update(doc.ref, {isValid: false});
      });

      // 6. Batch ausführen
      await batch.commit();

      const invalidatedCount = querySnapshot.size;
      console.info(`Successfully invalidated ${invalidatedCount} active invites for group ${groupId} by user ${userId}`);

      // 7. Erfolg zurückgeben
      return {success: true, invalidatedCount: invalidatedCount};
    } catch (error) {
      console.error(`Error invalidating invites for group ${groupId} by user ${userId}:`, error);
      if (error instanceof https.HttpsError) {
        throw error;
      } else {
        throw new https.HttpsError(
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
export const joinGroupByToken = functionsRegion("europe-west1")
  .https.onCall(async (data: JoinGroupByTokenData, context: https.CallableContext) => {
    console.log("--- joinGroupByToken V9 START ---"); // Bereinigt
    // 1. Authentifizierung prüfen
    if (!context.auth) {
      throw new https.HttpsError(
        "unauthenticated",
        "Der Nutzer muss angemeldet sein, um einer Gruppe beizutreten."
      );
    }

    const userId = context.auth.uid;
    const userDisplayName = context.auth.token.name || "Unbekannter Jasser";
    const userEmail = context.auth.token.email;
    const token = data.token;

    // 2. Input validieren
    if (!token || typeof token !== "string") {
      throw new https.HttpsError(
        "invalid-argument",
        "Der Einladungscode fehlt oder hat ein ungültiges Format."
      );
    }

    console.info(`User ${userId} attempts to join group with token ${token}`);
    
    let groupId: string | null = null; // groupId hier deklarieren für äußeren Catch-Block

    try {
      // 3. Token-Dokument finden (Außerhalb der Transaktion)
      const tokenQuery = db.collection("groupInvites").where("token", "==", token);
      const tokenQuerySnapshot = await tokenQuery.get();

      if (tokenQuerySnapshot.empty) {
        throw new https.HttpsError("not-found", "Einladungscode nicht gefunden oder ungültig.");
      }

      const tokenDocSnapshot = tokenQuerySnapshot.docs[0];
      const tokenDataOutside = tokenDocSnapshot.data();
      const tokenDocId = tokenDocSnapshot.id;

      // 4. Token validieren (Außerhalb der Transaktion)
      if (!tokenDataOutside) {
        console.error(`T3.E1: tokenDoc exists but tokenData is undefined! Token: ${token}`);
        throw new https.HttpsError("internal", "Fehler beim Lesen der Token-Daten.");
      }

      if (!tokenDataOutside.isValid) {
        throw new https.HttpsError("permission-denied", "Dieser Einladungscode ist nicht mehr gültig.");
      }

      const now = admin.firestore.Timestamp.now();
      if (tokenDataOutside.expiresAt.toMillis() < now.toMillis()) {
        // Token als ungültig markieren (kann außerhalb der Transaktion erfolgen)
        await tokenDocSnapshot.ref.update({isValid: false});
        throw new https.HttpsError("permission-denied", "Dieser Einladungscode ist abgelaufen.");
      }

      groupId = tokenDataOutside.groupId; // Wert hier zuweisen
      if (!groupId) {
          // Wichtige Prüfung, falls groupId im Token fehlt
          console.error(`Initial Error: groupId missing in token data for ${tokenDocId}`);
          throw new https.HttpsError("internal", "Gruppen-ID im Token nicht gefunden.");
      }

      // --- Transaktion starten --- 
      try {
        console.info(`Starting transaction for user ${userId} joining group ${groupId}`); // Geändert zu info
        const joinResult = await db.runTransaction(async (transaction) => {
          // console.log("--- Transaction V9 Start ---"); // Entfernt

          // --- SCHRITT 1: PRELIMINARY READS --- 
          // console.log("TxRead Phase 1 Start"); // Entfernt
          // 1.1 User-Dokument lesen
          const userRef = db.collection("users").doc(userId);
          // console.log("TxRead: userRef"); // Entfernt
          const userSnap = await transaction.get(userRef);
          
          // 1.2 Token-Dokument lesen (erneut, für Konsistenz innerhalb der Tx)
          const tokenRef = db.collection("groupInvites").doc(tokenDocId);
          // console.log("TxRead: tokenRef"); // Entfernt
          const tokenDoc = await transaction.get(tokenRef);
          // console.log("TxRead Phase 1 End"); // Entfernt

          // --- SCHRITT 2: VALIDATE TOKEN & GET GROUP ID (within Tx) --- 
          // console.log("TxValidate & Get GroupId Start"); // Entfernt
          if (!tokenDoc.exists) {
            console.error(`Transaction Error: Token document ${tokenDocId} disappeared!`);
            throw new Error("Einladungscode konnte nicht erneut gelesen werden.");
          }
          const tokenData = tokenDoc.data();
          // Erneute Validierung des Tokens innerhalb der Transaktion
          if (!tokenData || !tokenData.isValid || tokenData.expiresAt.toMillis() < admin.firestore.Timestamp.now().toMillis()) {
            console.warn(`Transaction Warning: Token ${tokenDocId} became invalid or expired during transaction.`);
            throw new Error("Einladungscode wurde während des Vorgangs ungültig oder ist abgelaufen.");
          }
          
          const currentGroupId = tokenData.groupId;
          if (!currentGroupId || typeof currentGroupId !== 'string') { 
            console.error("Transaction Error: groupId missing or invalid in token data during transaction.");
            throw new Error("Gruppen-ID im Token nicht gefunden oder ungültig.");
          }
          // console.log(`TxValidate & Get GroupId End: Found GroupId ${currentGroupId}`); // Entfernt

          // --- SCHRITT 3: REMAINING READS (using validated currentGroupId) --- 
          // console.log("TxRead Phase 2 Start"); // Entfernt
          // 3.1 Gruppen-Dokument lesen
          const groupRef = db.collection("groups").doc(currentGroupId);
          // console.log("TxRead: groupRef"); // Entfernt
          const groupSnap = await transaction.get(groupRef);
          
          // 3.2 Bedingte Reads für Player-ID Ermittlung
          let playerVerifySnap: admin.firestore.DocumentSnapshot | null = null;
          let playerQuerySnapshot: admin.firestore.QuerySnapshot | null = null;
          let initialPlayerId: string | null = null;
          
          if (userSnap.exists && userSnap.data()?.playerId) {
            initialPlayerId = userSnap.data()?.playerId;
            const playerVerifyRef = db.collection("players").doc(initialPlayerId!);
            // console.log(`TxRead: playerVerifyRef for ${initialPlayerId}`); // Entfernt
            playerVerifySnap = await transaction.get(playerVerifyRef);
          } else {
            const playerQuery = db.collection("players").where("userId", "==", userId);
            // console.log("TxRead: playerQuery"); // Entfernt
            playerQuerySnapshot = await transaction.get(playerQuery);
          }
          // console.log("TxRead Phase End"); // Entfernt
          
          // --- SCHRITT 4: VALIDIERUNG & LOGIK (basierend auf Reads) --- 
          // console.log("TxLogic Phase Start"); // Entfernt
          
          // 2.1 Gruppen-Dokument prüfen
          if (!groupSnap.exists) {
            console.error(`Transaction Error: Group ${currentGroupId} not found.`);
            throw new Error("Die zugehörige Gruppe wurde nicht gefunden.");
          }
          const groupData = groupSnap.data()!;
          if (!groupData) {
            console.error(`Transaction Error: Could not read data for group ${currentGroupId}.`);
            throw new Error("Fehler beim Lesen der Gruppendaten.");
          }
          
          // 2.2 Token-Dokument prüfen (innerhalb Tx)
          if (!tokenDoc.exists) {
            console.error(`Transaction Error: Token document ${tokenDocId} disappeared!`);
            throw new Error("Einladungscode konnte nicht erneut gelesen werden.");
          }
          const tokenDataInside = tokenDoc.data();
          if (!tokenDataInside || !tokenDataInside.isValid || tokenDataInside.expiresAt.toMillis() < admin.firestore.Timestamp.now().toMillis()) {
            // Wenn Token inzwischen ungültig/abgelaufen ist, Fehler werfen.
            // Das Markieren als ungültig kann ggf. außerhalb erfolgen, wenn abgelaufen.
            console.warn(`Transaction Warning: Token ${tokenDocId} became invalid or expired during transaction.`);
            throw new Error("Einladungscode wurde während des Vorgangs ungültig oder ist abgelaufen.");
          }
          
          // 2.3 Prüfen, ob Nutzer bereits Mitglied ist
          if (groupData.playerIds?.includes(userId)) {
            console.log(`Transaction: User ${userId} is already a member of group ${currentGroupId}.`);
            const existingGroupData = { id: groupSnap.id, ...groupData } as FirestoreGroup;
            return {success: true, alreadyMember: true, group: existingGroupData };
          }
          
          // 2.4 Korrekte Player-ID bestimmen
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
            // Kein existierender Player gefunden, neue ID generieren
            finalPlayerId = crypto.randomBytes(12).toString('hex');
            createNewPlayer = true;
            console.log(`TxLogic: Will create new player with ID ${finalPlayerId}.`);
          }
          
          if (!finalPlayerId) {
             // Sollte nicht passieren, aber zur Sicherheit
             console.error("TxLogic: CRITICAL - Could not determine finalPlayerId!");
             throw new Error("Konnte die Spieler-ID nicht bestimmen.");
          }
          
          // 2.5 Player-Daten vorbereiten (nur wenn neu erstellt wird)
          let newPlayerData: any = null;
          if (createNewPlayer) {
             newPlayerData = {
                userId: userId,
                nickname: userDisplayName || `Spieler_${userId.substring(0, 6)}`,
                isGuest: false,
                stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
                groupIds: [], // Wird unten hinzugefügt
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
             };
          }
          
          // 2.6 User-Daten für Update vorbereiten
          let userUpdateData: any = {
             playerId: finalPlayerId,
             lastActiveGroupId: currentGroupId, // Use validated group Id
             lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          };
          if (!userSnap.exists) {
             userUpdateData = {
                ...userUpdateData,
                displayName: userDisplayName,
                email: userEmail,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastLogin: admin.firestore.FieldValue.serverTimestamp(), 
             };
          }
          
          // console.log("TxLogic Phase End"); // Entfernt
          
          // --- SCHRITT 5: ALLE WRITES --- 
          // console.log("TxWrite Phase Start"); // Entfernt
          
          // 3.1 Neuen Player schreiben (falls nötig)
          if (createNewPlayer) {
            const newPlayerRef = db.collection("players").doc(finalPlayerId);
            // console.log(`TxWrite: Setting new player document ${finalPlayerId}`); // Entfernt
            transaction.set(newPlayerRef, newPlayerData);
          }
          
          // 3.2 User-Dokument schreiben/aktualisieren
          if (!userSnap.exists) {
            userUpdateData.lastActiveGroupId = currentGroupId;
            // console.log(`TxWrite: Setting new user document ${userId}`); // Entfernt
            transaction.set(userRef, userUpdateData);
          } else {
            const currentUserData = userSnap.data();
            // Nur aktualisieren, wenn playerId nicht schon korrekt gesetzt war oder fehlte ODER lastActiveGroupId geändert wurde
            if (currentUserData?.playerId !== finalPlayerId || currentUserData?.lastActiveGroupId !== currentGroupId) {
               // console.log(`TxWrite: Updating user document ${userId} (playerId or lastActiveGroupId differs)`); // Entfernt
               transaction.update(userRef, {
                  playerId: finalPlayerId,
                  lastActiveGroupId: currentGroupId, // Use validated group Id
                  lastUpdated: admin.firestore.FieldValue.serverTimestamp()
               });
            } else {
               // console.log(`TxWrite: No user document update needed for ${userId} (playerId and lastActiveGroupId match).`); // Entfernt
            }
          }
          
          // 3.3 Player-Dokument aktualisieren (Gruppe hinzufügen)
          const playerRef = db.collection("players").doc(finalPlayerId);
          // console.log(`TxWrite: Updating player document ${finalPlayerId} (add groupId ${currentGroupId})`); // Entfernt
          transaction.update(playerRef, {
             groupIds: admin.firestore.FieldValue.arrayUnion(currentGroupId), // Use validated group Id
             updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          // 3.4 Gruppen-Dokument aktualisieren (User hinzufügen)
          const groupPlayerEntry = {
             displayName: userDisplayName,
             email: userEmail,
             joinedAt: admin.firestore.Timestamp.now(),
          };
          
          // KORRIGIERT: userId statt finalPlayerId als Schlüssel im players-Objekt
          console.log(`[Tx Detail] Updating group ${currentGroupId}: Adding playerId=${finalPlayerId} to playerIds array and metadata to players.${userId}`);
          transaction.update(groupRef, {
             playerIds: admin.firestore.FieldValue.arrayUnion(finalPlayerId),
             [`players.${userId}`]: groupPlayerEntry, // Verwendet userId als Schlüssel
             updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Gruppendaten für die Rückgabe vorbereiten (basierend auf groupSnap und den Updates)
          const resultingGroupData = {
            id: groupSnap.id, 
            ...groupData, 
            playerIds: [...(groupData.playerIds || []), finalPlayerId], 
            players: {
              ...(groupData.players || {}),
              [userId]: groupPlayerEntry // Verwendet userId als Schlüssel
            }
          } as FirestoreGroup;
          
          // console.log("TxWrite Phase End (with groupId)"); // Entfernt
          // console.log("--- Transaction V9 End: Success ---"); // Entfernt
          return {success: true, alreadyMember: false, group: resultingGroupData };

        }).catch((transactionError) => {
          // Fängt NUR Fehler aus der Transaktion selbst
          console.error(`Error during transaction V9 execution for user ${userId}, group ${groupId || 'UNKNOWN'}:`, transactionError);
          // Fehler neu verpacken für den Client
          throw new https.HttpsError(
            "internal",
            `Interner Fehler beim Beitritt zur Gruppe: ${transactionError instanceof Error ? transactionError.message : 'Unbekannter Transaktionsfehler'}`
          );
        });
        
        // Direkt das Ergebnis der erfolgreichen Transaktion zurückgeben
        console.info(`Transaction V9 completed successfully for user ${userId} joining group ${groupId}.`); // Geändert zu info
        return joinResult; 
        
      } catch (error) {
        // Fängt Fehler GANZ AUẞEN (z.B. Token-Validierung VOR der Transaktion)
        console.error(`Outer error joining group ${groupId || '(groupId not determined yet)'} for user ${userId}:`, error);
        if (error instanceof https.HttpsError) {
          throw error; // Bestehenden HttpsError weiterwerfen
        } else {
          // Allgemeine Fehler
          throw new https.HttpsError(
            "internal",
            "Ein äußerer Fehler ist beim Beitreten zur Gruppe aufgetreten."
          );
        }
      }
    } catch (error) {
      // Fängt Fehler GANZ AUẞEN (z.B. Token-Validierung VOR der Transaktion)
      console.error(`Outer error joining group ${groupId || '(groupId not determined yet)'} for user ${userId}:`, error);
      if (error instanceof https.HttpsError) {
        throw error; // Bestehenden HttpsError weiterwerfen
      } else {
        // Allgemeine Fehler
        throw new https.HttpsError(
          "internal",
          "Ein äußerer Fehler ist beim Beitreten zur Gruppe aufgetreten."
        );
      }
    }
  });

// --- NEUE FUNKTION START ---
/**
 * Wird ausgelöst, wenn ein neues User-Dokument in Firestore erstellt wird.
 * Erstellt automatisch das zugehörige Player-Dokument und verknüpft es.
 */
export const onCreateUserDocument = functionsRegion("europe-west1")
  .firestore.document("users/{userId}")
  .onCreate(async (snap, context) => {
    // Dynamischer Import von nanoid
    const { nanoid } = await import('nanoid');

    const userId = context.params.userId;
    const firestoreUserData = snap.data(); // User-Daten aus dem Firestore-Trigger

    if (!firestoreUserData) {
      console.error(`[onCreateUserDocument] User data is missing for user ${userId}. Cannot create player.`);
      return null;
    }

    let authDisplayName: string | null | undefined = null;
    let nickname: string;

    try {
      // --- NEU: Firebase Auth User abrufen --- 
      const authUser = await admin.auth().getUser(userId);
      authDisplayName = authUser.displayName;
      console.log(`[onCreateUserDocument] Fetched Auth user ${userId}, displayName: ${authDisplayName}`);
    } catch (authError) {
      console.error(`[onCreateUserDocument] Could not fetch Auth user for ${userId}:`, authError);
      // Fehler ist nicht kritisch, wir machen mit Firestore-Daten weiter
    }

    // --- Nickname bestimmen (Priorität: Auth > Firestore > Generisch) --- 
    nickname = authDisplayName || firestoreUserData.displayName || `Spieler_${nanoid(6)}`;

    console.log(`[onCreateUserDocument] Triggered for user ${userId}. Using nickname: ${nickname}. Creating player...`);

    // 1. Erstelle das Player-Dokument
    // --- ALT: const playerId = nanoid(); --- (Wir verwenden die userId oder eine Hash davon?)
    // Konsistenz: Wir sollten dieselbe Logik wie im Client verwenden, falls dort eine ID generiert wird
    // ODER eine stabile ID verwenden. Fürs Erste generieren wir eine neue ID.
    const playerId = db.collection("players").doc().id; // Generiert eine Firestore Auto-ID

    const playerRef = db.collection("players").doc(playerId);
    const playerData = {
      // id: playerId, // ID ist im Dokumentpfad, nicht im Dokument selbst
      nickname: nickname, // Der ermittelte Nickname
      userId: userId,
      isGuest: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      groupIds: [],
      stats: {
        gamesPlayed: 0,
        wins: 0,
        totalScore: 0,
      },
      metadata: { createdBy: 'onCreateUserDocument' }, // Optional: Markierung woher es kam
    };

    try {
      await playerRef.set(playerData); // Verwende set() für eine neue ID
      console.log(`[onCreateUserDocument] Player document ${playerId} created successfully for user ${userId}.`);

      // 2. Aktualisiere das User-Dokument mit der neuen Player-ID
      await snap.ref.update({ 
        playerId: playerId,
        // Sicherstellen, dass displayName im Firestore auch gesetzt/aktuell ist
        displayName: nickname, // Speichere den finalen Nickname auch hier
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[onCreateUserDocument] User document ${userId} updated with playerId ${playerId} and ensured displayName.`);
      return null; // Erfolgreiche Ausführung

    } catch (error) {
      console.error(`[onCreateUserDocument] Error creating player or updating user for ${userId}:`, error);
      return null; // Funktion beenden
    }
  });
// --- NEUE FUNKTION ENDE ---

/**
 * Synchronisiert Änderungen am users-Dokument mit dem zugehörigen players-Dokument.
 * Wird ausgelöst, wenn ein users-Dokument aktualisiert wird.
 * Fokus auf Feldern: photoURL, statusMessage, displayName
 */
export const syncUserToPlayer = functionsRegion("europe-west1")
  .firestore.document("users/{userId}")
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const afterData = change.after.data();
    const beforeData = change.before.data();
    
    // Felder, die synchronisiert werden sollen
    const fieldsToSync = ['photoURL', 'statusMessage', 'displayName'];
    
    // Prüfen, ob relevante Felder geändert wurden
    const hasRelevantChanges = fieldsToSync.some(
      field => afterData[field] !== beforeData[field]
    );
    
    if (!hasRelevantChanges) {
      console.log(`[syncUserToPlayer] Keine relevanten Änderungen für User ${userId}. Synchronisation übersprungen.`);
      return null;
    }
    
    // PlayerId aus dem User-Dokument abrufen
    const playerId = afterData.playerId;
    if (!playerId) {
      console.log(`[syncUserToPlayer] Kein playerId für User ${userId} gefunden. Synchronisation nicht möglich.`);
      return null;
    }
    
    // Nur die relevanten, geänderten Felder extrahieren
    const updateData: Record<string, any> = {};
    let fieldCount = 0;
    
    for (const field of fieldsToSync) {
      if (afterData[field] !== beforeData[field] && afterData[field] !== undefined) {
        updateData[field] = afterData[field];
        fieldCount++;
      }
    }
    
    if (fieldCount === 0) {
      console.log(`[syncUserToPlayer] Keine effektiven Änderungen nach Filterung für User ${userId}.`);
      return null;
    }
    
    // Zeitstempel hinzufügen
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    
    try {
      // Player-Dokument aktualisieren
      const playerRef = db.collection("players").doc(playerId);
      await playerRef.update(updateData);
      
      console.log(`[syncUserToPlayer] Erfolgreich synchronisiert: User ${userId} -> Player ${playerId}, Felder: ${Object.keys(updateData).join(', ')}`);
      return null;
    } catch (error) {
      console.error(`[syncUserToPlayer] Fehler bei der Synchronisation von User ${userId} zu Player ${playerId}:`, error);
      return null;
    }
  });