/**
 * ✅ BACKFILL SCRIPT: Nur Matsch-Chart-Daten
 * ============================================
 * 
 * Dieses Script regeneriert NUR die chartData_matsch für alle Gruppen.
 * Verwendet Team-Level Event-Counts (korrekt für Turniere).
 * 
 * Usage:
 *   node scripts/backfill-matsch-only.cjs [--dry-run] [--group GROUP_ID]
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const GROUP_ID_ARG = args.find(arg => arg.startsWith('--group='));
const SPECIFIC_GROUP_ID = GROUP_ID_ARG ? GROUP_ID_ARG.split('=')[1] : null;

/**
 * Helper: Berechnet Team-Level Matsch-Differenz für einen Spieler in einer Session
 */
function calculateMatschDifference(sessionData, playerId, teamKey) {
  const eventCounts = sessionData.eventCounts || {};
  const playerTeamEvents = eventCounts[teamKey] || {};
  const opponentTeamEvents = eventCounts[teamKey === 'top' ? 'bottom' : 'top'] || {};
  
  const playerValue = playerTeamEvents.matsch || 0;
  const opponentValue = opponentTeamEvents.matsch || 0;
  
  return playerValue - opponentValue;
}

/**
 * Helper: Sammelt alle Spieler-IDs aus allen Sessions
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
 * Berechnet Matsch-Chart-Daten
 */
