const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Hilfsfunktion für Striche-Summe
function sumStriche(rec) {
  if (!rec) return 0;
  return (rec.berg || 0) + (rec.sieg || 0) + (rec.matsch || 0) + (rec.schneider || 0) + (rec.kontermatsch || 0);
}

async function backfillGroupCumulativeStats(groupId) {
  console.log(`\n📊 Processing group: ${groupId}`);
  
  // Lade alle Sessions chronologisch
  const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get();
  
  if (sessionsSnap.empty) {
    console.log(`⚠️  No completed sessions for group ${groupId}`);
    return;
  }
  
  console.log(`✅ Found ${sessionsSnap.docs.length} sessions`);
  
  const sessions = sessionsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  
  // Kumulative Werte für ALLE Spieler über ALLE Sessions
  const globalCumulativeStats = {};
  
  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {
    const session = sessions[sessionIndex];
    console.log(`\n📝 Processing session ${sessionIndex + 1}/${sessions.length} (${session.id})`);
    
    // Per-Player Stats für DIESE Session (soll den aktuellen kumulativen Stand wiedergeben)
    const sessionCumulativeStats = {};
    
    // Initialisiere ALLE Teilnehmer für diese Session
    if (session.participantPlayerIds && Array.isArray(session.participantPlayerIds)) {
      session.participantPlayerIds.forEach(playerId => {
        if (!globalCumulativeStats[playerId]) {
          globalCumulativeStats[playerId] = { cumulativeStricheDiff: 0, cumulativePointsDiff: 0 };
        }
        if (!sessionCumulativeStats[playerId]) {
          sessionCumulativeStats[playerId] = { cumulativeStricheDiff: 0, cumulativePointsDiff: 0 };
        }
      });
    }
    
    // ✅ TOURNAMENT: Wenn session.tournamentId existiert
    if (session.tournamentId) {
      console.log(`🏆 Tournament session detected (${session.id})`);
      
      // ✅ FALLBACK 1: Berechne aus session.finalStriche (FÜR TOURNAMENTS!)
      if (session.finalStriche && session.teams) {
        console.log(`📊 Calculating from session.finalStriche for tournament`);
        
        const topStricheSum = sumStriche(session.finalStriche.top);
        const bottomStricheSum = sumStriche(session.finalStriche.bottom);
        const stricheDiffTop = topStricheSum - bottomStricheSum;
        
        const topPoints = session.finalScores?.top || 0;
        const bottomPoints = session.finalScores?.bottom || 0;
        const pointsDiffTop = topPoints - bottomPoints;
        
        const topPlayerIds = session.teams.top.players.map(p => p.playerId);
        const bottomPlayerIds = session.teams.bottom.players.map(p => p.playerId);
        
        console.log(`  Session totals: topStriche=${topStricheSum}, bottomStriche=${bottomStricheSum}, diff=${stricheDiffTop}`);
        
        // ✅ KORREKTUR: stricheDiffTop ist bereits (top - bottom)
        // Für top: stricheDiffTop ist POSITIV wenn top gewinnt → +stricheDiffTop
        // Für bottom: stricheDiffTop ist NEGATIV wenn top gewinnt → -stricheDiffTop (BEREITS KORREKT!)
        
        // ✅ Update KUMULATIVE Werte für ALLE Spieler
        topPlayerIds.forEach(playerId => {
          if (!globalCumulativeStats[playerId]) {
            globalCumulativeStats[playerId] = { cumulativeStricheDiff: 0, cumulativePointsDiff: 0 };
          }
          globalCumulativeStats[playerId].cumulativeStricheDiff += stricheDiffTop;
          globalCumulativeStats[playerId].cumulativePointsDiff += pointsDiffTop;
        });
        
        bottomPlayerIds.forEach(playerId => {
          if (!globalCumulativeStats[playerId]) {
            globalCumulativeStats[playerId] = { cumulativeStricheDiff: 0, cumulativePointsDiff: 0 };
          }
          // ✅ KORREKTUR: stricheDiffTop ist bereits top - bottom
          // Wenn stricheDiffTop = +7, dann haben top-P. +7, bottom-P. -7
          globalCumulativeStats[playerId].cumulativeStricheDiff -= stricheDiffTop;
          globalCumulativeStats[playerId].cumulativePointsDiff -= pointsDiffTop;
        });
      }
      // ✅ FALLBACK 2: Berechne aus gameResults (falls verfügbar)
      else if (session.gameResults && Array.isArray(session.gameResults) && session.gameResults.length > 0) {
        console.log(`📊 Processing ${session.gameResults.length} games from gameResults`);
        
        for (const game of session.gameResults) {
          // ✅ SAFETY CHECK: Validiere game.finalStriche
          if (!game.finalStriche || !game.finalStriche.top || !game.finalStriche.bottom) {
            continue;
          }
          
          // ✅ KORREKTUR: Für Tournaments haben gameResults.teams oft keine players!
          // Fallback: Verwende session.teams (statische Teams für alle Games)
          let topPlayerIds, bottomPlayerIds;
          
          if (game.teams && game.teams.top && game.teams.bottom && 
              game.teams.top.players && game.teams.bottom.players) {
            // Try game.teams first
            topPlayerIds = game.teams.top.players.map(p => p.playerId);
            bottomPlayerIds = game.teams.bottom.players.map(p => p.playerId);
          } else if (session.teams && session.teams.top && session.teams.bottom) {
            // Fallback: session.teams
            topPlayerIds = session.teams.top.players.map(p => p.playerId);
            bottomPlayerIds = session.teams.bottom.players.map(p => p.playerId);
          } else {
            continue;
          }
          
          // Berechne Team-Level Differenzen
          const topStricheSum = sumStriche(game.finalStriche.top);
          const bottomStricheSum = sumStriche(game.finalStriche.bottom);
          const stricheDiffTop = topStricheSum - bottomStricheSum;
          
          const pointsDiffTop = (game.topScore || 0) - (game.bottomScore || 0);
          
          // ✅ Update KUMULATIVE Werte für ALLE Spieler
          topPlayerIds.forEach(playerId => {
            if (!globalCumulativeStats[playerId]) {
              globalCumulativeStats[playerId] = { cumulativeStricheDiff: 0, cumulativePointsDiff: 0 };
            }
            globalCumulativeStats[playerId].cumulativeStricheDiff += stricheDiffTop;
            globalCumulativeStats[playerId].cumulativePointsDiff += pointsDiffTop;
          });
          
          bottomPlayerIds.forEach(playerId => {
            if (!globalCumulativeStats[playerId]) {
              globalCumulativeStats[playerId] = { cumulativeStricheDiff: 0, cumulativePointsDiff: 0 };
            }
            globalCumulativeStats[playerId].cumulativeStricheDiff -= stricheDiffTop;
            globalCumulativeStats[playerId].cumulativePointsDiff -= pointsDiffTop;
          });
        }
      }
    } else {
      // ✅ REGULAR SESSION: Lade completedGames und berechne
      const gamesSnap = await db.collection(`groups/${groupId}/jassGameSummaries/${session.id}/completedGames`)
        .orderBy('gameNumber', 'asc')
        .get();
      
      if (gamesSnap.empty) {
        console.log(`⚠️  No games for session ${session.id}`);
        continue;
      }
      
      const games = gamesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Iteriere über alle Spiele dieser Session
      for (const game of games) {
        if (!game.finalStriche || !game.finalScores) continue;
        
        // Bestimme Teams aus game.teams ODER session.teams
        const gameTeams = game.teams || session.teams;
        if (!gameTeams) continue;
        
        const topPlayerIds = gameTeams.top?.players?.map(p => p.playerId || p.userId) || [];
        const bottomPlayerIds = gameTeams.bottom?.players?.map(p => p.playerId || p.userId) || [];
        
        // Berechne Team-Level Differenzen
        const topStricheSum = sumStriche(game.finalStriche.top);
        const bottomStricheSum = sumStriche(game.finalStriche.bottom);
        const stricheDiffTop = topStricheSum - bottomStricheSum;
        
        const topPoints = game.finalScores.top || 0;
        const bottomPoints = game.finalScores.bottom || 0;
        const pointsDiffTop = topPoints - bottomPoints;
        
        // ✅ Update KUMULATIVE Werte für ALLE Spieler (über ALLE Sessions)
        topPlayerIds.forEach(playerId => {
          if (globalCumulativeStats[playerId]) {
            globalCumulativeStats[playerId].cumulativeStricheDiff += stricheDiffTop;
            globalCumulativeStats[playerId].cumulativePointsDiff += pointsDiffTop;
          }
        });
        
        bottomPlayerIds.forEach(playerId => {
          if (globalCumulativeStats[playerId]) {
            globalCumulativeStats[playerId].cumulativeStricheDiff -= stricheDiffTop;
            globalCumulativeStats[playerId].cumulativePointsDiff -= pointsDiffTop;
          }
        });
      }
    }
    
    // Schreibe Session-Level kumulative Werte (aktueller Stand nach dieser Session)
    // ✅ KORREKTUR: Nur für Teilnehmer dieser Session (nicht für alle Spieler!)
    // sessionCumulativeStats enthält bereits nur teilnehmende Spieler (siehe Zeilen 48-57)
    
    // Update Session-Dokument mit kumulativen Stats
    await db.collection(`groups/${groupId}/jassGameSummaries`).doc(session.id).update({
      playerCumulativeStats: sessionCumulativeStats
    });
    
    console.log(`✅ Updated session ${session.id} with cumulative stats for ${Object.keys(sessionCumulativeStats).length} players`);
  }
  
  console.log(`\n✅ COMPLETED: Group ${groupId} processed successfully`);
}

async function backfillAllGroups() {
  console.log('📊 Starting backfill for ALL groups...\n');
  
  const groupsSnap = await db.collection('groups').get();
  const groupIds = groupsSnap.docs.map(doc => doc.id);
  
  console.log(`✅ Found ${groupIds.length} groups to process\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < groupIds.length; i++) {
    const groupId = groupIds[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing group ${i + 1}/${groupIds.length}: ${groupId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
      await backfillGroupCumulativeStats(groupId);
      successCount++;
      console.log(`✅ Group ${groupId} completed successfully`);
    } catch (error) {
      errorCount++;
      console.error(`❌ Error processing group ${groupId}:`, error.message || error);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 BACKFILL SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`📊 Total: ${groupIds.length}`);
  console.log(`${'='.repeat(60)}\n`);
}

async function main() {
  const groupId = process.argv[2];
  
  if (groupId) {
    // Process single group
    try {
      await backfillGroupCumulativeStats(groupId);
      console.log('\n🎉 Backfill completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Error during backfill:', error);
      process.exit(1);
    }
  } else {
    // Process all groups
    try {
      await backfillAllGroups();
      console.log('\n🎉 All groups backfilled successfully!');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Error during backfill:', error);
      process.exit(1);
    }
  }
}

main();

