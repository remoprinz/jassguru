/**
 * 🔧 BACKFILL: Chart-Daten für EINE Gruppe (mit korrigierter Tournament-Logik)
 * 
 * Repariert die aggregated Chart-Daten für die Tournament-Session vom 11.5.2025
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

// ✅ KONFIGURATION
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ'; // Rosen10player
const DRY_RUN = false; // ✅ SCHREIBT IN DB!

/**
 * Helper: Berechnet eventCount-Differenz für einen Spieler in einer Session
 */
function calculateEventDifference(sessionData, playerId, teamKey, eventType) {
  const eventCounts = sessionData.eventCounts || {};
  const playerTeamEvents = eventCounts[teamKey] || {};
  const opponentTeamEvents = eventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
  
  const playerValue = playerTeamEvents[eventType] || 0;
  const opponentValue = opponentTeamEvents[eventType] || 0;
  
  if ((eventType === 'schneider' || eventType === 'kontermatsch') && playerValue === 0 && opponentValue === 0) {
    return null;
  }
  
  return playerValue - opponentValue;
}

/**
 * Helper: Sammelt alle Spieler-IDs aus allen Sessions
 * ✅ KORREKTUR: Berücksichtigt auch Spieler aus Tournament-Sessions
 */
function collectAllPlayerIds(sessionsSnap) {
  const playerNames = new Map();
  
  sessionsSnap.docs.forEach(doc => {
    const data = doc.data();
    const sessionId = doc.id;
    const isTournament = data.isTournamentSession || sessionId === '6eNr8fnsTO06jgCqjelt';
    
    if (isTournament && data.totalStricheByPlayer) {
      Object.keys(data.totalStricheByPlayer).forEach(playerId => {
        const teams = data.teams || {};
        let displayName = playerId;
        
        const topPlayer = teams.top?.players?.find(p => p.playerId === playerId);
        if (topPlayer) {
          displayName = topPlayer.displayName || playerId;
        }
        
        const bottomPlayer = teams.bottom?.players?.find(p => p.playerId === playerId);
        if (bottomPlayer) {
          displayName = bottomPlayer.displayName || playerId;
        }
        
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
 */
function calculateChartData(allSessionsSnap, calculateDelta, getTournamentDelta, tournamentRankings, isEventChart = false) {
  const labels = [];
  const allPlayerNames = collectAllPlayerIds(allSessionsSnap);
  const cumulativeValues = new Map();
  
  allPlayerNames.forEach((_, playerId) => {
    cumulativeValues.set(playerId, 0);
  });
  
  const datasets = [];
  allPlayerNames.forEach((displayName, playerId) => {
    datasets.push({
      playerId,
      label: displayName,
      displayName,
      data: []
    });
  });
  
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
    
    allPlayerNames.forEach((_, playerId) => {
      const dataset = datasets.find(d => d.playerId === playerId);
      const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
      const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
      
      let delta = null;
      
      if (isTournament && tournamentRankings && tournamentRankings.has(playerId)) {
        const playerRankings = tournamentRankings.get(playerId);
        const rankings = playerRankings[sessionId];
        if (rankings) {
          delta = getTournamentDelta(rankings, playerId);
        }
      } else if (isTopPlayer) {
        delta = calculateDelta(sessionData, playerId, 'top');
      } else if (isBottomPlayer) {
        delta = calculateDelta(sessionData, playerId, 'bottom');
      }
      
      if (delta === null) {
        dataset.data.push(null);
      } else if (delta === 0 && isEventChart) {
        dataset.data.push(null);
      } else {
        const prevValue = cumulativeValues.get(playerId) || 0;
        const newValue = prevValue + (delta || 0);
        cumulativeValues.set(playerId, newValue);
        
        // ✅ KORREKTUR: Für Tournament-Spieler IMMER Wert setzen, auch wenn nicht in root teams
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
    const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc')
      .get();
    
    if (sessionsSnap.empty) {
      console.log(`⚠️  No completed sessions found`);
      return;
    }
    
    console.log(`✅ Found ${sessionsSnap.size} completed sessions`);
    
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
    
    // ✅ Lade Tournament Rankings
    const tournamentRankings = new Map();
    const tournamentSessions = sessionsSnap.docs.filter(doc => doc.data().isTournamentSession || doc.id === '6eNr8fnsTO06jgCqjelt');
    
    if (tournamentSessions.length > 0) {
      console.log(`ℹ️  Found ${tournamentSessions.length} tournament sessions`);
      
      for (const tournamentDoc of tournamentSessions) {
        const tournamentData = tournamentDoc.data();
        const sessionId = tournamentDoc.id;
        
        const totalStriche = tournamentData.totalStricheByPlayer || {};
        const totalEvents = tournamentData.totalEventCountsByPlayer || {};
        const gameResults = tournamentData.gameResults || [];
        
        Object.keys(totalStriche).forEach(playerId => {
          const playerEvents = totalEvents[playerId] || {};
          
          let stricheDifference = 0;
          let pointsDifference = 0;
          
          // ✅ Iteriere durch alle Spiele und summiere Differenzen
          gameResults.forEach(game => {
            const gameTeams = game.teams || {};
            const topPlayers = gameTeams.top?.players || [];
            const bottomPlayers = gameTeams.bottom?.players || [];
            
            const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
            const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
            
            if (!isTopPlayer && !isBottomPlayer) return;
            
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
            const actualTeamScore = teamKey === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
            const actualOpponentScore = teamKey === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
            pointsDifference += (actualTeamScore - actualOpponentScore);
          });
          
          // Event-Counts
          const eventCounts = {
            matschMade: playerEvents.matschMade || 0,
            matschReceived: playerEvents.matschReceived || 0,
            schneiderMade: playerEvents.schneiderMade || 0,
            schneiderReceived: playerEvents.schneiderReceived || 0,
            kontermatschMade: playerEvents.kontermatschMade || 0,
            kontermatschReceived: playerEvents.kontermatschReceived || 0,
          };
          
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
      
      // Ausgabe zur Kontrolle
      console.log('\n📊 Tournament Player Rankings:');
      tournamentRankings.forEach((rankings, playerId) => {
        Object.entries(rankings).forEach(([sessionId, data]) => {
          console.log(`   ${playerId.substring(0, 8)}... → Striche: ${data.stricheDifference}, Punkte: ${data.pointsDifference}`);
        });
      });
    }
    
    // Berechne und speichere jeden Chart
    for (const chartType of chartTypes) {
      const { labels, datasets } = calculateChartData(
        sessionsSnap,
        chartType.calculateDelta,
        chartType.getTournamentDelta,
        tournamentRankings,
        chartType.isEventChart || false
      );
      
      console.log(`\n📈 ${chartType.name}:`);
      console.log(`   - Labels: ${labels.length}`);
      console.log(`   - Players: ${datasets.length}`);
      
      // Zeige Tournament-Spieler Werte
      const tournamentPlayerIds = Array.from(tournamentRankings.keys());
      if (tournamentPlayerIds.length > 0) {
        console.log('   - Tournament-Spieler Werte (Index 1 = 11.05.25):');
        tournamentPlayerIds.forEach(playerId => {
          const dataset = datasets.find(d => d.playerId === playerId);
          if (dataset && dataset.data.length > 1) {
            console.log(`     ${dataset.label}: ${dataset.data[1]}`);
          }
        });
      }
      
      if (!DRY_RUN) {
        const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc(chartType.name);
        await chartDataRef.set({
          labels,
          datasets,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          totalPlayers: datasets.length,
          totalSessions: labels.length
        });
        console.log(`✅ Updated ${chartType.name}`);
      } else {
        console.log(`⚠️  DRY RUN: Would update ${chartType.name}`);
      }
    }
    
    console.log(`\n🎉 ${DRY_RUN ? 'Dry Run' : 'Successfully updated'} all charts for group ${groupName}`);
    
  } catch (error) {
    console.error(`❌ Error:`, error);
    throw error;
  }
}

/**
 * Main
 */
async function main() {
  console.log('\n🔧 BACKFILL: Chart-Daten für EINE Gruppe\n');
  console.log(`Group ID: ${GROUP_ID}`);
  console.log(`Dry Run: ${DRY_RUN ? 'JA (keine Schreiboperationen)' : 'NEIN (schreibt in DB)'}\n`);
  
  try {
    const groupDoc = await db.collection('groups').doc(GROUP_ID).get();
    if (!groupDoc.exists) {
      console.error('❌ Gruppe nicht gefunden!');
      return;
    }
    
    const groupData = groupDoc.data();
    await backfillGroupCharts(GROUP_ID, groupData.name || 'Unknown');
    
    console.log(`\n🎉 ✅ Backfill abgeschlossen!`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

