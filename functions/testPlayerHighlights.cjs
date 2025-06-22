const admin = require('firebase-admin');

// Firebase Admin mit serviceAccountKey initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
    projectId: 'jassguru'
  });
}

async function testPlayerHighlights() {
  const playerId = 'b16c1120111b7d9e7d733837';
  
  console.log(`🔍 Teste Session-Level Highlights für Player: ${playerId}`);
  
  try {
    const db = admin.firestore();
    const statsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      console.log('\n📊 NACHHER - Session-Level Highlights:');
      console.log('Höchste Punkte:', stats.highestPointsSession?.value || 'null');
      console.log('Niedrigste Punkte:', stats.lowestPointsSession?.value || 'null');
      console.log('Meiste Striche:', stats.highestStricheSession?.value || 'null');
      console.log('Meiste erhaltene Striche:', stats.highestStricheReceivedSession?.value || 'null');
      console.log('Meiste Matsche:', stats.mostMatschSession?.value || 'null');
      console.log('Meiste erhaltene Matsche:', stats.mostMatschReceivedSession?.value || 'null');
      console.log('Meiste Weispunkte:', stats.mostWeisPointsSession?.value || 'null');
      console.log('Meiste erhaltene Weispunkte:', stats.mostWeisPointsReceivedSession?.value || 'null');
      
      console.log('\n🎯 Höchste Punkte Details:');
      console.log('Session ID:', stats.highestPointsSession?.relatedId || 'null');
      console.log('Datum:', stats.highestPointsSession?.date ? new Date(stats.highestPointsSession.date.seconds * 1000).toLocaleDateString('de-CH') : 'null');
      console.log('Label:', stats.highestPointsSession?.label || 'null');
      
      console.log('\n🏆 Session-Streaks mit Session-IDs:');
      console.log('Längste Siegesserie:', stats.longestWinStreakSessions?.value || 'null');
      if (stats.longestWinStreakSessions) {
        console.log('  Start Session ID:', stats.longestWinStreakSessions.startSessionId || 'null');
        console.log('  End Session ID:', stats.longestWinStreakSessions.endSessionId || 'null');
        console.log('  Start Datum:', stats.longestWinStreakSessions.startDate ? new Date(stats.longestWinStreakSessions.startDate.seconds * 1000).toLocaleDateString('de-CH') : 'null');
        console.log('  End Datum:', stats.longestWinStreakSessions.endDate ? new Date(stats.longestWinStreakSessions.endDate.seconds * 1000).toLocaleDateString('de-CH') : 'null');
      }
      
      console.log('Längste Serie ohne Niederlage:', stats.longestUndefeatedStreakSessions?.value || 'null');
      if (stats.longestUndefeatedStreakSessions) {
        console.log('  Start Session ID:', stats.longestUndefeatedStreakSessions.startSessionId || 'null');
        console.log('  End Session ID:', stats.longestUndefeatedStreakSessions.endSessionId || 'null');
        console.log('  Start Datum:', stats.longestUndefeatedStreakSessions.startDate ? new Date(stats.longestUndefeatedStreakSessions.startDate.seconds * 1000).toLocaleDateString('de-CH') : 'null');
        console.log('  End Datum:', stats.longestUndefeatedStreakSessions.endDate ? new Date(stats.longestUndefeatedStreakSessions.endDate.seconds * 1000).toLocaleDateString('de-CH') : 'null');
      }
      
      console.log('Längste Niederlagenserie:', stats.longestLossStreakSessions?.value || 'null');
      if (stats.longestLossStreakSessions) {
        console.log('  Start Session ID:', stats.longestLossStreakSessions.startSessionId || 'null');
        console.log('  End Session ID:', stats.longestLossStreakSessions.endSessionId || 'null');
        console.log('  Start Datum:', stats.longestLossStreakSessions.startDate ? new Date(stats.longestLossStreakSessions.startDate.seconds * 1000).toLocaleDateString('de-CH') : 'null');
        console.log('  End Datum:', stats.longestLossStreakSessions.endDate ? new Date(stats.longestLossStreakSessions.endDate.seconds * 1000).toLocaleDateString('de-CH') : 'null');
      }
      
      console.log('\n🔍 Analysiere Session-Daten...');
      
      // Lade alle Sessions des Spielers
      const sessionsSnap = await db.collection('jassGameSummaries')
        .where('participantPlayerIds', 'array-contains', playerId)
        .where('status', '==', 'completed')
        .get();
      
      console.log(`Gefundene Sessions: ${sessionsSnap.docs.length}`);
      
      let maxPoints = 0, maxStriche = 0, maxMatsch = 0;
      
      sessionsSnap.docs.forEach(sessionDoc => {
        const session = sessionDoc.data();
        
        // Finde das Team des Spielers
        let playerTeam = null;
        if (session.teams?.top?.players.some(p => p.playerId === playerId)) {
          playerTeam = 'top';
        } else if (session.teams?.bottom?.players.some(p => p.playerId === playerId)) {
          playerTeam = 'bottom';
        }
        
        if (playerTeam) {
          const points = session.finalScores?.[playerTeam] || 0;
          const matsch = session.eventCounts?.[playerTeam]?.matsch || 0;
          const striche = (session.finalStriche?.[playerTeam]?.sieg || 0) + 
                         (session.finalStriche?.[playerTeam]?.berg || 0) + 
                         (session.finalStriche?.[playerTeam]?.matsch || 0) + 
                         (session.finalStriche?.[playerTeam]?.schneider || 0) + 
                         (session.finalStriche?.[playerTeam]?.kontermatsch || 0);
          
          if (points > maxPoints) maxPoints = points;
          if (striche > maxStriche) maxStriche = striche;
          if (matsch > maxMatsch) maxMatsch = matsch;
          
          console.log(`Session ${sessionDoc.id}: ${points} Punkte, ${striche} Striche, ${matsch} Matsche`);
        }
      });
      
      console.log(`\n📈 Erwartete Maximalwerte:`);
      console.log(`Max Punkte: ${maxPoints}`);
      console.log(`Max Striche: ${maxStriche}`);
      console.log(`Max Matsche: ${maxMatsch}`);
      
    } else {
      console.log('❌ Keine Statistiken gefunden');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Test:', error);
  }
  
  process.exit(0);
}

testPlayerHighlights(); 