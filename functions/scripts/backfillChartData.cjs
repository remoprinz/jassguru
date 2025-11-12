/**
 * ✅ BACKFILL SCRIPT: Chart-Daten Regenerieren
 * ============================================
 * 
 * Dieses Script regeneriert alle Chart-Daten für alle Gruppen:
 * - chartData_striche
 * - chartData_points
 * - chartData_matsch
 * - chartData_schneider
 * - chartData_kontermatsch
 * 
 * Wichtig: Schneiden NULL-Werte ein, wenn keine Events stattgefunden haben
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

/**
 * Helper: Berechnet eventCount-Differenz für einen Spieler in einer Session
 * Gibt NULL zurück wenn keine Events stattgefunden haben (für schneider/kontermatsch)
 */
function calculateEventDifference(sessionData, playerId, teamKey, eventType) {
  const eventCounts = sessionData.eventCounts || {};
  const playerTeamEvents = eventCounts[teamKey] || {};
  const opponentTeamEvents = eventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
  
  const playerValue = playerTeamEvents[eventType] || 0;
  const opponentValue = opponentTeamEvents[eventType] || 0;
  
  // NULL zurückgeben wenn keine Events (für schneider/kontermatsch)
  if ((eventType === 'schneider' || eventType === 'kontermatsch') && playerValue === 0 && opponentValue === 0) {
    return null;
  }
  
  return playerValue - opponentValue;
}

/**
 * Helper: Sammelt alle Spieler-IDs aus allen Sessions
 * ✅ KORREKTUR: Berücksichtigt auch Spieler aus Tournament-Sessions (totalStricheByPlayer)
 */
function collectAllPlayerIds(sessionsSnap) {
  const playerNames = new Map();
  
  sessionsSnap.docs.forEach(doc => {
    const data = doc.data();
    const sessionId = doc.id;
    const isTournament = data.isTournamentSession || sessionId === '6eNr8fnsTO06jgCqjelt';
    
    // ✅ Für Tournament-Sessions: Sammle Spieler aus totalStricheByPlayer
    if (isTournament && data.totalStricheByPlayer) {
      Object.keys(data.totalStricheByPlayer).forEach(playerId => {
        // Finde displayName (aus teams)
        const teams = data.teams || {};
        let displayName = playerId;
        
        // Suche in top
        const topPlayer = teams.top?.players?.find(p => p.playerId === playerId);
        if (topPlayer) {
          displayName = topPlayer.displayName || playerId;
        }
        
        // Suche in bottom
        const bottomPlayer = teams.bottom?.players?.find(p => p.playerId === playerId);
        if (bottomPlayer) {
          displayName = bottomPlayer.displayName || playerId;
        }
        
        // Alternativ: Suche in gameResults (falls vorhanden)
        if (displayName === playerId && data.gameResults) {
          for (const game of data.gameResults) {
            const gameTeams = game.teams || {};
            const gameTopPlayer = gameTeams.top?.players?.find(p => p.playerId === playerId);
            const gameBottomPlayer = gameTeams.bottom?.players?.find(p => p.playerId === playerId);
            
            if (gameTopPlayer) {
              displayName = gameTopPlayer.displayName || playerId;
              break;
            }
            if (gameBottomPlayer) {
              displayName = gameBottomPlayer.displayName || playerId;
              break;
            }
          }
        }
        
        playerNames.set(playerId, displayName);
      });
    } else {
      // ✅ Normale Sessions: Sammle aus teams
      const teams = data.teams || {};
      
      if (teams.top?.players) {
        teams.top.players.forEach(p => {
          playerNames.set(p.playerId, p.displayName || p.playerId);
        });
      }
      
      if (teams.bottom?.players) {
        teams.bottom.players.forEach(p => {
          playerNames.set(p.playerId, p.displayName || p.playerId);
        });
      }
    }
  });
  
  return playerNames;
}

/**
 * Berechnet Chart-Daten
 * @param isEventChart - Wenn true, werden NULL-Werte auch bei delta=0 gesetzt
 */
