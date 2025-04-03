import {https, region as functionsRegion} from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

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
 */
export const joinGroupByToken = functionsRegion("europe-west1")
  .https.onCall(async (data: JoinGroupByTokenData, context: https.CallableContext) => {
    // 1. Authentifizierung prüfen
    if (!context.auth) {
      throw new https.HttpsError(
        "unauthenticated",
        "Der Nutzer muss angemeldet sein, um einer Gruppe beizutreten."
      );
    }

    const userId = context.auth.uid;
    // Wir brauchen DisplayName und Email für das `players` Objekt in der Gruppe
    const userDisplayName = context.auth.token.name || "Unbekannter Jasser";
    const userEmail = context.auth.token.email; // Kann null sein

    const token = data.token;

    // 2. Input validieren
    if (!token || typeof token !== "string") {
      throw new https.HttpsError(
        "invalid-argument",
        "Der Einladungscode fehlt oder hat ein ungültiges Format."
      );
    }

    console.info(`User ${userId} attempts to join group with token ${token}`);

    try {
      // 3. Token-Dokument finden
      const tokenQuery = db.collection("groupInvites").where("token", "==", token);
      const tokenQuerySnapshot = await tokenQuery.get();

      if (tokenQuerySnapshot.empty) {
        throw new https.HttpsError("not-found", "Einladungscode nicht gefunden oder ungültig.");
      }

      // Annahme: Tokens sind eindeutig, also nur ein Ergebnis erwartet
      const tokenDoc = tokenQuerySnapshot.docs[0];
      const tokenData = tokenDoc.data();

      // 4. Token validieren (Gültigkeit & Ablauf)
      if (!tokenData.isValid) {
        throw new https.HttpsError("permission-denied", "Dieser Einladungscode ist nicht mehr gültig.");
      }

      const now = admin.firestore.Timestamp.now();
      if (tokenData.expiresAt.toMillis() < now.toMillis()) {
        // Token als ungültig markieren, wenn abgelaufen
        await tokenDoc.ref.update({isValid: false});
        throw new https.HttpsError("permission-denied", "Dieser Einladungscode ist abgelaufen.");
      }

      const groupId = tokenData.groupId;

      // --- Transaktion starten ---
      const joinResult = await db.runTransaction(async (transaction) => {
        // 5. Gruppen-Dokument innerhalb der Transaktion lesen
        const groupRef = db.collection("groups").doc(groupId);
        const groupSnap = await transaction.get(groupRef);

        if (!groupSnap.exists) {
          throw new https.HttpsError("not-found", "Die zugehörige Gruppe wurde nicht gefunden.");
        }
        const groupData = groupSnap.data();
        if (!groupData) {
          throw new https.HttpsError("internal", "Fehler beim Lesen der Gruppendaten.");
        }

        // 6. Prüfen, ob Nutzer bereits Mitglied ist
        if (groupData.playerIds?.includes(userId)) {
          console.info(`User ${userId} is already a member of group ${groupId}.`);
          // Erfolg zurückgeben, da der Nutzer schon Mitglied ist
          return {success: true, alreadyMember: true, groupId: groupId, groupName: groupData.name};
        }

        // 7. Player-Dokument des Nutzers innerhalb der Transaktion lesen
        const playerRef = db.collection("players").doc(userId);
        const playerSnap = await transaction.get(playerRef);
        const playerGroups = playerSnap.exists ? playerSnap.data()?.groups || [] : [];

        // 8. Gruppe zum Player-Dokument hinzufügen (falls noch nicht vorhanden)
        if (!playerGroups.includes(groupId)) {
          playerGroups.push(groupId);
          if (playerSnap.exists) {
            transaction.update(playerRef, {groups: playerGroups});
          } else {
            // Player-Dokument erstellen, falls nicht vorhanden
            transaction.set(playerRef, {
              uid: userId,
              displayName: userDisplayName,
              email: userEmail || null, // Default auf null, falls nicht vorhanden
              groups: playerGroups,
            });
          }
        }

        // 9. Nutzer zur Gruppe hinzufügen
        const newPlayerIds = [...(groupData.playerIds || []), userId];
        const newPlayersMap = {
          ...(groupData.players || {}),
          [userId]: {
            displayName: userDisplayName,
            email: userEmail || null,
            joinedAt: now, // Beitrittszeitpunkt
          },
        };

        transaction.update(groupRef, {
          playerIds: newPlayerIds,
          players: newPlayersMap,
        });

        // Hier könnte man den Token optional invalidieren, wenn er nur einmal verwendet werden soll:
        // transaction.update(tokenDoc.ref, { isValid: false });
        // Wir lassen ihn aber gültig, wie besprochen.

        return {success: true, alreadyMember: false, groupId: groupId, groupName: groupData.name};
      }); // --- Transaktion Ende ---

      console.info(`User ${userId} successfully joined group ${joinResult.groupId} (${joinResult.groupName})`);

      // 10. Erfolg an Client zurückgeben
      return joinResult;
    } catch (error) {
      console.error(`Error joining group with token ${token} for user ${userId}:`, error);
      if (error instanceof https.HttpsError) {
        throw error;
      } else {
        throw new https.HttpsError(
          "internal",
          "Ein interner Fehler ist beim Beitreten zur Gruppe aufgetreten."
        );
      }
    }
  });

// Hier können später weitere Funktionen hinzugefügt werden:
// export const joinGroupByToken = functions.https.onCall(...);
