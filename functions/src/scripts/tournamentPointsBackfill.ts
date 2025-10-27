import * as admin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// Firebase Admin SDK initialisieren
const serviceAccountPath = join(__dirname, '../../../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

const app = initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = getFirestore(app);

// ===== INTERFACES =====
interface PlayerPointsData {
  playerId: string;
  displayName: string;
  pointsScored: number;
  pointsReceived: number;
  pointsDifference: number;
}

interface TournamentGameData {
  id: string;
  finalScores: { top: number; bottom: number };
  teams?: { 
    top?: { playerUids?: string[] }; 
    bottom?: { playerUids?: string[] }; 
  };
  participantUids?: string[];
  playerDetails?: Array<{ uid: string; displayName?: string }>;
}

// ===== HILFSFUNKTIONEN =====
async function calculatePlayerPointsForOldTournament(
  tournamentGames: TournamentGameData[], 
  participantPlayerIds: string[], 
  uidToPlayerIdMap: Map<string, string>
): Promise<{ playerDetails: PlayerPointsData[]; finalScores: { top: number; bottom: number }; teams: any }> {
  // Sammle Punkte pro Spieler über alle Games
  const playerPointsMap = new Map<string, {
    playerId: string;
    displayName: string;
    pointsScored: number;
    pointsReceived: number;
  }>();

  for (const game of tournamentGames) {
    if (game.finalScores && game.teams) {
      // Top Team
      if (game.teams.top?.playerUids) {
        for (const playerUid of game.teams.top.playerUids) {
          const playerId = uidToPlayerIdMap.get(playerUid) || playerUid;
          if (!playerPointsMap.has(playerId)) {
            // Hole displayName aus playerDetails oder verwende playerId als Fallback
            const playerDetail = game.playerDetails?.find(pd => pd.uid === playerUid);
            playerPointsMap.set(playerId, {
              playerId: playerId,
              displayName: (playerDetail as any)?.displayName || playerId,
              pointsScored: 0,
              pointsReceived: 0
            });
          }
          const playerData = playerPointsMap.get(playerId)!;
          playerData.pointsScored += game.finalScores.top;
          playerData.pointsReceived += game.finalScores.bottom;
        }
      }
      
      // Bottom Team
      if (game.teams.bottom?.playerUids) {
        for (const playerUid of game.teams.bottom.playerUids) {
          const playerId = uidToPlayerIdMap.get(playerUid) || playerUid;
          if (!playerPointsMap.has(playerId)) {
            // Hole displayName aus playerDetails oder verwende playerId als Fallback
            const playerDetail = game.playerDetails?.find(pd => pd.uid === playerUid);
            playerPointsMap.set(playerId, {
              playerId: playerId,
              displayName: (playerDetail as any)?.displayName || playerId,
              pointsScored: 0,
              pointsReceived: 0
            });
          }
          const playerData = playerPointsMap.get(playerId)!;
          playerData.pointsScored += game.finalScores.bottom;
          playerData.pointsReceived += game.finalScores.top;
        }
      }
    }
  }

  // Berechne Differenzen und Aggregat
  const playerDetails: PlayerPointsData[] = [];
  const topPlayers: any[] = [];
  const bottomPlayers: any[] = [];
  let topTotal = 0;
  let bottomTotal = 0;

  for (const player of playerPointsMap.values()) {
    const diff = player.pointsScored - player.pointsReceived;

    playerDetails.push({
      playerId: player.playerId,
      displayName: player.displayName,
      pointsScored: player.pointsScored,
      pointsReceived: player.pointsReceived,
      pointsDifference: diff
    });

    if (diff >= 0) {
      topPlayers.push({
        playerId: player.playerId,
        displayName: player.displayName
      });
      topTotal += diff;
    } else {
      bottomPlayers.push({
        playerId: player.playerId,
        displayName: player.displayName
      });
      bottomTotal += Math.abs(diff);
    }
  }

  return {
    playerDetails,
    finalScores: {
      top: Math.round(topTotal),
      bottom: Math.round(bottomTotal)
    },
    teams: {
      top: {
        players: topPlayers
      },
      bottom: {
        players: bottomPlayers
      }
    }
  };
}

// ===== HAUPTFUNKTIONEN =====
async function backfillTournamentPointsData(groupId?: string): Promise<void> {
  console.log(`[tournamentPointsBackfill] Starting tournament points backfill${groupId ? ` for group: ${groupId}` : ' for all groups'}`);

  try {
    if (groupId) {
      // Backfill für spezifische Gruppe
      await processGroupTournaments(groupId);
    } else {
      // Backfill für alle Gruppen
      const groupsRef = db.collection('groups');
      const groupsSnap = await groupsRef.get();
      
      console.log(`[tournamentPointsBackfill] Found ${groupsSnap.size} groups to process`);
      
      let successCount = 0;
      let skipCount = 0;
      
      for (const groupDoc of groupsSnap.docs) {
        const groupId = groupDoc.id;
        console.log(`[tournamentPointsBackfill] Processing group: ${groupId}`);
        
        const result = await processGroupTournaments(groupId);
        if (result.success > 0) {
          successCount += result.success;
          skipCount += result.skip;
          console.log(`[tournamentPointsBackfill] ✅ Group ${groupId}: ${result.success} updated, ${result.skip} skipped`);
        } else {
          skipCount++;
          console.log(`[tournamentPointsBackfill] ⚠️ Group ${groupId}: No tournaments to process`);
        }
      }
      
      console.log(`[tournamentPointsBackfill] 🎉 Backfill completed! Success: ${successCount}, Skipped: ${skipCount}`);
    }
  } catch (error) {
    console.error(`[tournamentPointsBackfill] Error during backfill:`, error);
    throw error;
  }
}

async function processGroupTournaments(groupId: string): Promise<{ success: number; skip: number }> {
  console.log(`[tournamentPointsBackfill] Processing tournaments for group: ${groupId}`);

  try {
    // Hole alle Turnier-Sessions aus jassGameSummaries
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
    const sessionsQuery = sessionsRef
      .where('isTournamentSession', '==', true)
      .where('status', '==', 'completed');

    const sessionsSnap = await sessionsQuery.get();
    
    if (sessionsSnap.empty) {
      console.log(`[tournamentPointsBackfill] No tournament sessions found for group: ${groupId}`);
      return { success: 0, skip: 0 };
    }

    console.log(`[tournamentPointsBackfill] Found ${sessionsSnap.size} tournament sessions for group: ${groupId}`);

    let successCount = 0;
    let skipCount = 0;

    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;

      // Prüfe ob bereits playerDetails vorhanden sind
      if (sessionData.playerDetails && sessionData.finalScores) {
        console.log(`[tournamentPointsBackfill] Session ${sessionId} already has points data, skipping`);
        skipCount++;
        continue;
      }

      // Prüfe ob gameResults vorhanden sind
      if (!sessionData.gameResults || !Array.isArray(sessionData.gameResults)) {
        console.log(`[tournamentPointsBackfill] Session ${sessionId} has no gameResults, skipping`);
        skipCount++;
        continue;
      }

      console.log(`[tournamentPointsBackfill] Processing session ${sessionId} with ${sessionData.gameResults.length} games`);

      // Erstelle uidToPlayerIdMap aus participantPlayerIds
      const uidToPlayerIdMap = new Map<string, string>();
      if (sessionData.participantPlayerIds) {
        for (const playerId of sessionData.participantPlayerIds) {
          // Für alte Turniere: playerId ist oft die UID
          uidToPlayerIdMap.set(playerId, playerId);
        }
      }

      // Zusätzlich: Sammle alle UIDs aus den Games
      for (const game of sessionData.gameResults) {
        if (game.teams) {
          if (game.teams.top?.playerUids) {
            for (const uid of game.teams.top.playerUids) {
              if (!uidToPlayerIdMap.has(uid)) {
                uidToPlayerIdMap.set(uid, uid);
              }
            }
          }
          if (game.teams.bottom?.playerUids) {
            for (const uid of game.teams.bottom.playerUids) {
              if (!uidToPlayerIdMap.has(uid)) {
                uidToPlayerIdMap.set(uid, uid);
              }
            }
          }
        }
      }

      // Konvertiere gameResults zu TournamentGameData
      const tournamentGames: TournamentGameData[] = sessionData.gameResults.map((game: any, index: number) => ({
        id: game.gameNumber?.toString() || index.toString(),
        finalScores: {
          top: game.topScore || 0,
          bottom: game.bottomScore || 0
        },
        teams: game.teams,
        participantUids: game.teams ? [
          ...(game.teams.top?.playerUids || []),
          ...(game.teams.bottom?.playerUids || [])
        ] : [],
        playerDetails: game.playerDetails
      }));

      // Berechne Punkte-Daten
      const playerPointsData = await calculatePlayerPointsForOldTournament(
        tournamentGames,
        sessionData.participantPlayerIds || [],
        uidToPlayerIdMap
      );

      // Aktualisiere das Session-Dokument
      await sessionDoc.ref.update({
        playerDetails: playerPointsData.playerDetails,
        finalScores: playerPointsData.finalScores
      });

      console.log(`[tournamentPointsBackfill] ✅ Updated session ${sessionId} with points data for ${playerPointsData.playerDetails.length} players`);
      successCount++;
    }

    return { success: successCount, skip: skipCount };
  } catch (error) {
    console.error(`[tournamentPointsBackfill] Error processing group ${groupId}:`, error);
    throw error;
  }
}

// ===== EXPORT FÜR TESTING =====
export { backfillTournamentPointsData, processGroupTournaments };

// ===== CLI EXECUTION =====
if (require.main === module) {
  const args = process.argv.slice(2);
  const groupId = args[0]; // Optional: Spezifische Gruppe
  
  console.log(`[tournamentPointsBackfill] Starting CLI execution${groupId ? ` for group: ${groupId}` : ' for all groups'}`);
  
  backfillTournamentPointsData(groupId)
    .then(() => {
      console.log(`[tournamentPointsBackfill] ✅ CLI execution completed successfully`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[tournamentPointsBackfill] ❌ CLI execution failed:`, error);
      process.exit(1);
    });
}