function calculateChartData(allSessionsSnap, calculateDelta, getTournamentDelta, tournamentRankings, isEventChart = false) {
  const labels = [];
  const allPlayerNames = collectAllPlayerIds(allSessionsSnap);
  const cumulativeValues = new Map();
  
  // Initialisiere kumulative Werte
  allPlayerNames.forEach((_, playerId) => {
    cumulativeValues.set(playerId, 0);
  });
  
  // Erstelle Datasets
  const datasets = [];
  allPlayerNames.forEach((displayName, playerId) => {
    datasets.push({
      playerId,
      label: displayName,
      displayName,
      data: []
    });
  });
  
  // Iteriere durch alle Sessions
  allSessionsSnap.docs.forEach(doc => {
    const sessionData = doc.data();
    const completedAt = sessionData.completedAt;
    if (!completedAt) return;
    
    const timestamp = completedAt.toDate ? completedAt.toDate() : new Date(completedAt._seconds * 1000);
    const dateStr = timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    labels.push(dateStr);
    
    const teams = sessionData.teams || {};
    const topPlayers = teams.top?.players || [];
    const bottomPlayers = teams.bottom?.players || [];
    
    const sessionId = doc.id;
    const isTournament = sessionData.isTournamentSession || sessionId === '6eNr8fnsTO06jgCqjelt';
    
    // Berechne Delta für jeden Spieler
    allPlayerNames.forEach((_, playerId) => {
      const dataset = datasets.find(d => d.playerId === playerId);
      const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
      const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
      
      let delta = null;
      
      if (isTournament && tournamentRankings && tournamentRankings.has(playerId)) {
        const playerRankings = tournamentRankings.get(playerId);
        const rankings = playerRankings[sessionId]; // ✅ Verwende sessionId
        if (rankings) {
          delta = getTournamentDelta(rankings, playerId);
        }
      } else if (isTopPlayer) {
        delta = calculateDelta(sessionData, playerId, 'top');
      } else if (isBottomPlayer) {
        delta = calculateDelta(sessionData, playerId, 'bottom');
      }
      
      // NULL-Werte korrekt behandeln
      if (delta === null) {
        dataset.data.push(null);
      } else if (delta === 0 && isEventChart) {
        // ✅ Für Event-Charts (Schneider/Kontermatsch): Auch bei delta=0 soll NULL gesetzt werden (kein Event!)
        dataset.data.push(null);
      } else {
        const prevValue = cumulativeValues.get(playerId) || 0;
        const newValue = prevValue + (delta || 0);
        cumulativeValues.set(playerId, newValue);
        
        if (isTopPlayer || isBottomPlayer || (isTournament && tournamentRankings?.has(playerId))) {
          dataset.data.push(newValue);
        } else {
          dataset.data.push(null);
        }
      }
    });
  });
  
  return { labels, datasets };
}

/**
 * Backfill für eine Gruppe
 */
