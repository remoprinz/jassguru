import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

// Mapping für das spezifische Tournament-Dokument
const PLAYER_ID_MAPPING: { [oldId: string]: string } = {
  'remo': 'b16c1120111b7d9e7d733837',
  'schmuddi': 'TPBwj8bP9W59n5LoGWP5', 
  'studi': 'PLaDRlPBo91yu5Ij8MOT2',
  'frank': 'F1uwdthL6zu7F0cYf1jbe'
};

const TOURNAMENT_SESSION_ID = '6eNr8fnsTO06jgCqjelt';

export async function fixTournamentDocument(dryRun = true): Promise<void> {
  logger.info(`[fixTournamentDocument] Starting fix for tournament session ${TOURNAMENT_SESSION_ID} (dryRun: ${dryRun})`);
  
  try {
    // Firestore-Instanz holen
    const db = admin.firestore();
    
    // Lade das spezifische Dokument
    const sessionRef = db.collection('jassGameSummaries').doc(TOURNAMENT_SESSION_ID);
    const sessionSnap = await sessionRef.get();
    
    if (!sessionSnap.exists) {
      logger.error(`[fixTournamentDocument] Document ${TOURNAMENT_SESSION_ID} not found!`);
      return;
    }
    
    const sessionData = sessionSnap.data();
    if (!sessionData) {
      logger.error(`[fixTournamentDocument] Document ${TOURNAMENT_SESSION_ID} has no data!`);
      return;
    }
    
    logger.info(`[fixTournamentDocument] Current participantPlayerIds:`, sessionData.participantPlayerIds);
    
    // Bereite Updates vor
    const updates: { [key: string]: any } = {};
    
    // 1. Korrigiere participantPlayerIds
    if (sessionData.participantPlayerIds && Array.isArray(sessionData.participantPlayerIds)) {
      const newParticipantPlayerIds = sessionData.participantPlayerIds.map((oldId: string) => {
        const newId = PLAYER_ID_MAPPING[oldId];
        if (newId) {
          logger.info(`[fixTournamentDocument] Mapping ${oldId} -> ${newId}`);
          return newId;
        }
        return oldId;
      });
      
      updates.participantPlayerIds = newParticipantPlayerIds;
      logger.info(`[fixTournamentDocument] New participantPlayerIds:`, newParticipantPlayerIds);
    }
    
    // 2. Korrigiere gameResults -> teams -> players -> playerId
    if (sessionData.gameResults && Array.isArray(sessionData.gameResults)) {
      const newGameResults = sessionData.gameResults.map((game: any, gameIndex: number) => {
        const updatedGame = { ...game };
        
        if (game.teams) {
          // Update top team
          if (game.teams.top && game.teams.top.players) {
            updatedGame.teams = {
              ...updatedGame.teams,
              top: {
                ...updatedGame.teams.top,
                players: game.teams.top.players.map((player: any) => {
                  const newPlayerId = PLAYER_ID_MAPPING[player.playerId];
                  if (newPlayerId) {
                    logger.info(`[fixTournamentDocument] Game ${gameIndex + 1} top: ${player.playerId} -> ${newPlayerId}`);
                    return { ...player, playerId: newPlayerId };
                  }
                  return player;
                })
              }
            };
          }
          
          // Update bottom team
          if (game.teams.bottom && game.teams.bottom.players) {
            updatedGame.teams = {
              ...updatedGame.teams,
              bottom: {
                ...updatedGame.teams.bottom,
                players: game.teams.bottom.players.map((player: any) => {
                  const newPlayerId = PLAYER_ID_MAPPING[player.playerId];
                  if (newPlayerId) {
                    logger.info(`[fixTournamentDocument] Game ${gameIndex + 1} bottom: ${player.playerId} -> ${newPlayerId}`);
                    return { ...player, playerId: newPlayerId };
                  }
                  return player;
                })
              }
            };
          }
        }
        
        return updatedGame;
      });
      
      updates.gameResults = newGameResults;
    }
    
    // 3. Füge Migrations-Metadaten hinzu
    updates.playerIdMigrationNote = 'Tournament player IDs corrected from old format to proper document IDs';
    updates.playerIdMigrationTimestamp = admin.firestore.Timestamp.now();
    updates.lastPlayerIdFix = admin.firestore.Timestamp.now();
    
    // Führe Update durch
    if (Object.keys(updates).length > 0) {
      if (dryRun) {
        logger.info(`[fixTournamentDocument] DRY RUN - Would update document with ${Object.keys(updates).length} fields`);
        logger.info(`[fixTournamentDocument] Updates preview:`, {
          participantPlayerIds: updates.participantPlayerIds,
          gameResultsCount: updates.gameResults?.length,
          migrationNote: updates.playerIdMigrationNote
        });
      } else {
        await sessionRef.update(updates);
        logger.info(`[fixTournamentDocument] ✅ Successfully updated tournament session ${TOURNAMENT_SESSION_ID}`);
      }
    } else {
      logger.warn(`[fixTournamentDocument] No updates needed for ${TOURNAMENT_SESSION_ID}`);
    }
    
    logger.info(`[fixTournamentDocument] Fix completed for ${TOURNAMENT_SESSION_ID}`);
  } catch (error) {
    logger.error(`[fixTournamentDocument] Error fixing tournament document:`, error);
    throw error;
  }
}

// Hilfsfunktion zum direkten Ausführen
export async function runTournamentFix(dryRun = true): Promise<void> {
  logger.info(`[runTournamentFix] Starting tournament fix (dryRun: ${dryRun})`);
  await fixTournamentDocument(dryRun);
  logger.info(`[runTournamentFix] Tournament fix completed`);
}

// Export für manuellen Aufruf in der Firebase Console
export const fixTournamentFunction = async (data: any, context: any) => {
  const dryRun = data?.dryRun !== false; // Default ist true
  
  logger.info(`[fixTournamentFunction] Called with dryRun: ${dryRun}`);
  
  await fixTournamentDocument(dryRun);
  
  return { 
    success: true, 
    message: `Tournament document fix completed (dryRun: ${dryRun})`,
    documentId: TOURNAMENT_SESSION_ID,
    mappingsApplied: Object.keys(PLAYER_ID_MAPPING).length
  };
}; 