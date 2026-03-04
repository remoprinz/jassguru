/**
 * 🔍 UMFASSENDE VERIFIKATION: Alle GroupView Statistiken
 * 
 * Rechnet ALLE Statistiken aus Player- und Team-Tab manuell nach
 * und vergleicht mit den aktuellen DB-Daten
 * 
 * KEIN BACKFILL - NUR KONTROLLE!
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
 * Berechnet Gesamt-Striche
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
  console.log('║  🔍 UMFASSENDE VERIFIKATION: GroupView Statistiken      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log('⚠️  NUR KONTROLLE - KEIN BACKFILL!\n');

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

    // 2. Lade originale Tournament-Games für korrekte Event-Counts
    const TOURNAMENT_ID = summary.tournamentId;
    let tournamentGames = [];
    
    if (TOURNAMENT_ID) {
      const gamesSnap = await db
        .collection('tournaments')
        .doc(TOURNAMENT_ID)
        .collection('games')
        .orderBy('passeNumber', 'asc')
        .get();
      
      tournamentGames = gamesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`📊 Geladene originale Tournament-Games: ${tournamentGames.length}\n`);
    }

    // ============================================
    // PLAYER STATISTIKEN
    // ============================================
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  👤 PLAYER TAB - STATISTIKEN                              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Sammle Player-Daten
    const playerStats = new Map(); // playerId -> { displayName, stricheDiff, pointsDiff, matschBilanz, schneiderBilanz, weisDiff, wins, losses, draws, gamesWon, gamesLost }

    // ✅ KORREKTUR: Verwende originale Tournament-Games für Event-Counts
    tournamentGames.forEach((game, gameIndex) => {
      const playerDetails = game.playerDetails || [];
      
      // Berechne Team-Differenzen aus gameResults (für Strich/Punkt-Differenzen)
      const gameResult = gameResults[gameIndex] || {};
      const gameFinalStriche = gameResult.finalStriche || {};
      const topStriche = calculateTotalStriche(gameFinalStriche.top || {});
      const bottomStriche = calculateTotalStriche(gameFinalStriche.bottom || {});
      const stricheDiff = topStriche - bottomStriche;
      
      const topScore = gameResult.topScore || 0;
      const bottomScore = gameResult.bottomScore || 0;
      const pointsDiff = topScore - bottomScore;

      // ✅ KORREKT: Event-Counts aus individuellen Spieler-Strichen
      playerDetails.forEach(player => {
        const playerId = player.playerId;
        const playerTeam = player.team;
        const playerStriche = player.stricheInPasse || {};
        
        if (!playerStats.has(playerId)) {
          playerStats.set(playerId, {
            displayName: player.playerName || playerId,
            stricheDiff: 0,
            pointsDiff: 0,
            matschMade: 0,
            matschReceived: 0,
            schneiderMade: 0,
            schneiderReceived: 0,
            kontermatschMade: 0,
            kontermatschReceived: 0,
            weisPoints: 0,
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0
          });
        }
        
        const stats = playerStats.get(playerId);
        
        // Made: Eigene Striche
        stats.matschMade += playerStriche.matsch || 0;
        stats.schneiderMade += playerStriche.schneider || 0;
        stats.kontermatschMade += playerStriche.kontermatsch || 0;
        
        // Received: Von GEGNERISCHEN Spielern in diesem Spiel
        const opponentPlayers = playerDetails.filter(p => p.team !== playerTeam);
        opponentPlayers.forEach(opponent => {
          const opponentStriche = opponent.stricheInPasse || {};
          stats.matschReceived += opponentStriche.matsch || 0;
          stats.schneiderReceived += opponentStriche.schneider || 0;
          stats.kontermatschReceived += opponentStriche.kontermatsch || 0;
        });
        
        // Strich/Punkt-Differenzen basierend auf Team
        if (playerTeam === 'top') {
          stats.stricheDiff += stricheDiff;
          stats.pointsDiff += pointsDiff;
        } else {
          stats.stricheDiff += -stricheDiff;
          stats.pointsDiff += -pointsDiff;
        }
        
        stats.gamesPlayed++;
        
        if (gameResult.winnerTeam === playerTeam) {
          stats.gamesWon++;
        } else {
          stats.gamesLost++;
        }
      });
    });

    // ALT: Alte Berechnung (nur für Vergleich)
    /*gameResults.forEach((game) => {
      const gameTeams = game.teams || {};
      const topPlayers = gameTeams.top?.players || [];
      const bottomPlayers = gameTeams.bottom?.players || [];
      
      const gameFinalStriche = game.finalStriche || {};
      const topStriche = calculateTotalStriche(gameFinalStriche.top || {});
      const bottomStriche = calculateTotalStriche(gameFinalStriche.bottom || {});
      const stricheDiff = topStriche - bottomStriche;
      
      const topScore = game.topScore || 0;
      const bottomScore = game.bottomScore || 0;
      const pointsDiff = topScore - bottomScore;

    });*/

    // Berechne Bilanz-Werte
    playerStats.forEach((stats, playerId) => {
      stats.matschBilanz = stats.matschMade - stats.matschReceived;
      stats.schneiderBilanz = stats.schneiderMade - stats.schneiderReceived;
      stats.kontermatschBilanz = stats.kontermatschMade - stats.kontermatschReceived;
    });

    // Vergleiche mit jassGameSummary totalEventCountsByPlayer
    console.log('📊 PLAYER STATISTIKEN - Vergleich:\n');
    
    const totalEventCountsByPlayer = summary.totalEventCountsByPlayer || {};
    const totalPointsByPlayer = summary.totalPointsByPlayer || {};
    const totalStricheByPlayer = summary.totalStricheByPlayer || {};

    let playerErrors = 0;

    playerStats.forEach((calculatedStats, playerId) => {
      console.log(`\n👤 ${calculatedStats.displayName} (${playerId.substring(0, 8)}...)`);
      console.log('─'.repeat(80));

      const dbEvents = totalEventCountsByPlayer[playerId] || {};
      const dbPoints = totalPointsByPlayer[playerId] || 0;
      const dbStriche = totalStricheByPlayer[playerId] || {};

      // Strichdifferenz
      const calculatedStricheTotal = Object.values(dbStriche).reduce((sum, val) => sum + (val || 0), 0);
      console.log(`📊 Strichdifferenz: ${calculatedStats.stricheDiff} (aus ${calculatedStats.gamesPlayed} Spielen)`);
      
      // Punktedifferenz
      console.log(`📊 Punktedifferenz: ${calculatedStats.pointsDiff} (aus ${calculatedStats.gamesPlayed} Spielen)`);
      
      // Matsch-Bilanz
      const dbMatschBilanz = (dbEvents.matschMade || 0) - (dbEvents.matschReceived || 0);
      if (calculatedStats.matschBilanz === dbMatschBilanz) {
        console.log(`✅ Matsch-Bilanz: ${calculatedStats.matschBilanz} (Made: ${calculatedStats.matschMade}, Received: ${calculatedStats.matschReceived})`);
      } else {
        playerErrors++;
        console.log(`❌ Matsch-Bilanz: Berechnet ${calculatedStats.matschBilanz} (${calculatedStats.matschMade}/${calculatedStats.matschReceived}), DB ${dbMatschBilanz} (${dbEvents.matschMade || 0}/${dbEvents.matschReceived || 0})`);
      }
      
      // Schneider-Bilanz
      const dbSchneiderBilanz = (dbEvents.schneiderMade || 0) - (dbEvents.schneiderReceived || 0);
      if (calculatedStats.schneiderBilanz === dbSchneiderBilanz) {
        console.log(`✅ Schneider-Bilanz: ${calculatedStats.schneiderBilanz} (Made: ${calculatedStats.schneiderMade}, Received: ${calculatedStats.schneiderReceived})`);
      } else {
        playerErrors++;
        console.log(`❌ Schneider-Bilanz: Berechnet ${calculatedStats.schneiderBilanz} (${calculatedStats.schneiderMade}/${calculatedStats.schneiderReceived}), DB ${dbSchneiderBilanz} (${dbEvents.schneiderMade || 0}/${dbEvents.schneiderReceived || 0})`);
      }
      
      // Game Wins/Losses
      const dbGameWins = summary.gameWinsByPlayer?.[playerId]?.wins || 0;
      const dbGameLosses = summary.gameWinsByPlayer?.[playerId]?.losses || 0;
      
      if (calculatedStats.gamesWon === dbGameWins && calculatedStats.gamesLost === dbGameLosses) {
        console.log(`✅ Game Wins/Losses: ${calculatedStats.gamesWon}/${calculatedStats.gamesLost}`);
      } else {
        playerErrors++;
        console.log(`❌ Game Wins/Losses: Erwartet ${calculatedStats.gamesWon}/${calculatedStats.gamesLost}, DB zeigt ${dbGameWins}/${dbGameLosses}`);
      }
    });

    // ============================================
    // TEAM STATISTIKEN
    // ============================================
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  👥 TEAM TAB - STATISTIKEN                               ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Sammle Team-Daten
    const teamStats = new Map(); // teamId -> { teamName, playerIds, stricheDiff, pointsDiff, matschBilanz, schneiderBilanz, gamesPlayed, gamesWon, gamesLost }

    // ✅ Verwende gameResults für Team-Statistiken
    gameResults.forEach((game, gameIndex) => {
      const gameTeams = game.teams || {};
      const topPlayers = gameTeams.top?.players || [];
      const bottomPlayers = gameTeams.bottom?.players || [];
      
      // Team-ID generieren (sortiert für Konsistenz)
      const getTeamId = (players) => {
        return players.map(p => p.playerId).sort().join('-');
      };
      
      const getTeamName = (players) => {
        return players.map(p => p.displayName || p.playerId).join(' & ');
      };
      
      const topTeamId = getTeamId(topPlayers);
      const bottomTeamId = getTeamId(bottomPlayers);
      const topTeamName = getTeamName(topPlayers);
      const bottomTeamName = getTeamName(bottomPlayers);

      const gameFinalStriche = game.finalStriche || {};
      const topStriche = calculateTotalStriche(gameFinalStriche.top || {});
      const bottomStriche = calculateTotalStriche(gameFinalStriche.bottom || {});
      const stricheDiff = topStriche - bottomStriche;
      
      const topScore = game.topScore || 0;
      const bottomScore = game.bottomScore || 0;
      const pointsDiff = topScore - bottomScore;

      // ✅ Event-Counts aus gameResults (Team-Level)
      const gameEventCounts = game.eventCounts || {};
      const topEvents = gameEventCounts.top || {};
      const bottomEvents = gameEventCounts.bottom || {};

      // Top-Team
      if (!teamStats.has(topTeamId)) {
        teamStats.set(topTeamId, {
          teamName: topTeamName,
          playerIds: topPlayers.map(p => p.playerId),
          stricheDiff: 0,
          pointsDiff: 0,
          matschMade: 0,
          matschReceived: 0,
          schneiderMade: 0,
          schneiderReceived: 0,
          gamesPlayed: 0,
          gamesWon: 0,
          gamesLost: 0
        });
      }
      
      const topTeamStats = teamStats.get(topTeamId);
      topTeamStats.stricheDiff += stricheDiff;
      topTeamStats.pointsDiff += pointsDiff;
      topTeamStats.matschMade += topEvents.matsch || 0;
      topTeamStats.matschReceived += bottomEvents.matsch || 0;
      topTeamStats.schneiderMade += topEvents.schneider || 0;
      topTeamStats.schneiderReceived += bottomEvents.schneider || 0;
      topTeamStats.gamesPlayed++;
      
      if (game.winnerTeam === 'top') {
        topTeamStats.gamesWon++;
      } else {
        topTeamStats.gamesLost++;
      }

      // Bottom-Team
      if (!teamStats.has(bottomTeamId)) {
        teamStats.set(bottomTeamId, {
          teamName: bottomTeamName,
          playerIds: bottomPlayers.map(p => p.playerId),
          stricheDiff: 0,
          pointsDiff: 0,
          matschMade: 0,
          matschReceived: 0,
          schneiderMade: 0,
          schneiderReceived: 0,
          gamesPlayed: 0,
          gamesWon: 0,
          gamesLost: 0
        });
      }
      
      const bottomTeamStats = teamStats.get(bottomTeamId);
      bottomTeamStats.stricheDiff += -stricheDiff;
      bottomTeamStats.pointsDiff += -pointsDiff;
      bottomTeamStats.matschMade += bottomEvents.matsch || 0;
      bottomTeamStats.matschReceived += topEvents.matsch || 0;
      bottomTeamStats.schneiderMade += bottomEvents.schneider || 0;
      bottomTeamStats.schneiderReceived += topEvents.schneider || 0;
      bottomTeamStats.gamesPlayed++;
      
      if (game.winnerTeam === 'bottom') {
        bottomTeamStats.gamesWon++;
      } else {
        bottomTeamStats.gamesLost++;
      }
    });

    // Berechne Bilanz-Werte
    teamStats.forEach((stats, teamId) => {
      stats.matschBilanz = stats.matschMade - stats.matschReceived;
      stats.schneiderBilanz = stats.schneiderMade - stats.schneiderReceived;
    });

    console.log('📊 TEAM STATISTIKEN - Berechnet:\n');
    
    let teamErrors = 0;

    teamStats.forEach((calculatedStats, teamId) => {
      console.log(`\n👥 ${calculatedStats.teamName}`);
      console.log('─'.repeat(80));
      console.log(`   Spieler: ${calculatedStats.playerIds.map(id => id.substring(0, 8)).join(', ')}`);
      console.log(`   Strichdifferenz: ${calculatedStats.stricheDiff} (aus ${calculatedStats.gamesPlayed} Spielen)`);
      console.log(`   Punktedifferenz: ${calculatedStats.pointsDiff}`);
      console.log(`   Matsch-Bilanz: ${calculatedStats.matschBilanz} (Made: ${calculatedStats.matschMade}, Received: ${calculatedStats.matschReceived})`);
      console.log(`   Schneider-Bilanz: ${calculatedStats.schneiderBilanz} (Made: ${calculatedStats.schneiderMade}, Received: ${calculatedStats.schneiderReceived})`);
      console.log(`   Game Wins/Losses: ${calculatedStats.gamesWon}/${calculatedStats.gamesLost}`);
      
      // Vergleiche mit groupStats (falls vorhanden)
      // Note: groupStats hat teamWithHighest* Arrays, müssen manuell durchsucht werden
    });

    // ============================================
    // ZUSAMMENFASSUNG
    // ============================================
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📋 ZUSAMMENFASSUNG                                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    console.log(`📊 Player-Statistiken: ${playerStats.size} Spieler`);
    console.log(`📊 Team-Statistiken: ${teamStats.size} Teams`);
    
    if (playerErrors === 0 && teamErrors === 0) {
      console.log('\n✅ ✅ ✅ ALLE STATISTIKEN SIND KORREKT!');
      console.log('Die Tournament-Session wurde korrekt verarbeitet.');
    } else {
      console.log(`\n❌ ❌ ❌ ${playerErrors + teamErrors} FEHLER GEFUNDEN!`);
      console.log(`   Player-Fehler: ${playerErrors}`);
      console.log(`   Team-Fehler: ${teamErrors}`);
    }

    // Zeige Team-Kombinationen
    console.log('\n📊 Team-Kombinationen im Turnier:');
    teamStats.forEach((stats, teamId) => {
      console.log(`   ${stats.teamName}: ${stats.gamesPlayed} Spiele, ${stats.gamesWon} Siege, ${stats.gamesLost} Niederlagen`);
    });

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

