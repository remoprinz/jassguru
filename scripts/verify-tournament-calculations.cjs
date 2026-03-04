/**
 * 🔍 DETAILLIERTE VERIFIKATION: Tournament-Berechnungen
 * 
 * Rechnet die Tournament-Werte manuell nach und vergleicht mit Chart-Daten
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const JASS_GAME_SUMMARY_ID = '6eNr8fnsTO06jgCqjelt';

/**
 * Berechnet Gesamt-Striche aus finalStriche
 */
function calculateTotalStriche(striche) {
  return (striche.sieg || 0) + (striche.berg || 0) + (striche.matsch || 0) + 
         (striche.schneider || 0) + (striche.kontermatsch || 0);
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔍 DETAILLIERTE VERIFIKATION: Tournament-Berechnungen  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Lade jassGameSummary
    const summaryDoc = await db
      .collection('groups')
      .doc(GROUP_ID)
      .collection('jassGameSummaries')
      .doc(JASS_GAME_SUMMARY_ID)
      .get();

    if (!summaryDoc.exists) {
      console.error('❌ jassGameSummary nicht gefunden!');
      return;
    }

    const summary = summaryDoc.data();
    const gameResults = summary.gameResults || [];

    console.log(`📊 Tournament: ${summary.tournamentName || 'Unbekannt'}`);
    console.log(`📅 Datum: ${summary.completedAt?.toDate?.()?.toLocaleDateString('de-DE') || 'N/A'}`);
    console.log(`🎮 Anzahl Spiele: ${gameResults.length}\n`);

    if (gameResults.length === 0) {
      console.error('❌ Keine gameResults gefunden!');
      return;
    }

    // 2. Sammle alle Spieler
    const playerMap = new Map(); // playerId -> { displayName, stricheDiff, pointsDiff, gamesPlayed }

    gameResults.forEach((game, gameIndex) => {
      const gameTeams = game.teams || {};
      const topPlayers = gameTeams.top?.players || [];
      const bottomPlayers = gameTeams.bottom?.players || [];
      
      const gameFinalStriche = game.finalStriche || {};
      const topStriche = calculateTotalStriche(gameFinalStriche.top || {});
      const bottomStriche = calculateTotalStriche(gameFinalStriche.bottom || {});
      const stricheDiff = topStriche - bottomStriche; // Positiv = Top gewinnt, Negativ = Bottom gewinnt
      
      const topScore = game.topScore || 0;
      const bottomScore = game.bottomScore || 0;
      const pointsDiff = topScore - bottomScore;

      // Top-Spieler
      topPlayers.forEach(player => {
        const playerId = player.playerId;
        if (!playerMap.has(playerId)) {
          playerMap.set(playerId, {
            displayName: player.displayName || playerId,
            stricheDiff: 0,
            pointsDiff: 0,
            gamesPlayed: 0,
            gameDetails: []
          });
        }
        
        const playerData = playerMap.get(playerId);
        playerData.stricheDiff += stricheDiff; // Top-Spieler bekommt Top-Differenz
        playerData.pointsDiff += pointsDiff;
        playerData.gamesPlayed++;
        playerData.gameDetails.push({
          gameNumber: game.gameNumber || (gameIndex + 1),
          team: 'top',
          stricheDiff,
          pointsDiff,
          topStriche,
          bottomStriche,
          topScore,
          bottomScore
        });
      });

      // Bottom-Spieler
      bottomPlayers.forEach(player => {
        const playerId = player.playerId;
        if (!playerMap.has(playerId)) {
          playerMap.set(playerId, {
            displayName: player.displayName || playerId,
            stricheDiff: 0,
            pointsDiff: 0,
            gamesPlayed: 0,
            gameDetails: []
          });
        }
        
        const playerData = playerMap.get(playerId);
        playerData.stricheDiff += -stricheDiff; // Bottom-Spieler bekommt negative Top-Differenz (= Bottom-Differenz)
        playerData.pointsDiff += -pointsDiff;
        playerData.gamesPlayed++;
        playerData.gameDetails.push({
          gameNumber: game.gameNumber || (gameIndex + 1),
          team: 'bottom',
          stricheDiff: -stricheDiff,
          pointsDiff: -pointsDiff,
          topStriche,
          bottomStriche,
          topScore,
          bottomScore
        });
      });
    });

    // 3. Lade aktuelle Chart-Daten
    const stricheChartDoc = await db.doc(`groups/${GROUP_ID}/aggregated/chartData_striche`).get();
    const pointsChartDoc = await db.doc(`groups/${GROUP_ID}/aggregated/chartData_points`).get();
    
    const stricheChartData = stricheChartDoc.exists ? stricheChartDoc.data() : null;
    const pointsChartData = pointsChartDoc.exists ? pointsChartDoc.data() : null;

    // Finde Tournament-Session Index (sollte Index 1 sein)
    const tournamentDate = summary.completedAt?.toDate?.()?.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    let tournamentIndex = -1;
    if (stricheChartData && stricheChartData.labels) {
      tournamentIndex = stricheChartData.labels.findIndex(label => label === tournamentDate);
    }

    // 4. Vergleich
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 SPIELER-VERGLEICH                                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    let allCorrect = true;

    playerMap.forEach((playerData, playerId) => {
      console.log(`\n👤 ${playerData.displayName} (${playerId.substring(0, 8)}...)`);
      console.log('─'.repeat(80));
      
      // Manuell berechnete Werte
      const calculatedStricheDiff = playerData.stricheDiff;
      const calculatedPointsDiff = playerData.pointsDiff;
      
      console.log(`📊 Manuell berechnet (aus ${playerData.gamesPlayed} Spielen):`);
      console.log(`   Strichdifferenz: ${calculatedStricheDiff}`);
      console.log(`   Punktedifferenz: ${calculatedPointsDiff}`);
      
      // Chart-Werte
      let chartStricheValue = null;
      let chartPointsValue = null;
      
      if (stricheChartData && tournamentIndex >= 0) {
        const stricheDataset = stricheChartData.datasets.find(ds => ds.playerId === playerId);
        if (stricheDataset && stricheDataset.data[tournamentIndex] !== null) {
          chartStricheValue = stricheDataset.data[tournamentIndex];
        }
      }
      
      if (pointsChartData && tournamentIndex >= 0) {
        const pointsDataset = pointsChartData.datasets.find(ds => ds.playerId === playerId);
        if (pointsDataset && pointsDataset.data[tournamentIndex] !== null) {
          chartPointsValue = pointsDataset.data[tournamentIndex];
        }
      }
      
      // ABER: Chart-Werte sind KUMULATIV! Wir müssen den Wert VOR dem Turnier abziehen
      // Für jetzt: Vergleiche nur die DELTA-Werte
      
      // Lade Wert VOR dem Turnier (Index 0)
      let previousStricheValue = 0;
      let previousPointsValue = 0;
      
      if (stricheChartData && tournamentIndex > 0) {
        const stricheDataset = stricheChartData.datasets.find(ds => ds.playerId === playerId);
        if (stricheDataset) {
          // Finde letzten nicht-null Wert vor dem Turnier
          for (let i = tournamentIndex - 1; i >= 0; i--) {
            if (stricheDataset.data[i] !== null) {
              previousStricheValue = stricheDataset.data[i];
              break;
            }
          }
        }
      }
      
      if (pointsChartData && tournamentIndex > 0) {
        const pointsDataset = pointsChartData.datasets.find(ds => ds.playerId === playerId);
        if (pointsDataset) {
          for (let i = tournamentIndex - 1; i >= 0; i--) {
            if (pointsDataset.data[i] !== null) {
              previousPointsValue = pointsDataset.data[i];
              break;
            }
          }
        }
      }
      
      // Berechne Delta aus Chart-Werten
      const chartStricheDelta = chartStricheValue !== null ? chartStricheValue - previousStricheValue : null;
      const chartPointsDelta = chartPointsValue !== null ? chartPointsValue - previousPointsValue : null;
      
      console.log(`\n📈 Chart-Werte (Index ${tournamentIndex}):`);
      console.log(`   Vorher: Striche=${previousStricheValue}, Punkte=${previousPointsValue}`);
      console.log(`   Nachher: Striche=${chartStricheValue}, Punkte=${chartPointsValue}`);
      console.log(`   Delta: Striche=${chartStricheDelta}, Punkte=${chartPointsDelta}`);
      
      // Vergleich
      const stricheMatch = chartStricheDelta === calculatedStricheDiff;
      const pointsMatch = chartPointsDelta === calculatedPointsDiff;
      
      if (stricheMatch && pointsMatch) {
        console.log(`\n✅ ✅ ✅ ALLE WERTE STIMMEN ÜBEREIN!`);
      } else {
        allCorrect = false;
        console.log(`\n❌ ❌ ❌ UNTERSCHIEDE GEFUNDEN!`);
        if (!stricheMatch) {
          console.log(`   Strichdifferenz: Erwartet ${calculatedStricheDiff}, Chart zeigt ${chartStricheDelta}`);
        }
        if (!pointsMatch) {
          console.log(`   Punktedifferenz: Erwartet ${calculatedPointsDiff}, Chart zeigt ${chartPointsDelta}`);
        }
      }
      
      // Zeige Details der ersten 3 Spiele
      console.log(`\n📋 Erste 3 Spiele:`);
      playerData.gameDetails.slice(0, 3).forEach(detail => {
        console.log(`   Spiel ${detail.gameNumber} (${detail.team}): Striche=${detail.stricheDiff}, Punkte=${detail.pointsDiff}`);
      });
    });

    // 5. Zusammenfassung
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📋 ZUSAMMENFASSUNG                                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    if (allCorrect) {
      console.log('✅ ✅ ✅ ALLE BEREICHNUNGEN SIND KORREKT!');
      console.log('Die Tournament-Session wurde korrekt in die Chart-Daten integriert.');
    } else {
      console.log('❌ ❌ ❌ FEHLER GEFUNDEN!');
      console.log('Bitte prüfe die Ausgabe oben für Details.');
    }

    console.log('\n🎉 Verifikation abgeschlossen!');

  } catch (error) {
    console.error('\n❌ Fehler:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });

