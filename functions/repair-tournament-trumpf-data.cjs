const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin initialisieren
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const TOURNAMENT_SESSION_ID = '6eNr8fnsTO06jgCqjelt';
const STUDI_ID = 'PLaDRlPBo91yu5Ij8MOT2';

async function repairTournamentTrumpfData() {
  console.log('🔧 Repariere Tournament Trumpf-Daten...\n');
  
  try {
    // 1. Hole die Tournament Session
    const sessionDoc = await db.collection('jassGameSummaries').doc(TOURNAMENT_SESSION_ID).get();
    if (!sessionDoc.exists) {
      console.log('❌ Tournament Session nicht gefunden!');
      return;
    }
    
    const sessionData = sessionDoc.data();
    console.log(`📋 Tournament Session: ${TOURNAMENT_SESSION_ID}`);
    console.log(`🎯 Spiele: ${sessionData.gamesPlayed || 0}`);
    console.log(`👥 Spieler: ${sessionData.participantPlayerIds?.length || 0}`);
    
    // 2. Prüfe ob bereits aggregatedTrumpfCountsByPlayer vorhanden
    if (sessionData.aggregatedTrumpfCountsByPlayer) {
      console.log('✅ aggregatedTrumpfCountsByPlayer bereits vorhanden!');
      console.log('📊 Aktuelle Daten:', sessionData.aggregatedTrumpfCountsByPlayer);
      return;
    }
    
    // 3. Hole alle completedGames
    const completedGamesSnap = await sessionDoc.ref.collection('completedGames').get();
    console.log(`🎮 Gefundene Spiele: ${completedGamesSnap.docs.length}`);
    
    const aggregatedTrumpfCounts = {};
    
    // 4. Player ID Mapping (1-basiert)
    const playerNumberToIdMap = new Map();
    if (sessionData.participantPlayerIds) {
      sessionData.participantPlayerIds.forEach((playerId, index) => {
        playerNumberToIdMap.set(index + 1, playerId);
        aggregatedTrumpfCounts[playerId] = {};
      });
    }
    
    console.log('🗺️ Player Mapping:', Object.fromEntries(playerNumberToIdMap));
    
    // 5. Iteriere durch alle Spiele und extrahiere Trumpf-Daten
    let totalRoundsProcessed = 0;
    let totalTrumpfEntriesFound = 0;
    
    completedGamesSnap.docs.forEach(gameDoc => {
      const gameData = gameDoc.data();
      const gameNumber = gameData.gameNumber;
      
      console.log(`\n🎯 Spiel ${gameNumber}:`);
      
      if (gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
        console.log(`  📋 Runden: ${gameData.roundHistory.length}`);
        
        gameData.roundHistory.forEach((round, roundIndex) => {
          totalRoundsProcessed++;
          
          if (round.currentPlayer && round.farbe) {
            const trumpfPlayerId = playerNumberToIdMap.get(round.currentPlayer);
            if (trumpfPlayerId) {
              const farbeKey = round.farbe.toLowerCase();
              
              if (!aggregatedTrumpfCounts[trumpfPlayerId][farbeKey]) {
                aggregatedTrumpfCounts[trumpfPlayerId][farbeKey] = 0;
              }
              aggregatedTrumpfCounts[trumpfPlayerId][farbeKey]++;
              totalTrumpfEntriesFound++;
              
              console.log(`    🃏 Runde ${roundIndex + 1}: Player ${round.currentPlayer} (${trumpfPlayerId}) -> ${round.farbe}`);
            }
          }
        });
      } else {
        console.log(`  ❌ Keine roundHistory gefunden`);
      }
    });
    
    console.log(`\n📊 Verarbeitung abgeschlossen:`);
    console.log(`📋 Runden total: ${totalRoundsProcessed}`);
    console.log(`🃏 Trumpf-Einträge gefunden: ${totalTrumpfEntriesFound}`);
    
    // 6. Zeige berechnete Daten
    console.log('\n🎯 Berechnete aggregatedTrumpfCountsByPlayer:');
    Object.entries(aggregatedTrumpfCounts).forEach(([playerId, trumpfCounts]) => {
      const playerName = sessionData.playerNames ? 
        Object.entries(sessionData.playerNames).find(([num, name]) => {
          const playerIdForNumber = playerNumberToIdMap.get(parseInt(num));
          return playerIdForNumber === playerId;
        })?.[1] : playerId;
      
      const totalTrumpfForPlayer = Object.values(trumpfCounts).reduce((sum, count) => sum + count, 0);
      console.log(`  ${playerName} (${playerId}): ${totalTrumpfForPlayer} Trumpf-Einträge`);
      Object.entries(trumpfCounts).forEach(([farbe, count]) => {
        console.log(`    - ${farbe}: ${count}`);
      });
    });
    
    // 7. Schreibe die berechneten Daten in die Session
    if (totalTrumpfEntriesFound > 0) {
      console.log('\n💾 Schreibe aggregatedTrumpfCountsByPlayer in Session...');
      
      await sessionDoc.ref.update({
        aggregatedTrumpfCountsByPlayer: aggregatedTrumpfCounts,
        lastUpdated: admin.firestore.Timestamp.now(),
        'migrationHistory': admin.firestore.FieldValue.arrayUnion({
          script: 'repair-tournament-trumpf-data.cjs',
          timestamp: admin.firestore.Timestamp.now(),
          description: 'Nachträglich berechnete aggregatedTrumpfCountsByPlayer für Tournament aus roundHistory',
          version: '1.0'
        })
      });
      
      console.log('✅ Tournament Trumpf-Daten erfolgreich repariert!');
      
      // 8. Verifikation: Prüfe Studis Daten
      const studisData = aggregatedTrumpfCounts[STUDI_ID];
      if (studisData) {
        const studisTotal = Object.values(studisData).reduce((sum, count) => sum + count, 0);
        console.log(`\n🎓 Studis Trumpf-Daten: ${studisTotal} Einträge`);
        Object.entries(studisData).forEach(([farbe, count]) => {
          console.log(`  - ${farbe}: ${count}`);
        });
      }
      
    } else {
      console.log('❌ Keine Trumpf-Daten gefunden, nichts zu reparieren.');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Reparieren:', error);
  }
}

repairTournamentTrumpfData().then(() => {
  console.log('\n🏁 Reparatur abgeschlossen.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fehler:', err);
  process.exit(1);
}); 