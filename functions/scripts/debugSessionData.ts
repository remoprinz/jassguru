import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

// Initialisiere Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 🔍 DEBUG-SCRIPT: Analysiere Session-Daten für Spieler b16c1120111b7d9e7d733837
 */
async function debugSessionData() {
  const testPlayerId = 'b16c1120111b7d9e7d733837';
  
  try {
    logger.info(`🔍 [DEBUG] Analysiere Session-Daten für Spieler ${testPlayerId}`);
    
    // Lade alle Sessions des Spielers
    const sessions: any[] = [];
    const groupsSnap = await db.collection('groups').get();
    
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
      const sessionsSnap = await sessionsRef
        .where('status', '==', 'completed')
        .where('participantPlayerIds', 'array-contains', testPlayerId)
        .orderBy('completedAt', 'asc')
        .get();
      
      sessionsSnap.docs.forEach(doc => {
        sessions.push({
          sessionId: doc.id,
          groupId: groupId,
          ...doc.data()
        });
      });
    }
    
    logger.info(`📊 [DEBUG] ${sessions.length} Sessions gefunden`);
    
    // Analysiere jede Session
    for (let i = 0; i < Math.min(5, sessions.length); i++) { // Nur erste 5 Sessions
      const session = sessions[i];
      logger.info(`\n🎮 [DEBUG] Session ${i + 1}: ${session.sessionId}`);
      logger.info(`   - Gruppe: ${session.groupId}`);
      logger.info(`   - Datum: ${session.completedAt?.toDate?.() || 'Unbekannt'}`);
      logger.info(`   - Ist Turnier: ${!!(session?.isTournamentSession || session?.tournamentId || session?.teamScoresPasse)}`);
      
      // Analysiere Teams
      const teams = session.teams;
      if (teams) {
        logger.info(`   - Teams vorhanden: ✅`);
        logger.info(`   - Top Team Players: ${teams.top?.players?.map((p: any) => p.playerId).join(', ') || 'Keine'}`);
        logger.info(`   - Bottom Team Players: ${teams.bottom?.players?.map((p: any) => p.playerId).join(', ') || 'Keine'}`);
        
        // Prüfe ob Spieler in Teams ist
        const isTop = teams.top?.players?.some((p: any) => p.playerId === testPlayerId);
        const isBottom = teams.bottom?.players?.some((p: any) => p.playerId === testPlayerId);
        logger.info(`   - Spieler in Top Team: ${isTop ? '✅' : '❌'}`);
        logger.info(`   - Spieler in Bottom Team: ${isBottom ? '✅' : '❌'}`);
      } else {
        logger.info(`   - Teams vorhanden: ❌`);
      }
      
      // Analysiere Event-Counts
      const eventCounts = session.eventCounts;
      if (eventCounts) {
        logger.info(`   - EventCounts vorhanden: ✅`);
        logger.info(`   - Top Team Events:`, eventCounts.top || {});
        logger.info(`   - Bottom Team Events:`, eventCounts.bottom || {});
      } else {
        logger.info(`   - EventCounts vorhanden: ❌`);
      }
      
      // Analysiere Weis-Punkte
      const sessionTotalWeisPoints = session.sessionTotalWeisPoints;
      if (sessionTotalWeisPoints) {
        logger.info(`   - Weis-Punkte vorhanden: ✅`);
        logger.info(`   - Top Team Weis: ${sessionTotalWeisPoints.top || 0}`);
        logger.info(`   - Bottom Team Weis: ${sessionTotalWeisPoints.bottom || 0}`);
      } else {
        logger.info(`   - Weis-Punkte vorhanden: ❌`);
      }
      
      // Analysiere Final Scores
      const finalScores = session.finalScores;
      if (finalScores) {
        logger.info(`   - Final Scores vorhanden: ✅`);
        logger.info(`   - Top Team Score: ${finalScores.top || 0}`);
        logger.info(`   - Bottom Team Score: ${finalScores.bottom || 0}`);
      } else {
        logger.info(`   - Final Scores vorhanden: ❌`);
      }
      
      // Analysiere Final Striche
      const finalStriche = session.finalStriche;
      if (finalStriche) {
        logger.info(`   - Final Striche vorhanden: ✅`);
        logger.info(`   - Top Team Striche:`, finalStriche.top || {});
        logger.info(`   - Bottom Team Striche:`, finalStriche.bottom || {});
      } else {
        logger.info(`   - Final Striche vorhanden: ❌`);
      }
      
      // Analysiere Completed Games
      if (session.completedGames) {
        logger.info(`   - Completed Games: ${session.completedGames.length || 0} Spiele`);
        
        // Analysiere erste 2 Spiele
        for (let j = 0; j < Math.min(2, session.completedGames.length); j++) {
          const game = session.completedGames[j];
          logger.info(`     🎯 Spiel ${j + 1}:`);
          logger.info(`       - EventCounts:`, game.eventCounts || 'NICHT VORHANDEN');
          logger.info(`       - GameTotalWeisPoints:`, game.gameTotalWeisPoints || 'NICHT VORHANDEN');
        }
      } else {
        logger.info(`   - Completed Games: ❌`);
      }
    }
    
    logger.info(`\n🎉 [DEBUG] Session-Analyse abgeschlossen`);
    
  } catch (error) {
    logger.error(`❌ [DEBUG] Fehler:`, error);
    throw error;
  }
}

// Führe Debug aus
if (require.main === module) {
  debugSessionData()
    .then(() => {
      logger.info(`✅ Debug erfolgreich abgeschlossen`);
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`❌ Debug fehlgeschlagen:`, error);
      process.exit(1);
    });
}

export { debugSessionData };
