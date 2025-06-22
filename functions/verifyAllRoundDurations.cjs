const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

// Konvertiert verschiedene Zeitformate in Millisekunden
function convertToMillis(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp === 'number') return timestamp; // Bereits in Millisekunden
  if (timestamp instanceof admin.firestore.Timestamp) return timestamp.toMillis();
  if (timestamp._seconds) return (timestamp._seconds * 1000) + (timestamp._nanoseconds / 1000000);
  return null;
}

async function verifyAllRoundDurations() {
  console.log('🔍 AKRIBISCHE PRÜFUNG ALLER RUNDEN-ZEITDATEN');
  console.log('='.repeat(80));

  const stats = {
    totalSessions: 0,
    sessionsWithGames: 0,
    totalGames: 0,
    totalRounds: 0,
    roundsWithTimestamp: 0,
    roundsWithDurationMillis: 0,
    roundsWithManualDurationCalc: 0,
    suspiciousDurations: 0,
    playerRoundCounts: new Map(),
  };

  try {
    const specificSessionIds = [
        'UIamH_JPMb9Yd5-sWHr-U',
        '_JnhFz9Qvn5PIhmYqtrT6',
        'fNGTXwzTxxinFXW1EF91B',
        'ra677t9Bg3fswFEewcS3U',
        'uqTh87TcPRpEkmiQAUp0_',
        'zW1cqUo43ed-imk_RintC'
    ];
    stats.totalSessions = specificSessionIds.length;

    console.log(`📊 ${stats.totalSessions} spezifische Sessions werden analysiert...`);

    for (const sessionId of specificSessionIds) {
      const sessionDocSnap = await db.collection('jassGameSummaries').doc(sessionId).get();
      
      if (!sessionDocSnap.exists) {
        console.log(`\n- ❌ SESSION ${sessionId} nicht gefunden.`);
        continue;
      }
      
      const sessionDoc = sessionDocSnap;
      const sessionData = sessionDoc.data();

      // NEU: Korrupte Session überspringen
      if (sessionId === 'fNGTXwzTxxinFXW1EF91B') {
          console.log(`\n- ⏩ SESSION ${sessionId} wird übersprungen (bekannte Datenkorruption).`);
          continue;
      }

      const gamesSnap = await sessionDoc.ref.collection('completedGames').get();
      
      if (gamesSnap.empty) {
        continue;
      }
      stats.sessionsWithGames++;

      console.log(`\n🎯 SESSION: ${sessionDoc.id} (${gamesSnap.docs.length} Spiele)`);

      const playerMapping = new Map();
      if (sessionData.teams) {
          for(const team of Object.values(sessionData.teams)) {
              if (team.players) {
                  for(const player of team.players) {
                      if(player.id && player.player_doc_id) {
                          playerMapping.set(player.id.toString(), player.player_doc_id);
                      }
                  }
              }
          }
      }


      for (const gameDoc of gamesSnap.docs) {
        stats.totalGames++;
        const gameData = gameDoc.data();
        console.log(`  🎮 SPIEL ${gameDoc.id}`);
        console.log(`    - Verfügbare Spielfelder: ${Object.keys(gameData).join(', ')}`);

        if (gameData.roundHistory && Array.isArray(gameData.roundHistory) && gameData.roundHistory.length > 0) {
          console.log(`    - ${gameData.roundHistory.length} Runden gefunden.`);
          stats.totalRounds += gameData.roundHistory.length;

          let lastTimestamp = null;
          
          // NEU: Präzisen Spielstart berechnen (mit Fallback für completedAt)
          const gameEndTime = convertToMillis(gameData.timestampCompleted || gameData.completedAt);
          const gameDuration = gameData.durationMillis;
          console.log(`    - DEBUG: gameEndTime=${gameEndTime}, gameDuration=${gameDuration}`);
          let gameStartTime = null;
          if (gameEndTime && gameDuration) {
              gameStartTime = gameEndTime - gameDuration;
              lastTimestamp = gameStartTime; // Startpunkt für die erste Runde
          }


          for (const [index, round] of gameData.roundHistory.entries()) {
            let roundDurationInfo = '';
            let calculatedDuration = null;
            
            // Spieler-ID ermitteln
            const playerNum = round.currentPlayer;
            const playerId = playerMapping.get(playerNum?.toString());


            if(playerId) {
                stats.playerRoundCounts.set(playerId, (stats.playerRoundCounts.get(playerId) || 0) + 1);
            }

            if (round.timestamp) {
              stats.roundsWithTimestamp++;
              const currentTimestamp = convertToMillis(round.timestamp);

              if (lastTimestamp && currentTimestamp) {
                calculatedDuration = currentTimestamp - lastTimestamp;
              }
              // Die Logik mit der Schätzung wird entfernt.
              // Die erste Runde wird nun durch den gameStartTime korrekt berechnet.

              if (calculatedDuration !== null) {
                  roundDurationInfo += ` | Berechnet: ${Math.round(calculatedDuration)}ms`;
                  stats.roundsWithManualDurationCalc++;

                  if (calculatedDuration <= 0 || calculatedDuration > 15 * 60 * 1000) {
                      stats.suspiciousDurations++;
                      roundDurationInfo += ' (⚠️ SUSPEKT)';
                  }
              }

              lastTimestamp = currentTimestamp;
            }

            if (round.durationMillis) {
              stats.roundsWithDurationMillis++;
              roundDurationInfo += ` | durationMillis: ${round.durationMillis}ms`;
            }

            console.log(`      🔄 RUNDE ${index + 1}: Spieler ${playerId || `(Nummer ${playerNum})`} ${roundDurationInfo}`);
          }
        } else {
          console.log(`    - ❌ KEINE roundHistory gefunden!`);
        }
      }
    }

    console.log('\n\n✅ PRÜFUNG ABGESCHLOSSEN - ZUSAMMENFASSUNG');
    console.log('='.repeat(80));
    console.log(`- Total analysierte Sessions: ${stats.totalSessions}`);
    console.log(`  - Davon mit Spielen: ${stats.sessionsWithGames}`);
    console.log(`- Total analysierte Spiele: ${stats.totalGames}`);
    console.log(`- Total analysierte Runden: ${stats.totalRounds}`);
    console.log(`- Runden mit 'timestamp' Feld: ${stats.roundsWithTimestamp} (${(stats.roundsWithTimestamp / stats.totalRounds * 100).toFixed(1)}%)`);
    console.log(`- Runden mit 'durationMillis' Feld: ${stats.roundsWithDurationMillis} (${(stats.roundsWithDurationMillis / stats.totalRounds * 100).toFixed(1)}%)`);
    console.log(`- Runden mit manuell berechneter Dauer: ${stats.roundsWithManualDurationCalc} (${(stats.roundsWithManualDurationCalc / stats.totalRounds * 100).toFixed(1)}%)`);
    console.log(`- Runden mit suspekter Dauer (>15min oder <=0): ${stats.suspiciousDurations}`);
    console.log('\n- Runden pro Spieler:');
    
    // Sortiere Spieler nach Anzahl Runden
    const sortedPlayers = [...stats.playerRoundCounts.entries()].sort((a, b) => b[1] - a[1]);
    for(const [playerId, count] of sortedPlayers) {
        console.log(`  - ${playerId}: ${count} Runden`);
    }


  } catch (error) {
    console.error('❌ Schwerwiegender Fehler bei der Prüfung:', error);
  }
}

verifyAllRoundDurations().then(() => {
  console.log('\nSkript beendet.');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fehler beim Ausführen des Skripts:', error);
  process.exit(1);
}); 