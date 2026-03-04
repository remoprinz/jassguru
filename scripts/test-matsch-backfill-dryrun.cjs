/**
 * 🔍 DRY RUN: Matsch-Chart Backfill Test
 * 
 * Testet das Backfill für Matsch-Chart-Daten
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
const DRY_RUN = true;

function calculateTotalStriche(striche) {
  return (striche.sieg || 0) + (striche.berg || 0) + (striche.matsch || 0) + 
         (striche.schneider || 0) + (striche.kontermatsch || 0);
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔍 DRY RUN: Matsch-Chart Backfill                        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`Group ID: ${GROUP_ID}`);
  console.log(`Dry Run: ${DRY_RUN ? 'JA (schreibt NICHT in DB)' : 'NEIN (schreibt in DB)'}\n`);

  try {
    // 1. Lade alle completed Sessions
    const sessionsSnap = await db
      .collection(`groups/${GROUP_ID}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc')
      .get();

    console.log(`✅ Found ${sessionsSnap.docs.length} completed sessions\n`);

    // 2. Lade Tournament-Rankings
    const tournamentSessions = sessionsSnap.docs.filter(doc => doc.data().isTournamentSession || doc.id === '6eNr8fnsTO06jgCqjelt');
    const tournamentRankings = new Map();

    console.log(`ℹ️  Found ${tournamentSessions.length} tournament sessions`);

    for (const tournamentDoc of tournamentSessions) {
      const tournamentData = tournamentDoc.data();
      const sessionId = tournamentDoc.id;
      
      const totalEvents = tournamentData.totalEventCountsByPlayer || {};
      const gameResults = tournamentData.gameResults || [];
      
      console.log(`\n📊 Tournament Session: ${tournamentData.tournamentName || sessionId.substring(0, 8)}`);
      
      // Für jeden Spieler
      Object.keys(totalEvents).forEach(playerId => {
        const playerEvents = totalEvents[playerId] || {};
        
        // Berechne Differenzen
        let stricheDifference = 0;
        let pointsDifference = 0;
        
        gameResults.forEach(game => {
          const gameTeams = game.teams || {};
          const topPlayers = gameTeams.top?.players || [];
          const bottomPlayers = gameTeams.bottom?.players || [];
          
          const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
          const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
          
          if (!isTopPlayer && !isBottomPlayer) return;
          
          const teamKey = isTopPlayer ? 'top' : 'bottom';
          const opponentTeamKey = teamKey === 'top' ? 'bottom' : 'top';
          
          // Strichdifferenz
          const gameFinalStriche = game.finalStriche || {};
          const teamStriche = gameFinalStriche[teamKey] || {};
          const opponentStriche = gameFinalStriche[opponentTeamKey] || {};
          
          const teamTotal = calculateTotalStriche(teamStriche);
          const opponentTotal = calculateTotalStriche(opponentStriche);
          stricheDifference += (teamTotal - opponentTotal);
          
          // Punktedifferenz
          const actualTeamScore = teamKey === 'top' ? (game.topScore || 0) : (game.bottomScore || 0);
          const actualOpponentScore = teamKey === 'top' ? (game.bottomScore || 0) : (game.topScore || 0);
          pointsDifference += (actualTeamScore - actualOpponentScore);
        });
        
        // Event-Counts
        const matschBilanz = (playerEvents.matschMade || 0) - (playerEvents.matschReceived || 0);
        const schneiderBilanz = (playerEvents.schneiderMade || 0) - (playerEvents.schneiderReceived || 0);
        
        console.log(`   ${playerId.substring(0, 8)}: Matsch ${matschBilanz} (${playerEvents.matschMade || 0}/${playerEvents.matschReceived || 0})`);
        
        // Speichere Rankings
        if (!tournamentRankings.has(playerId)) {
          tournamentRankings.set(playerId, {});
        }
        
        tournamentRankings.get(playerId)[sessionId] = {
          stricheDifference,
          pointsDifference,
          eventCounts: {
            matschMade: playerEvents.matschMade || 0,
            matschReceived: playerEvents.matschReceived || 0,
            schneiderMade: playerEvents.schneiderMade || 0,
            schneiderReceived: playerEvents.schneiderReceived || 0
          }
        };
      });
    }

    // 3. Berechne Chart-Daten
    console.log('\n\n📊 Berechne Matsch-Chart-Daten...\n');

    const labels = [];
    const allPlayerNames = new Map();
    const cumulativeValues = new Map();
    
    // Sammle Spieler-Namen
    sessionsSnap.docs.forEach(doc => {
      const data = doc.data();
      const teams = data.teams || {};
      
      ['top', 'bottom'].forEach(teamKey => {
        const players = teams[teamKey]?.players || [];
        players.forEach(p => {
          allPlayerNames.set(p.playerId, p.displayName || p.playerId);
        });
      });
      
      // Für Turniere: Auch Spieler aus totalStricheByPlayer
      if (data.isTournamentSession || doc.id === '6eNr8fnsTO06jgCqjelt') {
        const totalStriche = data.totalStricheByPlayer || {};
        Object.keys(totalStriche).forEach(playerId => {
          if (!allPlayerNames.has(playerId)) {
            // Finde displayName aus teams oder gameResults
            const gameResults = data.gameResults || [];
            for (const game of gameResults) {
              const gameTeams = game.teams || {};
              const allPlayers = [
                ...(gameTeams.top?.players || []),
                ...(gameTeams.bottom?.players || [])
              ];
              const player = allPlayers.find(p => p.playerId === playerId);
              if (player) {
                allPlayerNames.set(playerId, player.displayName || playerId);
                break;
              }
            }
          }
        });
      }
    });

    // Initialisiere Datasets
    const datasets = [];
    allPlayerNames.forEach((displayName, playerId) => {
      datasets.push({
        label: displayName,
        displayName: displayName,
        playerId: playerId,
        data: []
      });
    });

    // Iteriere durch Sessions
    sessionsSnap.docs.forEach((doc, sessionIndex) => {
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
      
      // Für jeden Spieler
      allPlayerNames.forEach((_, playerId) => {
        const dataset = datasets.find(d => d.playerId === playerId);
        const isTopPlayer = topPlayers.some(p => p.playerId === playerId);
        const isBottomPlayer = bottomPlayers.some(p => p.playerId === playerId);
        
        let delta = null;
        
        if (isTournament && tournamentRankings.has(playerId)) {
          const playerRankings = tournamentRankings.get(playerId);
          if (playerRankings[sessionId]) {
            const ec = playerRankings[sessionId].eventCounts || {};
            delta = (ec.matschMade || 0) - (ec.matschReceived || 0);
          }
        } else if (isTopPlayer) {
          const eventCounts = sessionData.eventCounts || {};
          const teamEvents = eventCounts.top || {};
          const opponentEvents = eventCounts.bottom || {};
          delta = (teamEvents.matsch || 0) - (opponentEvents.matsch || 0);
        } else if (isBottomPlayer) {
          const eventCounts = sessionData.eventCounts || {};
          const teamEvents = eventCounts.bottom || {};
          const opponentEvents = eventCounts.top || {};
          delta = (teamEvents.matsch || 0) - (opponentEvents.matsch || 0);
        }
        
        if (delta !== null) {
          const prevValue = cumulativeValues.get(playerId) || 0;
          const newValue = prevValue + delta;
          cumulativeValues.set(playerId, newValue);
          
          if (isTopPlayer || isBottomPlayer || (isTournament && tournamentRankings.has(playerId))) {
            dataset.data.push(newValue);
          } else {
            dataset.data.push(null);
          }
        } else {
          dataset.data.push(null);
        }
      });
    });

    // Zeige Tournament-Session Werte
    console.log('📊 Werte für Tournament-Session (Index 1 = 11.05.25):\n');
    
    datasets.forEach(dataset => {
      if (dataset.data[1] !== null) {
        console.log(`   ${dataset.label}: ${dataset.data[1]}`);
      }
    });

    console.log('\n🎉 Dry Run abgeschlossen!');

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

