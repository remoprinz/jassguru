/**
 * Cloud Function: Synchronisiert Player-Profildaten (photoURL, displayName)
 * in alle Gruppen, in denen der Spieler Mitglied ist.
 * 
 * Trigger: Wenn ein players/{playerId} Dokument aktualisiert wird
 * 
 * Dieses Pattern löst das Denormalisierungsproblem elegant:
 * - Der Player ist die Single Source of Truth
 * - Die members-Subcollection wird automatisch synchronisiert
 * - Frontend-Code muss nicht angepasst werden
 */

import { onDocumentUpdated, FirestoreEvent, Change } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

const db = admin.firestore();

/**
 * Felder, die synchronisiert werden sollen.
 * Wenn eines dieser Felder sich ändert, werden alle members-Subcollections aktualisiert.
 */
const SYNC_FIELDS = ['photoURL', 'displayName'] as const;

/**
 * Hauptfunktion: Synchronisiert Spielerprofil-Änderungen in alle Gruppen
 */
export const syncPlayerProfileToGroups = onDocumentUpdated(
  {
    document: "players/{playerId}",
    region: "europe-west1", // Gleiche Region wie andere Functions
  },
  async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, { playerId: string }>) => {
    const playerId = event.params.playerId;
    
    if (!event.data) {
      logger.warn(`[syncPlayerProfile] No data for player ${playerId}`);
      return;
    }

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Prüfe, ob sich relevante Felder geändert haben
    const changedFields: Partial<Record<typeof SYNC_FIELDS[number], string | null>> = {};
    let hasRelevantChanges = false;

    for (const field of SYNC_FIELDS) {
      const beforeValue = beforeData?.[field] ?? null;
      const afterValue = afterData?.[field] ?? null;
      
      if (beforeValue !== afterValue) {
        changedFields[field] = afterValue;
        hasRelevantChanges = true;
        logger.info(`[syncPlayerProfile] ${field} changed for player ${playerId}: "${beforeValue}" → "${afterValue}"`);
      }
    }

    if (!hasRelevantChanges) {
      // Keine relevanten Änderungen, nichts zu tun
      return;
    }

    // Hole die groupIds des Spielers
    const groupIds = afterData?.groupIds as string[] | undefined;
    
    if (!groupIds || groupIds.length === 0) {
      logger.info(`[syncPlayerProfile] Player ${playerId} is not in any groups, skipping sync`);
      return;
    }

    logger.info(`[syncPlayerProfile] Syncing ${Object.keys(changedFields).join(', ')} for player ${playerId} to ${groupIds.length} group(s)`);

    // Batch-Update für alle Gruppen
    const batch = db.batch();
    let updateCount = 0;

    for (const groupId of groupIds) {
      const memberRef = db.collection('groups').doc(groupId).collection('members').doc(playerId);
      
      // Nur die geänderten Felder aktualisieren
      batch.update(memberRef, changedFields);
      updateCount++;
    }

    if (updateCount > 0) {
      try {
        await batch.commit();
        logger.info(`[syncPlayerProfile] ✅ Successfully synced ${Object.keys(changedFields).join(', ')} to ${updateCount} member document(s) for player ${playerId}`);
      } catch (error) {
        // Wenn das Member-Dokument nicht existiert, ist das kein kritischer Fehler
        // Das kann passieren, wenn die Daten inkonsistent sind
        logger.warn(`[syncPlayerProfile] ⚠️ Some updates failed for player ${playerId}:`, error);
        
        // Fallback: Einzelne Updates versuchen
        for (const groupId of groupIds) {
          try {
            const memberRef = db.collection('groups').doc(groupId).collection('members').doc(playerId);
            await memberRef.update(changedFields);
          } catch (individualError: unknown) {
            const errorMessage = individualError instanceof Error ? individualError.message : String(individualError);
            // Ignoriere "not found" Fehler, logge andere
            if (!errorMessage.includes('NOT_FOUND') && !errorMessage.includes('No document to update')) {
              logger.error(`[syncPlayerProfile] Failed to update member in group ${groupId}:`, individualError);
            }
          }
        }
      }
    }
  }
);

/**
 * Hilfsfunktion: Repariert alle members-Subcollections für einen Spieler
 * Kann manuell aufgerufen werden für bestehende inkonsistente Daten
 */
export async function repairPlayerMemberships(playerId: string): Promise<{
  success: boolean;
  updatedGroups: string[];
  errors: string[];
}> {
  const result = {
    success: true,
    updatedGroups: [] as string[],
    errors: [] as string[],
  };

  try {
    // Hole das aktuelle Player-Dokument
    const playerDoc = await db.collection('players').doc(playerId).get();
    
    if (!playerDoc.exists) {
      result.success = false;
      result.errors.push(`Player ${playerId} not found`);
      return result;
    }

    const playerData = playerDoc.data();
    const groupIds = playerData?.groupIds as string[] | undefined;
    
    if (!groupIds || groupIds.length === 0) {
      return result; // Spieler ist in keiner Gruppe
    }

    const updateData = {
      displayName: playerData?.displayName ?? null,
      photoURL: playerData?.photoURL ?? null,
    };

    for (const groupId of groupIds) {
      try {
        const memberRef = db.collection('groups').doc(groupId).collection('members').doc(playerId);
        const memberDoc = await memberRef.get();
        
        if (memberDoc.exists) {
          await memberRef.update(updateData);
          result.updatedGroups.push(groupId);
        } else {
          // Member-Dokument existiert nicht, erstelle es
          await memberRef.set({
            ...updateData,
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          result.updatedGroups.push(groupId);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Group ${groupId}: ${errorMessage}`);
        result.success = false;
      }
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.success = false;
    result.errors.push(`General error: ${errorMessage}`);
    return result;
  }
}