function calculateMatschChartData(allSessionsSnap, tournamentRankings) {
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
        const rankings = playerRankings[sessionId];
        if (rankings) {
          const ec = rankings.eventCounts || {};
          delta = (ec.matschMade || 0) - (ec.matschReceived || 0);
        }
      } else if (isTopPlayer) {
        delta = calculateMatschDifference(sessionData, playerId, 'top');
      } else if (isBottomPlayer) {
        delta = calculateMatschDifference(sessionData, playerId, 'bottom');
      }
      
      // NULL-Werte korrekt behandeln
      if (delta === null) {
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
async function backfillGroupMatschChart(groupId, groupName) {
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
    
    // 2. Lade Tournament Rankings (falls vorhanden)
    const tournamentRankings = new Map(); // PlayerId -> (SessionId -> PlayerRankings)
    const tournamentSessions = sessionsSnap.docs.filter(doc => doc.data().isTournamentSession || doc.id === '6eNr8fnsTO06jgCqjelt');
    
    if (tournamentSessions.length > 0) {
      console.log(`ℹ️  Found ${tournamentSessions.length} tournament sessions`);
      
      // ✅ KORREKTUR: Lade Tournament-Daten aus jassGameSummary
      // ✅ Verwende Team-Level Event-Counts aus gameResults (NICHT totalEventCountsByPlayer)
      for (const tournamentDoc of tournamentSessions) {
        const tournamentData = tournamentDoc.data();
        const sessionId = tournamentDoc.id;
        
        const totalStriche = tournamentData.totalStricheByPlayer || {};
        const gameResults = tournamentData.gameResults || [];
        
        // Für jeden Spieler: Aggregiere Differenzen über alle Spiele
        Object.keys(totalStriche).forEach(playerId => {
          let stricheDifference = 0;
          let pointsDifference = 0;
          
          // ✅ Team-Level Event-Counts aus gameResults berechnen
          let matschMade = 0;
          let matschReceived = 0;
          
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
            const actualTeamScore = teamKey === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
            const actualOpponentScore = teamKey === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
            pointsDifference += (actualTeamScore - actualOpponentScore);
            
            // ✅ Team-Level Event-Counts aus diesem Spiel
            const gameEventCounts = game.eventCounts || {};
            const teamEvents = gameEventCounts[teamKey] || {};
            const opponentEvents = gameEventCounts[opponentTeamKey] || {};
            
            matschMade += teamEvents.matsch || 0;
            matschReceived += opponentEvents.matsch || 0;
          });
          
          const eventCounts = {
            matschMade,
            matschReceived,
            // Für Matsch-Backfill brauchen wir nur matsch, aber speichern wir trotzdem alle für Konsistenz
            schneiderMade: 0,
            schneiderReceived: 0,
            kontermatschMade: 0,
            kontermatschReceived: 0,
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
    
    // 3. Berechne Matsch-Chart-Daten
    const { labels, datasets } = calculateMatschChartData(sessionsSnap, tournamentRankings);
    
    if (DRY_RUN) {
      console.log(`\n🔍 DRY RUN - Würde folgende Daten schreiben:`);
      console.log(`   Labels: ${labels.length} sessions`);
      console.log(`   Datasets: ${datasets.length} players`);
      
      // Zeige einige Beispielwerte für die Tournament-Session
      const tournamentSessionIndex = labels.findIndex((_, idx) => {
        const doc = sessionsSnap.docs[idx];
        return doc && (doc.data().isTournamentSession || doc.id === '6eNr8fnsTO06jgCqjelt');
      });
      
      if (tournamentSessionIndex >= 0) {
        console.log(`\n📊 Kumulative Werte für Tournament-Session (Index ${tournamentSessionIndex}):`);
        datasets.forEach(dataset => {
          if (dataset.data[tournamentSessionIndex] !== null && dataset.data[tournamentSessionIndex] !== undefined) {
            console.log(`   ${dataset.label}: ${dataset.data[tournamentSessionIndex]}`);
          }
        });
        
        // Zeige auch die Delta-Werte für die Tournament-Session
        console.log(`\n📊 Delta-Werte für Tournament-Session (nur diese Session):`);
        const tournamentDoc = sessionsSnap.docs[tournamentSessionIndex];
        const sessionId = tournamentDoc.id;
        
        if (tournamentRankings.size > 0) {
          tournamentRankings.forEach((playerRankings, playerId) => {
            const rankings = playerRankings[sessionId];
            if (rankings) {
              const ec = rankings.eventCounts || {};
              const delta = (ec.matschMade || 0) - (ec.matschReceived || 0);
              const dataset = datasets.find(d => d.playerId === playerId);
              const playerName = dataset ? dataset.label : playerId;
              console.log(`   ${playerName}: ${delta} (Made: ${ec.matschMade || 0}, Received: ${ec.matschReceived || 0})`);
            }
          });
        }
      }
    } else {
      // 4. Speichere Chart-Daten
      const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc('chartData_matsch');
      await chartDataRef.set({
        labels,
        datasets,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        totalPlayers: datasets.length,
        totalSessions: labels.length
      });
      
      console.log(`✅ Updated chartData_matsch with ${labels.length} sessions and ${datasets.length} players`);
    }
    
    console.log(`🎉 Successfully ${DRY_RUN ? 'validated' : 'updated'} Matsch chart for group ${groupName}`);
    
  } catch (error) {
    console.error(`❌ Error processing group ${groupName}:`, error);
  }
}

/**
 * Main Function
 */
async function main() {
  console.log('\n🚀 Starting Matsch Chart Data Backfill...\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no database writes)' : '✍️  WRITE MODE (will update database)'}`);
  if (SPECIFIC_GROUP_ID) {
    console.log(`Target: Single group (${SPECIFIC_GROUP_ID})`);
  } else {
    console.log(`Target: All groups`);
  }
  console.log();
  
  try {
    let groupsSnap;
    
    if (SPECIFIC_GROUP_ID) {
      // Nur eine spezifische Gruppe
      const groupDoc = await db.collection('groups').doc(SPECIFIC_GROUP_ID).get();
      if (!groupDoc.exists) {
        console.error(`❌ Group ${SPECIFIC_GROUP_ID} not found!`);
        process.exit(1);
      }
      groupsSnap = { docs: [groupDoc], size: 1 };
    } else {
      // Alle Gruppen
      groupsSnap = await db.collection('groups').get();
    }
    
    console.log(`✅ Found ${groupsSnap.size} group(s)`);
    
    // Backfill für jede Gruppe
    let processed = 0;
    for (const groupDoc of groupsSnap.docs) {
      const groupData = groupDoc.data();
      await backfillGroupMatschChart(groupDoc.id, groupData.name || 'Unknown');
      processed++;
      
      if (processed % 10 === 0) {
        console.log(`\n📊 Progress: ${processed}/${groupsSnap.size} groups processed\n`);
      }
    }
    
    console.log(`\n🎉 ✅ Backfill completed! Processed ${processed} group(s)`);
    if (DRY_RUN) {
      console.log(`\n⚠️  This was a DRY RUN. No data was written to the database.`);
      console.log(`   Run without --dry-run to actually update the database.`);
    }
    
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

