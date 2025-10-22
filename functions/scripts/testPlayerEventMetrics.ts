import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { backfillPlayerScores } from './backfillPlayerScores';

// Initialisiere Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 🧪 TEST-SCRIPT für Spieler b16c1120111b7d9e7d733837
 * 
 * Dieses Script testet die neuen Event-Metriken (Matsch, Schneider, Kontermatsch, Weis-Punkte)
 * für einen spezifischen Spieler, der Turnier-Erfahrung hat.
 */
async function testPlayerEventMetrics() {
  const testPlayerId = 'b16c1120111b7d9e7d733837';
  
  try {
    logger.info(`🧪 [TEST] Starte Test für Spieler ${testPlayerId}`);
    
    // 1. SCHAUE UNS DEN SPIELER AN
    logger.info(`🔍 [TEST] Analysiere Spieler-Daten...`);
    
    const playerRef = db.collection('players').doc(testPlayerId);
    const playerDoc = await playerRef.get();
    
    if (!playerDoc.exists) {
      logger.error(`❌ [TEST] Spieler ${testPlayerId} nicht gefunden!`);
      return;
    }
    
    const playerData = playerDoc.data();
    logger.info(`✅ [TEST] Spieler gefunden: ${playerData?.displayName || 'Unbekannt'}`);
    
    // 2. SCHAUE UNS DIE AKTUELLEN SCORES AN
    logger.info(`📊 [TEST] Prüfe aktuelle Player Scores...`);
    
    const currentScoresRef = db.collection(`players/${testPlayerId}/currentScores`).doc('latest');
    const currentScoresDoc = await currentScoresRef.get();
    
    if (currentScoresDoc.exists) {
      const currentScores = currentScoresDoc.data();
      logger.info(`📈 [TEST] Aktuelle Scores:`);
      logger.info(`   - Strichdifferenz: ${currentScores?.global?.stricheDiff || 0}`);
      logger.info(`   - Punktdifferenz: ${currentScores?.global?.pointsDiff || 0}`);
      logger.info(`   - Matsch Events: ${currentScores?.global?.matschEvents || 0}`);
      logger.info(`   - Schneider Events: ${currentScores?.global?.schneiderEvents || 0}`);
      logger.info(`   - Kontermatsch Events: ${currentScores?.global?.kontermatschEvents || 0}`);
      logger.info(`   - Weis Points: ${currentScores?.global?.totalWeisPoints || 0}`);
      
      // Prüfe neue Felder
      logger.info(`🆕 [TEST] Neue Event-Metriken:`);
      logger.info(`   - Matsch Made: ${currentScores?.global?.matschEventsMade || 'NICHT VORHANDEN'}`);
      logger.info(`   - Matsch Received: ${currentScores?.global?.matschEventsReceived || 'NICHT VORHANDEN'}`);
      logger.info(`   - Matsch Bilanz: ${currentScores?.global?.matschBilanz || 'NICHT VORHANDEN'}`);
      logger.info(`   - Schneider Made: ${currentScores?.global?.schneiderEventsMade || 'NICHT VORHANDEN'}`);
      logger.info(`   - Schneider Received: ${currentScores?.global?.schneiderEventsReceived || 'NICHT VORHANDEN'}`);
      logger.info(`   - Schneider Bilanz: ${currentScores?.global?.schneiderBilanz || 'NICHT VORHANDEN'}`);
      logger.info(`   - Kontermatsch Made: ${currentScores?.global?.kontermatschEventsMade || 'NICHT VORHANDEN'}`);
      logger.info(`   - Kontermatsch Received: ${currentScores?.global?.kontermatschEventsReceived || 'NICHT VORHANDEN'}`);
      logger.info(`   - Kontermatsch Bilanz: ${currentScores?.global?.kontermatschBilanz || 'NICHT VORHANDEN'}`);
      logger.info(`   - Weis Made: ${currentScores?.global?.totalWeisPoints || 'NICHT VORHANDEN'}`);
      logger.info(`   - Weis Received: ${currentScores?.global?.totalWeisReceived || 'NICHT VORHANDEN'}`);
      logger.info(`   - Weis Difference: ${currentScores?.global?.weisDifference || 'NICHT VORHANDEN'}`);
    } else {
      logger.warn(`⚠️ [TEST] Keine aktuellen Scores gefunden für Spieler ${testPlayerId}`);
    }
    
    // 3. SCHAUE UNS DIE SESSIONS AN
    logger.info(`🎮 [TEST] Analysiere Sessions...`);
    
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
    
    logger.info(`📊 [TEST] ${sessions.length} Sessions gefunden`);
    
    // 4. ANALYSIERE TURNIER-SESSIONS
    let tournamentSessions = 0;
    let totalMatschEvents = 0;
    let totalSchneiderEvents = 0;
    let totalKontermatschEvents = 0;
    let totalWeisPoints = 0;
    
    for (const session of sessions) {
      const isTournament = !!(session?.isTournamentSession || session?.tournamentId || session?.teamScoresPasse);
      
      if (isTournament) {
        tournamentSessions++;
        logger.info(`🏆 [TEST] Turnier-Session gefunden: ${session.sessionId}`);
        
        // Analysiere Event-Counts
        const eventCounts = session?.eventCounts || {};
        const topEvents = eventCounts.top || {};
        const bottomEvents = eventCounts.bottom || {};
        
        logger.info(`   - Top Team Events:`, topEvents);
        logger.info(`   - Bottom Team Events:`, bottomEvents);
        
        totalMatschEvents += (topEvents.matsch || 0) + (bottomEvents.matsch || 0);
        totalSchneiderEvents += (topEvents.schneider || 0) + (bottomEvents.schneider || 0);
        totalKontermatschEvents += (topEvents.kontermatsch || 0) + (bottomEvents.kontermatsch || 0);
        
        // Analysiere Weis-Punkte
        const sessionTotalWeisPoints = session?.sessionTotalWeisPoints || {};
        const topWeis = sessionTotalWeisPoints.top || 0;
        const bottomWeis = sessionTotalWeisPoints.bottom || 0;
        
        logger.info(`   - Top Team Weis: ${topWeis}`);
        logger.info(`   - Bottom Team Weis: ${bottomWeis}`);
        
        totalWeisPoints += topWeis + bottomWeis;
      }
    }
    
    logger.info(`🏆 [TEST] Turnier-Analyse:`);
    logger.info(`   - Turnier-Sessions: ${tournamentSessions}`);
    logger.info(`   - Gesamt Matsch Events: ${totalMatschEvents}`);
    logger.info(`   - Gesamt Schneider Events: ${totalSchneiderEvents}`);
    logger.info(`   - Gesamt Kontermatsch Events: ${totalKontermatschEvents}`);
    logger.info(`   - Gesamt Weis Points: ${totalWeisPoints}`);
    
    // 5. FÜHRE BACKFILL AUS (DRY RUN)
    logger.info(`🔄 [TEST] Führe Backfill aus (DRY RUN)...`);
    
    await backfillPlayerScores(undefined, testPlayerId, true); // dryRun = true
    
    logger.info(`✅ [TEST] Backfill abgeschlossen (Dry Run)`);
    
    // 6. SCHAUE UNS DIE NEUEN SCORES AN (nach Dry Run)
    logger.info(`📊 [TEST] Prüfe Scores nach Backfill...`);
    
    const newScoresRef = db.collection(`players/${testPlayerId}/currentScores`).doc('latest');
    const newScoresDoc = await newScoresRef.get();
    
    if (newScoresDoc.exists) {
      const newScores = newScoresDoc.data();
      logger.info(`🆕 [TEST] Neue Event-Metriken nach Backfill:`);
      logger.info(`   - Matsch Made: ${newScores?.global?.matschEventsMade || 'NICHT VORHANDEN'}`);
      logger.info(`   - Matsch Received: ${newScores?.global?.matschEventsReceived || 'NICHT VORHANDEN'}`);
      logger.info(`   - Matsch Bilanz: ${newScores?.global?.matschBilanz || 'NICHT VORHANDEN'}`);
      logger.info(`   - Schneider Made: ${newScores?.global?.schneiderEventsMade || 'NICHT VORHANDEN'}`);
      logger.info(`   - Schneider Received: ${newScores?.global?.schneiderEventsReceived || 'NICHT VORHANDEN'}`);
      logger.info(`   - Schneider Bilanz: ${newScores?.global?.schneiderBilanz || 'NICHT VORHANDEN'}`);
      logger.info(`   - Kontermatsch Made: ${newScores?.global?.kontermatschEventsMade || 'NICHT VORHANDEN'}`);
      logger.info(`   - Kontermatsch Received: ${newScores?.global?.kontermatschEventsReceived || 'NICHT VORHANDEN'}`);
      logger.info(`   - Kontermatsch Bilanz: ${newScores?.global?.kontermatschBilanz || 'NICHT VORHANDEN'}`);
      logger.info(`   - Weis Made: ${newScores?.global?.totalWeisPoints || 'NICHT VORHANDEN'}`);
      logger.info(`   - Weis Received: ${newScores?.global?.totalWeisReceived || 'NICHT VORHANDEN'}`);
      logger.info(`   - Weis Difference: ${newScores?.global?.weisDifference || 'NICHT VORHANDEN'}`);
    }
    
    logger.info(`🎉 [TEST] Test abgeschlossen für Spieler ${testPlayerId}`);
    
  } catch (error) {
    logger.error(`❌ [TEST] Fehler beim Test:`, error);
    throw error;
  }
}

// Führe Test aus
if (require.main === module) {
  testPlayerEventMetrics()
    .then(() => {
      logger.info(`✅ Test erfolgreich abgeschlossen`);
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`❌ Test fehlgeschlagen:`, error);
      process.exit(1);
    });
}

export { testPlayerEventMetrics };