async function backfillGroupCharts(groupId, groupName) {
  console.log(`\n📊 Processing Group: ${groupName} (${groupId})`);
  
  try {
    // 1. Lade alle Sessions
    const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc')
      .get();
    
    if (sessionsSnap.empty) {
      console.log(`⚠️  No completed sessions found for group ${groupName}`);
      return;
    }
    
    console.log(`✅ Found ${sessionsSnap.size} completed sessions`);
    
    // 2. Berechne Chart-Daten für alle 5 Charts
    const chartTypes = [
      {
        name: 'chartData_striche',
        calculateDelta: (session, playerId, teamKey) => {
          const finalStriche = session.finalStriche || {};
          const playerTeamStriche = finalStriche[teamKey] || {};
          const opponentTeamStriche = finalStriche[teamKey === 'top' ? 'bottom' : 'top'] || {};
          
          const calculateTotal = (striche) => {
            return (striche.sieg || 0) + (striche.berg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0);
          };
          
          return calculateTotal(playerTeamStriche) - calculateTotal(opponentTeamStriche);
        },
        getTournamentDelta: (rankings) => rankings.stricheDifference || 0
      },
      {
        name: 'chartData_points',
        calculateDelta: (session, playerId, teamKey) => {
          const finalScores = session.finalScores || { top: 0, bottom: 0 };
          const topScore = finalScores.top || 0;
          const bottomScore = finalScores.bottom || 0;
          
          return teamKey === 'top' ? topScore - bottomScore : bottomScore - topScore;
        },
        getTournamentDelta: (rankings) => rankings.pointsDifference || 0
      },
      {
        name: 'chartData_matsch',
        calculateDelta: (session, playerId, teamKey) => calculateEventDifference(session, playerId, teamKey, 'matsch'),
        getTournamentDelta: (rankings) => {
          const ec = rankings.eventCounts || {};
          return (ec.matschMade || 0) - (ec.matschReceived || 0);
        }
      },
      {
        name: 'chartData_schneider',
        isEventChart: true,
        calculateDelta: (session, playerId, teamKey) => calculateEventDifference(session, playerId, teamKey, 'schneider'),
        getTournamentDelta: (rankings) => {
          const ec = rankings.eventCounts || {};
          const schneiderMade = ec.schneiderMade || 0;
          const schneiderReceived = ec.schneiderReceived || 0;
          if (schneiderMade === 0 && schneiderReceived === 0) return null;
          return schneiderMade - schneiderReceived;
        }
      },
      {
        name: 'chartData_kontermatsch',
        isEventChart: true,
        calculateDelta: (session, playerId, teamKey) => calculateEventDifference(session, playerId, teamKey, 'kontermatsch'),
        getTournamentDelta: (rankings) => {
          const ec = rankings.eventCounts || {};
          const kontermatschMade = ec.kontermatschMade || 0;
          const kontermatschReceived = ec.kontermatschReceived || 0;
          if (kontermatschMade === 0 && kontermatschReceived === 0) return null;
          return kontermatschMade - kontermatschReceived;
        }
      }
    ];
    
    // 3. Lade Tournament Rankings (falls vorhanden)
    const tournamentRankings = new Map(); // SessionId -> (PlayerId -> PlayerRankings)
    const tournamentSessions = sessionsSnap.docs.filter(doc => doc.data().isTournamentSession || doc.id === '6eNr8fnsTO06jgCqjelt');
    
    if (tournamentSessions.length > 0) {
      console.log(`ℹ️  Found ${tournamentSessions.length} tournament sessions`);
      
      // ✅ KORREKTUR: Lade Tournament-Daten aus jassGameSummary
      for (const tournamentDoc of tournamentSessions) {
        const tournamentData = tournamentDoc.data();
        const sessionId = tournamentDoc.id;
        
        // Berechne Rankings aus totalStricheByPlayer, totalPointsByPlayer
        // ✅ Event-Counts werden jetzt Team-Level aus gameResults berechnet (nicht aus totalEventCountsByPlayer)
        const totalStriche = tournamentData.totalStricheByPlayer || {};
        const totalPoints = tournamentData.totalPointsByPlayer || {};
        const finalStriche = tournamentData.finalStriche || {};
        const finalScores = tournamentData.finalScores || {};
        
        // ✅ KORREKTUR: Berechne Differenzen aus gameResults (pro Spiel aggregieren)
        // Da Teams in Turnieren wechseln, müssen wir pro Spiel die Differenz berechnen
        const gameResults = tournamentData.gameResults || [];
        
        // Für jeden Spieler: Aggregiere Differenzen über alle Spiele
        Object.keys(totalStriche).forEach(playerId => {
          let stricheDifference = 0;
          let pointsDifference = 0;
          
          // Iteriere durch alle Spiele und summiere Differenzen
          gameResults.forEach(game => {
            const gameTeams = game.teams || {};
            const topPlayers = gameTeams.top?.players || [];
            const bottomPlayers = gameTeams.bottom?.players || [];
            
            const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
            const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
            
            if (!isTopPlayer && !isBottomPlayer) {
              return; // Spieler nicht in diesem Spiel
            }
            
            const teamKey = isTopPlayer ? 'top' : 'bottom';
            const opponentTeamKey = teamKey === 'top' ? 'bottom' : 'top';
            
            // Strichdifferenz für dieses Spiel
            const gameFinalStriche = game.finalStriche || {};
            const teamStriche = gameFinalStriche[teamKey] || {};
            const opponentStriche = gameFinalStriche[opponentTeamKey] || {};
            
            const calculateTotalStriche = (striche) => {
              return (striche.sieg || 0) + (striche.berg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0);
            };
            
            const teamTotal = calculateTotalStriche(teamStriche);
            const opponentTotal = calculateTotalStriche(opponentStriche);
            stricheDifference += (teamTotal - opponentTotal);
            
            // Punktedifferenz für dieses Spiel
            const teamScore = game.topScore && teamKey === 'top' ? game.topScore : (game.bottomScore || 0);
            const opponentScore = game.topScore && teamKey === 'bottom' ? game.topScore : (game.bottomScore || 0);
            
            // Korrektur: bottomScore und topScore richtig zuordnen
            const actualTeamScore = teamKey === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
            const actualOpponentScore = teamKey === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
            pointsDifference += (actualTeamScore - actualOpponentScore);
          });
          
          // ✅ KORREKTUR: Team-Level Event-Counts aus gameResults berechnen
          // (NICHT aus totalEventCountsByPlayer, da das Player-Level ist)
          let matschMade = 0;
          let matschReceived = 0;
          let schneiderMade = 0;
          let schneiderReceived = 0;
          let kontermatschMade = 0;
          let kontermatschReceived = 0;
          
          gameResults.forEach(game => {
            const gameTeams = game.teams || {};
            const topPlayers = gameTeams.top?.players || [];
            const bottomPlayers = gameTeams.bottom?.players || [];
            
            const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
            const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
            
            if (!isTopPlayer && !isBottomPlayer) {
              return; // Spieler nicht in diesem Spiel
            }
            
            const teamKey = isTopPlayer ? 'top' : 'bottom';
            const opponentTeamKey = teamKey === 'top' ? 'bottom' : 'top';
            
            // Team-Level Event-Counts aus diesem Spiel
            const gameEventCounts = game.eventCounts || {};
            const teamEvents = gameEventCounts[teamKey] || {};
            const opponentEvents = gameEventCounts[opponentTeamKey] || {};
            
            matschMade += teamEvents.matsch || 0;
            matschReceived += opponentEvents.matsch || 0;
            schneiderMade += teamEvents.schneider || 0;
            schneiderReceived += opponentEvents.schneider || 0;
            kontermatschMade += teamEvents.kontermatsch || 0;
            kontermatschReceived += opponentEvents.kontermatsch || 0;
          });
          
          const eventCounts = {
            matschMade,
            matschReceived,
            schneiderMade,
            schneiderReceived,
            kontermatschMade,
            kontermatschReceived,
          };
          
          // Speichere Rankings für diesen Spieler
          if (!tournamentRankings.has(playerId)) {
            tournamentRankings.set(playerId, {});
          }
          
          const playerRankings = tournamentRankings.get(playerId);
          playerRankings[sessionId] = {
            stricheDifference,
            pointsDifference,
            eventCounts
          };
        });
      }
      
      console.log(`✅ Loaded tournament rankings for ${tournamentRankings.size} players`);
    }
    
    // 4. Berechne und speichere jeden Chart
    for (const chartType of chartTypes) {
      const { labels, datasets } = calculateChartData(
        sessionsSnap,
        chartType.calculateDelta,
        chartType.getTournamentDelta,
        tournamentRankings,
        chartType.isEventChart || false
      );
      
      const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc(chartType.name);
      await chartDataRef.set({
        labels,
        datasets,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        totalPlayers: datasets.length,
        totalSessions: labels.length
      });
      
      console.log(`✅ Updated ${chartType.name} with ${labels.length} sessions and ${datasets.length} players`);
    }
    
    console.log(`🎉 Successfully updated all charts for group ${groupName}`);
    
  } catch (error) {
    console.error(`❌ Error processing group ${groupName}:`, error);
  }
}

/**
 * Main Function
 */
async function main() {
  console.log('\n🚀 Starting Chart Data Backfill...\n');
  
  try {
    // 1. Lade alle Gruppen
    const groupsSnap = await db.collection('groups').get();
    console.log(`✅ Found ${groupsSnap.size} groups`);
    
    // 2. Backfill für jede Gruppe
    let processed = 0;
    for (const groupDoc of groupsSnap.docs) {
      const groupData = groupDoc.data();
      await backfillGroupCharts(groupDoc.id, groupData.name || 'Unknown');
      processed++;
      
      if (processed % 10 === 0) {
        console.log(`\n📊 Progress: ${processed}/${groupsSnap.size} groups processed\n`);
      }
    }
    
    console.log(`\n🎉 ✅ Backfill completed! Processed ${processed} groups`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
