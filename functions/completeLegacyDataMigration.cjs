const admin = require('firebase-admin');

// Firebase initialisieren
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Vollständige Migration aller Rohdaten aus completedGames Subcollections
 * in die migrierten Session-Dokumente
 */
async function completeLegacyDataMigration() {
  console.log('🚀 Starte vollständige Legacy-Daten-Migration...');
  
  try {
    // Alle migrierten Session-Dokumente finden
    const sessionsSnapshot = await db.collection('jassGameSummaries')
      .where('migratedAt', '!=', null)
      .get();
    
    console.log(`📊 Gefunden: ${sessionsSnapshot.size} migrierte Sessions`);
    
    let processedCount = 0;
    let errorCount = 0;
    
    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionId = sessionDoc.id;
      const sessionData = sessionDoc.data();
      
      console.log(`\n🔄 Verarbeite Session: ${sessionId}`);
      
      try {
        // Prüfen ob bereits vollständig migriert
        if (sessionData.completedGames && 
            typeof sessionData.completedGames === 'object' && 
            Object.keys(sessionData.completedGames).length > 0 &&
            sessionData.completedGames.aggregatedRoundDurationsByPlayer) {
          
          // Prüfen ob roundDurations bereits korrekt sind (nicht alle 0)
          const hasValidRoundDurations = Object.values(sessionData.completedGames.aggregatedRoundDurationsByPlayer)
            .some(playerData => playerData.roundCount > 0 || playerData.totalDuration > 0);
          
          if (hasValidRoundDurations) {
            console.log(`  ✅ Session ${sessionId} bereits vollständig migriert, überspringe`);
            continue;
          }
        }
        
        // ✅ KORRIGIERT: Richtige Collection-Pfad verwenden
        const completedGamesSnapshot = await db.collection('jassGameSummaries', sessionId, 'completedGames')
          .orderBy('gameNumber', 'asc')
          .get();
        
        if (completedGamesSnapshot.empty) {
          console.log(`  ⚠️  Keine completedGames Subcollection für Session ${sessionId}`);
          continue;
        }
        
        console.log(`  📋 Gefunden: ${completedGamesSnapshot.size} Spiele in Subcollection`);
        
        // Alle Spiel-Daten sammeln
        const completedGamesData = {};
        let totalRounds = 0;
        const aggregatedTrumpfCountsByPlayer = {};
        const aggregatedRoundDurationsByPlayer = {};
        let rosen10player = null;
        
        // Player Number zu Player ID Mapping erstellen
        const playerNumberToIdMap = new Map();
        if (sessionData.participantPlayerIds && sessionData.participantPlayerIds.length >= 4) {
          for (let i = 0; i < 4; i++) {
            playerNumberToIdMap.set(i + 1, sessionData.participantPlayerIds[i]);
          }
        }
        
        completedGamesSnapshot.forEach((gameDoc) => {
          const gameData = gameDoc.data();
          const gameNumber = gameData.gameNumber || parseInt(gameDoc.id);
          
          console.log(`    🎮 Verarbeite Spiel ${gameNumber}`);
          
          // Spiel-Daten speichern
          completedGamesData[gameNumber] = {
            ...gameData,
            id: gameDoc.id
          };
          
          // Runden zählen
          if (gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
            const jassRoundsCount = gameData.roundHistory.filter(round => 
              round.actionType === 'jass' || round.farbe
            ).length;
            totalRounds += jassRoundsCount;
            console.log(`      📊 ${jassRoundsCount} Jass-Runden gefunden`);
          }
          
          // Trumpf-Counts aggregieren
          if (gameData.trumpfCountsByPlayer) {
            Object.entries(gameData.trumpfCountsByPlayer).forEach(([playerNumStr, trumpfCounts]) => {
              const playerNum = parseInt(playerNumStr, 10);
              const playerId = playerNumberToIdMap.get(playerNum) || playerNumStr;
              
              if (!aggregatedTrumpfCountsByPlayer[playerId]) {
                aggregatedTrumpfCountsByPlayer[playerId] = {};
              }
              
              Object.entries(trumpfCounts).forEach(([farbe, count]) => {
                if (!aggregatedTrumpfCountsByPlayer[playerId][farbe]) {
                  aggregatedTrumpfCountsByPlayer[playerId][farbe] = 0;
                }
                aggregatedTrumpfCountsByPlayer[playerId][farbe] += count;
              });
            });
          }
          
          // Rundenzeiten aggregieren
          if (gameData.roundDurationsByPlayer) {
            Object.entries(gameData.roundDurationsByPlayer).forEach(([playerNumStr, durations]) => {
              const playerNum = parseInt(playerNumStr, 10);
              const playerId = playerNumberToIdMap.get(playerNum) || playerNumStr;
              
              if (!aggregatedRoundDurationsByPlayer[playerId]) {
                aggregatedRoundDurationsByPlayer[playerId] = {
                  totalDuration: 0,
                  roundCount: 0
                };
              }
              
              aggregatedRoundDurationsByPlayer[playerId].totalDuration += durations.totalDuration || 0;
              aggregatedRoundDurationsByPlayer[playerId].roundCount += durations.roundCount || 0;
            });
          }
          
          // Rosen10player vom ersten Spiel
          if (gameNumber === 1 && gameData.Rosen10player) {
            const playerNum = parseInt(gameData.Rosen10player, 10);
            rosen10player = playerNumberToIdMap.get(playerNum) || gameData.Rosen10player;
          }
        });
        
        // Event-Counts berechnen (falls nicht vorhanden oder unvollständig)
        let eventCounts = sessionData.eventCounts;
        if (!eventCounts || Object.values(eventCounts.top).every(v => v === 0) && Object.values(eventCounts.bottom).every(v => v === 0)) {
          console.log(`    🔄 Berechne Event-Counts neu...`);
          eventCounts = { top: { sieg: 0, berg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, bottom: { sieg: 0, berg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } };
          
          Object.values(completedGamesData).forEach(gameData => {
            if (gameData.finalStriche) {
              // Top Team Events
              if (gameData.finalStriche.top) {
                eventCounts.top.sieg += gameData.finalStriche.top.sieg || 0;
                eventCounts.top.berg += gameData.finalStriche.top.berg || 0;
                eventCounts.top.matsch += gameData.finalStriche.top.matsch || 0;
                eventCounts.top.schneider += gameData.finalStriche.top.schneider || 0;
                eventCounts.top.kontermatsch += gameData.finalStriche.top.kontermatsch || 0;
              }
              
              // Bottom Team Events
              if (gameData.finalStriche.bottom) {
                eventCounts.bottom.sieg += gameData.finalStriche.bottom.sieg || 0;
                eventCounts.bottom.berg += gameData.finalStriche.bottom.berg || 0;
                eventCounts.bottom.matsch += gameData.finalStriche.bottom.matsch || 0;
                eventCounts.bottom.schneider += gameData.finalStriche.bottom.schneider || 0;
                eventCounts.bottom.kontermatsch += gameData.finalStriche.bottom.kontermatsch || 0;
              }
            }
          });
        }
        
        // Update-Daten vorbereiten
        const updateData = {
          completedGames: {
            ...completedGamesData,
            aggregatedTrumpfCountsByPlayer,
            aggregatedRoundDurationsByPlayer,
            Rosen10player: rosen10player
          },
          totalRounds,
          eventCounts,
          fullyMigratedAt: admin.firestore.Timestamp.now(),
          migrationNote: `Vollständige Migration aller Rohdaten aus completedGames Subcollection - ${completedGamesSnapshot.size} Spiele, ${totalRounds} Runden`
        };
        
        // Session-Dokument aktualisieren
        await sessionDoc.ref.update(updateData);
        
        console.log(`  ✅ Session ${sessionId} erfolgreich vollständig migriert:`);
        console.log(`     📊 ${Object.keys(completedGamesData).length} Spiele`);
        console.log(`     🎯 ${totalRounds} Runden`);
        console.log(`     👥 ${Object.keys(aggregatedTrumpfCountsByPlayer).length} Spieler mit Trumpf-Daten`);
        console.log(`     ⏱️  ${Object.keys(aggregatedRoundDurationsByPlayer).length} Spieler mit Rundenzeiten`);
        
        processedCount++;
        
      } catch (error) {
        console.error(`  ❌ Fehler bei Session ${sessionId}:`, error);
        errorCount++;
      }
    }
    
    console.log(`\n🎉 Migration abgeschlossen!`);
    console.log(`✅ Erfolgreich verarbeitet: ${processedCount} Sessions`);
    console.log(`❌ Fehler: ${errorCount} Sessions`);
    
  } catch (error) {
    console.error('❌ Kritischer Fehler bei der Migration:', error);
  }
}

// Migration ausführen
completeLegacyDataMigration()
  .then(() => {
    console.log('🏁 Migration beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration fehlgeschlagen:', error);
    process.exit(1);
  }); 