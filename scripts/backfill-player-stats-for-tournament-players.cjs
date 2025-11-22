const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';

// Die 3 Spieler, die nur im Turnier waren
const TARGET_PLAYERS = [
  { id: 'PH15EO1vuTXq7FXal5Q_b', name: 'Reto' },
  { id: 'mgn9a1L5tM8iAJk5S2hkE', name: 'Schällenursli' },
  { id: '4nhOwuVONajPArNERzyEj', name: 'Davester' }
];

const DRY_RUN = false; // ✅ Auf false setzen zum Ausführen

async function backfillPlayerStats() {
  console.log('\n🔄 BACKFILL: globalStats.current für Turnier-Spieler\n');
  console.log('='.repeat(120));
  
  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - Keine Änderungen werden geschrieben!\n');
  } else {
    console.log('⚠️  PRODUCTION MODE - Änderungen werden geschrieben!\n');
  }
  
  try {
    // Lade jassGameSummary für das Turnier
    const summaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
    const summaryDoc = await summaryRef.get();
    
    if (!summaryDoc.exists) {
      console.log('❌ jassGameSummary nicht gefunden!');
      return;
    }
    
    const summaryData = summaryDoc.data();
    console.log(`\n📊 Turnier: ${summaryData?.tournamentName || TOURNAMENT_ID}`);
    console.log(`   Teilnehmer: ${summaryData?.participantPlayerIds?.length || 0}\n`);
    
    for (const targetPlayer of TARGET_PLAYERS) {
      console.log(`\n${'─'.repeat(120)}`);
      console.log(`\n👤 ${targetPlayer.name} (${targetPlayer.id})`);
      console.log('─'.repeat(120));
      
      // Prüfe ob Spieler im Turnier war
      if (!summaryData.participantPlayerIds?.includes(targetPlayer.id)) {
        console.log(`   ⚠️  Spieler war nicht im Turnier! Überspringe...`);
        continue;
      }
      
      // Lade aktuelles Player-Dokument
      const playerRef = db.collection('players').doc(targetPlayer.id);
      const playerDoc = await playerRef.get();
      const playerData = playerDoc.exists ? playerDoc.data() : {};
      
      // Prüfe ob globalStats.current existiert
      const hasGlobalStatsCurrent = playerData?.globalStats?.current;
      const hasGlobalStatsDirect = playerData?.globalStats && !playerData?.globalStats?.current;
      
      console.log(`\n📊 AKTUELLER STATUS:`);
      console.log(`   - globalStats.current: ${hasGlobalStatsCurrent ? '✅' : '❌'}`);
      console.log(`   - globalStats (direkt): ${hasGlobalStatsDirect ? '⚠️  (veraltet)' : '❌'}`);
      
      if (hasGlobalStatsCurrent) {
        console.log(`   ✅ globalStats.current existiert bereits! Überspringe...`);
        continue;
      }
      
      // Berechne globalStats aus jassGameSummary
      console.log(`\n🔧 BERECHNE globalStats aus jassGameSummary...`);
      
      const globalStats = {
        totalSessions: 0,
        sessionsWon: 0,
        sessionsLost: 0,
        sessionsDraw: 0,
        sessionWinRate: 0,
        totalTournaments: 1, // ✅ Turnier zählt als 1 Tournament
        totalGames: summaryData.gamesPlayed || 0,
        gamesWon: summaryData.gameWinsByPlayer?.[targetPlayer.id]?.wins || 0,
        gamesLost: summaryData.gameWinsByPlayer?.[targetPlayer.id]?.losses || 0,
        gamesDraw: summaryData.gameWinsByPlayer?.[targetPlayer.id]?.ties || 0,
        gameWinRate: 0,
        totalPointsMade: summaryData.totalPointsByPlayer?.[targetPlayer.id] || 0,
        totalPointsReceived: 0, // ✅ Muss aus gameResults berechnet werden
        pointsDifference: 0,
        avgPointsPerGame: 0,
        totalStricheMade: 0,
        totalStricheReceived: 0,
        stricheDifference: 0,
        avgStrichePerGame: 0,
        totalWeisPoints: 0,
        totalWeisReceived: 0,
        weisDifference: 0,
        avgWeisPerGame: 0,
        matschEventsMade: summaryData.totalEventCountsByPlayer?.[targetPlayer.id]?.matschMade || 0,
        matschEventsReceived: summaryData.totalEventCountsByPlayer?.[targetPlayer.id]?.matschReceived || 0,
        matschBilanz: 0,
        schneiderEventsMade: summaryData.totalEventCountsByPlayer?.[targetPlayer.id]?.schneiderMade || 0,
        schneiderEventsReceived: summaryData.totalEventCountsByPlayer?.[targetPlayer.id]?.schneiderReceived || 0,
        schneiderBilanz: 0,
        kontermatschEventsMade: summaryData.totalEventCountsByPlayer?.[targetPlayer.id]?.kontermatschMade || 0,
        kontermatschEventsReceived: summaryData.totalEventCountsByPlayer?.[targetPlayer.id]?.kontermatschReceived || 0,
        kontermatschBilanz: 0,
        trumpfStatistik: summaryData.aggregatedTrumpfCountsByPlayer?.[targetPlayer.id] || {},
        totalTrumpfCount: Object.values(summaryData.aggregatedTrumpfCountsByPlayer?.[targetPlayer.id] || {}).reduce((sum, count) => sum + count, 0),
        totalPlayTimeSeconds: summaryData.durationSeconds || 0,
        avgRoundDurationMilliseconds: 0,
        firstJassTimestamp: summaryData.startedAt || summaryData.createdAt || admin.firestore.Timestamp.now(),
        lastJassTimestamp: summaryData.completedAt || summaryData.endedAt || admin.firestore.Timestamp.now(),
      };
      
      // Berechne Differenzen aus gameResults
      if (summaryData.gameResults && Array.isArray(summaryData.gameResults)) {
        let pointsMade = 0;
        let pointsReceived = 0;
        let stricheMade = 0;
        let stricheReceived = 0;
        let weisPoints = 0;
        let weisReceived = 0;
        
        summaryData.gameResults.forEach((game) => {
          if (!game.teams || !game.finalStriche) return;
          
          const playerInTop = game.teams.top?.players?.some(p => p.playerId === targetPlayer.id);
          const playerInBottom = game.teams.bottom?.players?.some(p => p.playerId === targetPlayer.id);
          
          if (!playerInTop && !playerInBottom) return;
          
          const playerTeam = playerInTop ? 'top' : 'bottom';
          const opponentTeam = playerInTop ? 'bottom' : 'top';
          
          // Points
          pointsMade += playerTeam === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
          pointsReceived += playerTeam === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
          
          // Striche
          const playerStriche = game.finalStriche[playerTeam] || {};
          const opponentStriche = game.finalStriche[opponentTeam] || {};
          
          stricheMade += (playerStriche.berg || 0) + (playerStriche.sieg || 0) + 
                         (playerStriche.matsch || 0) + (playerStriche.schneider || 0) + 
                         (playerStriche.kontermatsch || 0);
          
          stricheReceived += (opponentStriche.berg || 0) + (opponentStriche.sieg || 0) + 
                            (opponentStriche.matsch || 0) + (opponentStriche.schneider || 0) + 
                            (opponentStriche.kontermatsch || 0);
        });
        
        globalStats.totalPointsMade = pointsMade;
        globalStats.totalPointsReceived = pointsReceived;
        globalStats.pointsDifference = pointsMade - pointsReceived;
        
        globalStats.totalStricheMade = stricheMade;
        globalStats.totalStricheReceived = stricheReceived;
        globalStats.stricheDifference = stricheMade - stricheReceived;
        
        // Weis (aus sessionTotalWeisPoints)
        if (summaryData.sessionTotalWeisPoints) {
          const playerTeam = summaryData.teams?.top?.players?.some(p => p.playerId === targetPlayer.id) ? 'top' : 'bottom';
          const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
          
          globalStats.totalWeisPoints = summaryData.sessionTotalWeisPoints[playerTeam] || 0;
          globalStats.totalWeisReceived = summaryData.sessionTotalWeisPoints[opponentTeam] || 0;
          globalStats.weisDifference = globalStats.totalWeisPoints - globalStats.totalWeisReceived;
        }
      }
      
      // Berechne Bilanzen
      globalStats.matschBilanz = globalStats.matschEventsMade - globalStats.matschEventsReceived;
      globalStats.schneiderBilanz = globalStats.schneiderEventsMade - globalStats.schneiderEventsReceived;
      globalStats.kontermatschBilanz = globalStats.kontermatschEventsMade - globalStats.kontermatschEventsReceived;
      
      // Berechne Durchschnitte
      if (globalStats.totalGames > 0) {
        globalStats.avgPointsPerGame = globalStats.pointsDifference / globalStats.totalGames;
        globalStats.avgStrichePerGame = globalStats.stricheDifference / globalStats.totalGames;
        globalStats.avgWeisPerGame = globalStats.weisDifference / globalStats.totalGames;
      }
      
      // Berechne Win Rates
      const decidedSessions = globalStats.sessionsWon + globalStats.sessionsLost;
      globalStats.sessionWinRate = decidedSessions > 0 ? globalStats.sessionsWon / decidedSessions : 0;
      globalStats.gameWinRate = globalStats.totalGames > 0 ? globalStats.gamesWon / globalStats.totalGames : 0;
      
      console.log(`\n📊 BERECHNETE STATS:`);
      console.log(`   - Sessions: ${globalStats.totalSessions} (W:${globalStats.sessionsWon}, L:${globalStats.sessionsLost}, D:${globalStats.sessionsDraw})`);
      console.log(`   - Tournaments: ${globalStats.totalTournaments}`);
      console.log(`   - Games: ${globalStats.totalGames} (W:${globalStats.gamesWon}, L:${globalStats.gamesLost})`);
      console.log(`   - Strichdifferenz: ${globalStats.stricheDifference}`);
      console.log(`   - Punktdifferenz: ${globalStats.pointsDifference}`);
      console.log(`   - Matsch-Bilanz: ${globalStats.matschBilanz}`);
      
      if (!DRY_RUN) {
        // ✅ Schreibe in globalStats.current
        await playerRef.set({
          globalStats: {
            current: globalStats
          },
          lastUpdated: admin.firestore.Timestamp.now()
        }, { merge: true });
        
        console.log(`\n✅ globalStats.current erfolgreich geschrieben!`);
      } else {
        console.log(`\n[DRY-RUN] Würde globalStats.current schreiben`);
      }
    }
    
    console.log(`\n${'='.repeat(120)}\n`);
    console.log(`✅ BACKFILL ABGESCHLOSSEN\n`);
    
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

backfillPlayerStats().catch(console.error);

