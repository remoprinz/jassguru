import { onDocumentUpdated, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
import {auth} from "firebase-functions/v1";
import {nanoid} from "nanoid";

const db = admin.firestore();

// Collection-Namen für Konsistenz
const USERS_COLLECTION = "users";
const PLAYERS_COLLECTION = "players";

/**
 * Cloud Function (Gen 2), die auf die Aktualisierung des Anzeigenamens (displayName) 
 * in der Firestore-Datenbank reagiert und diesen Namen mit allen Gruppen synchronisiert,
 * in denen der Benutzer (über sein Player-Dokument) Mitglied ist.
 */
export const syncUserNameOnChange = onDocumentUpdated({
    document: "users/{userId}",
    region: "europe-west1"
  }, async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined>) => {
    if (!event || !event.data) {
        logger.error("Event data is missing for syncUserNameOnChange");
        return;
    }

    const change = event.data; // Ist jetzt Change<QueryDocumentSnapshot> | undefined
    const userId = event.params.userId; // userId aus event.params holen

    // Prüfen, ob change und beide Snapshots (before/after) existieren
    if (!change || !change.before || !change.after) {
        logger.error(`Event data, before, or after snapshot is missing for user ${userId}. Event type: ${event.type}`);
        return null;
    }

    // Sicherstellen, dass Dokument nicht gelöscht wurde (obwohl onUpdated nicht bei delete triggern sollte)
    if (!change.after.exists) {
      logger.warn(`User document ${userId} was deleted during update event? Skipping sync.`);
      return null;
    }

    // Expliziter Zugriff auf Daten, da Snapshots QueryDocumentSnapshot sind
    const beforeData = change.before.data(); 
    const afterData = change.after.data();

    // Prüfen, ob sich der Anzeigename geändert hat
    if (beforeData.displayName === afterData.displayName) {
        logger.log(`User ${userId}: displayName not changed. Skipping name sync.`);
        return null;
    }

    // Verwende den neuen Anzeigenamen oder einen Fallback
    const newDisplayName = afterData.displayName || `Spieler_${userId.substring(0, 6)}`;

    logger.info(`User ${userId}: displayName changed to "${newDisplayName}". Syncing group data...`);

    try {
        // 1. Prüfe ob der Benutzer eine Player-ID hat
        if (!afterData.playerId) {
            logger.warn(`User document for ${userId} has no playerId. Cannot sync name.`);
            return null;
        }
        const playerId = afterData.playerId;
        logger.debug(`Found playerId ${playerId} for user ${userId}.`);

        // 2. Lese das Player-Dokument, um die Gruppen-IDs zu erhalten
        const playerDocRef = db.collection('players').doc(playerId);
        const playerDocSnap = await playerDocRef.get();

        if (!playerDocSnap.exists) {
            logger.warn(`Player document ${playerId} not found for user ${userId}. Cannot sync name.`);
            return null;
        }

        const groupIds = playerDocSnap.data()?.groupIds;
        if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
            logger.info(`User ${userId} (Player ${playerId}) is not in any groups. No names to sync.`);
            return null;
        }
        logger.debug(`User ${userId} is in groups: ${groupIds.join(', ')}`);

        // 3. Alle relevanten Gruppen-Dokumente aktualisieren (Batch für Effizienz)
        const batch = db.batch();
        let groupsToUpdateCount = 0;

        groupIds.forEach((groupId: string) => {
            if (typeof groupId === 'string' && groupId.trim() !== '') {
                const groupRef = db.collection('groups').doc(groupId);
                const updateData = {
                    [`players.${playerId}.displayName`]: newDisplayName,
                };
                logger.debug(`Preparing update for group ${groupId}: players.${playerId}.displayName = ${newDisplayName}`);
                batch.update(groupRef, updateData);
                groupsToUpdateCount++;
            } else {
                logger.warn(`Invalid groupId found in player ${playerId} groupIds:`, groupId);
            }
        });

        if (groupsToUpdateCount > 0) {
            await batch.commit();
            logger.info(`Finished syncing name for user ${userId} across ${groupsToUpdateCount} groups.`);
        } else {
            logger.info(`No valid groups found for user ${userId} to sync name.`);
        }
    } catch (error) {
        logger.error(`Error syncing displayName for user ${userId}:`, error);
    }
    return null;
});

/**
 * Erstellt die initialen Daten für ein neues Firestore-Player-Dokument.
 */
const createInitialPlayerData = (
  playerId: string,
  userId: string,
  displayName: string | null
) => {
  const finalDisplayName = displayName || `Spieler ${playerId.slice(0, 4)}`;
  return {
    displayName: finalDisplayName,
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
    metadata: {isOG: false},
  };
};

/**
 * Diese Funktion wird ausgelöst, wenn ein neuer Firebase-Benutzer erstellt wird.
 * Sie erstellt die zugehörigen Dokumente in Firestore (users und players)
 * und verknüpft diese miteinander.
 */
export const handleUserCreation = auth.user().onCreate(async (user) => {
  const {uid, email, displayName} = user;

  // Firestore-Instanz holen
  const db = admin.firestore();

  // Referenzen zu den Dokumenten
  const userDocRef = db.collection(USERS_COLLECTION).doc(uid);
  const playerDocRef = db.collection(PLAYERS_COLLECTION).doc(nanoid());

  try {
    console.log(`[handleUserCreation] Triggered for user: ${uid} (${email})`);

    // Player-ID aus der Referenz extrahieren
    const playerId = playerDocRef.id;

    // Daten für die neuen Dokumente vorbereiten
    const newPlayerData = createInitialPlayerData(playerId, uid, displayName || null);
    const newUserDocumentData = {
      playerId: playerId,
      email: email,
      displayName: newPlayerData.displayName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Schreibe beide Dokumente in einer atomaren Batch-Operation
    const batch = db.batch();
    batch.set(playerDocRef, newPlayerData);
    batch.set(userDocRef, newUserDocumentData, {merge: true});

    await batch.commit();

    console.log(`[handleUserCreation] SUCCESS: User ${uid} and Player ${playerId} created and linked.`);
  } catch (error) {
    console.error(`[handleUserCreation] ERROR for user ${uid}:`, error);
    // Optional: Hier könnte man versuchen, den Auth-User wieder zu löschen,
    // um einen inkonsistenten Zustand zu vermeiden.
    // await admin.auth().deleteUser(uid);
  }
}); 