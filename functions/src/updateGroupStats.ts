import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { updateGroupComputedStatsAfterSession } from "./groupStatsCalculator";
import * as admin from "firebase-admin";
import { checkRateLimit, RATE_LIMITS } from "./rateLimiter";

const db = admin.firestore();

interface UpdateGroupStatsData {
  groupId: string;
}

/**
 * Cloud Function zum manuellen Aktualisieren der Gruppenstatistiken
 */
export const updateGroupStats = onCall(
  {
    region: "europe-west1",
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request: CallableRequest<UpdateGroupStatsData>) => {
    logger.info("--- updateGroupStats START ---", { data: request.data });

    if (!request.auth) {
      logger.error("User is not authenticated.");
      throw new HttpsError("unauthenticated", "User is not authenticated.");
    }

    const { groupId } = request.data;

    if (!groupId || typeof groupId !== 'string') {
      logger.error("Group ID is missing or not a string.");
      throw new HttpsError("invalid-argument", "Group ID is missing or not a string.");
    }

    // ✅ RATE-LIMITING: Verhindert Spam
    await checkRateLimit(request.auth.uid, RATE_LIMITS.UPDATE_STATS);

    // ✅ KRITISCHE SICHERHEITSPRÜFUNG: Nur Gruppen-Admins dürfen Statistiken neu berechnen
    try {
      const groupDoc = await db.collection('groups').doc(groupId).get();
      if (!groupDoc.exists) {
        logger.error(`Group ${groupId} does not exist.`);
        throw new HttpsError("not-found", "Gruppe nicht gefunden.");
      }
      
      const groupData = groupDoc.data();
      if (!groupData?.adminIds || !groupData.adminIds.includes(request.auth.uid)) {
        logger.error(`User ${request.auth.uid} is not admin of group ${groupId}.`);
        throw new HttpsError("permission-denied", "Nur Gruppen-Admins können Statistiken neu berechnen.");
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error checking group admin permissions:", error);
      throw new HttpsError("internal", "Fehler beim Prüfen der Berechtigung.");
    }

    try {
      logger.info(`[updateGroupStats] Starting stats update for group: ${groupId}`);
      
      await updateGroupComputedStatsAfterSession(groupId);
      
      logger.info(`[updateGroupStats] Successfully updated stats for group: ${groupId}`);
      
      return { 
        success: true, 
        message: `Statistiken für Gruppe ${groupId} erfolgreich aktualisiert.`,
        groupId: groupId
      };
    } catch (error: unknown) {
      logger.error(`[updateGroupStats] CRITICAL ERROR for group ${groupId}:`, error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new HttpsError("internal", `Fehler beim Aktualisieren der Statistiken für Gruppe ${groupId}.`, errorMessage);
    }
  }
);