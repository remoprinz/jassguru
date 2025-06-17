import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { updateGroupComputedStatsAfterSession } from "./groupStatsCalculator";

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