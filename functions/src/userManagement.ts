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
 * im 'players'-Dokument reagiert und diesen Namen mit allen Gruppen synchronisiert,
 * in denen der Spieler Mitglied ist.
 */
export const syncUserNameOnChange = onDocumentUpdated({
    document: "players/{playerId}",
    region: "europe-west1"
  }, async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined>) => {
    if (!event || !event.data) {
        logger.error("Event data is missing for syncUserNameOnChange");
        return;
    }

    const change = event.data;
    const playerId = event.params.playerId;

    if (!change || !change.before || !change.after || !change.after.exists) {
        logger.error(`Event data, before, or after snapshot is missing for player ${playerId}.`);
        return null;
    }

    const beforeData = change.before.data(); 
    const afterData = change.after.data();

    if (beforeData.displayName === afterData.displayName) {
        logger.log(`Player ${playerId}: displayName not changed. Skipping name sync.`);
        return null;
    }

    const newDisplayName = afterData.displayName || `Spieler_${playerId.substring(0, 6)}`;
    logger.info(`Player ${playerId}: displayName changed to "${newDisplayName}". Syncing group data...`);

    try {
        const groupIds = afterData.groupIds;
        if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
            logger.info(`Player ${playerId} is not in any groups. No names to sync.`);
            return null;
        }
        
        const batch = db.batch();
        let groupsToUpdateCount = 0;

        groupIds.forEach((groupId: string) => {
            if (typeof groupId === 'string' && groupId.trim() !== '') {
                const groupRef = db.collection('groups').doc(groupId);
                const updateData = { [`players.${playerId}.displayName`]: newDisplayName };
                batch.update(groupRef, updateData);
                groupsToUpdateCount++;
            }
        });

        if (groupsToUpdateCount > 0) {
            await batch.commit();
            logger.info(`Finished syncing name for player ${playerId} across ${groupsToUpdateCount} groups.`);
        }
    } catch (error) {
        logger.error(`Error syncing displayName for player ${playerId}:`, error);
    }
    return null;
});

/**
 * Erstellt die initialen Daten für ein neues Firestore-Player-Dokument.
 * Enthält nur öffentliche Daten.
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
 * und verknüpft diese miteinander, wobei private und öffentliche Daten getrennt werden.
 */
export const handleUserCreation = auth.user().onCreate(async (user) => {
  const {uid, email, displayName} = user;

  const db = admin.firestore();

  const userDocRef = db.collection(USERS_COLLECTION).doc(uid);
  const playerDocRef = db.collection(PLAYERS_COLLECTION).doc(nanoid());

  try {
    console.log(`[handleUserCreation] Triggered for user: ${uid} (${email})`);

    const playerId = playerDocRef.id;

    // 1. Öffentliche Daten für das 'players'-Dokument (ohne E-Mail)
    const newPlayerData = createInitialPlayerData(playerId, uid, displayName || null);
    
    // 2. Private Daten für das 'users'-Dokument (nur E-Mail und Verknüpfung)
    const newUserDocumentData = {
      playerId: playerId,
      email: email,
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
  }
}); 