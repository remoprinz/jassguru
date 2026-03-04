/**
 * ✅ KORREKTE Matsch-Berechnung: Team-Level statt Player-Level
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

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ KORREKTE Matsch-Berechnung                            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    const summaryDoc = await db
      .collection('groups')
      .doc(GROUP_ID)
      .collection('jassGameSummaries')
      .doc(JASS_GAME_SUMMARY_ID)
      .get();

    const summary = summaryDoc.data();
    const gameResults = summary.gameResults || [];

    console.log('📊 TEAM-LEVEL Event-Counts (korrekt für Charts):\n');

    const playerTeamEvents = new Map();

    gameResults.forEach((game, gameIndex) => {
      const gameTeams = game.teams || {};
      const topPlayers = gameTeams.top?.players || [];
      const bottomPlayers = gameTeams.bottom?.players || [];
      
      const gameEventCounts = game.eventCounts || {};
      const topEvents = gameEventCounts.top || {};
      const bottomEvents = gameEventCounts.bottom || {};
      
      console.log(`Spiel ${game.gameNumber}:`);
      console.log(`  Top (${topPlayers.map(p => p.displayName).join(' & ')}): ${topEvents.matsch || 0} Matsch`);
      console.log(`  Bottom (${bottomPlayers.map(p => p.displayName).join(' & ')}): ${bottomEvents.matsch || 0} Matsch`);

      // Top-Spieler
      topPlayers.forEach(player => {
        const playerId = player.playerId;
        if (!playerTeamEvents.has(playerId)) {
          playerTeamEvents.set(playerId, {
            displayName: player.displayName,
            matschMade: 0,
            matschReceived: 0,
            details: []
          });
        }
        
        const stats = playerTeamEvents.get(playerId);
        const delta = (topEvents.matsch || 0) - (bottomEvents.matsch || 0);
        stats.matschMade += topEvents.matsch || 0;
        stats.matschReceived += bottomEvents.matsch || 0;
        stats.details.push({
          game: game.gameNumber,
          team: 'top',
          made: topEvents.matsch || 0,
          received: bottomEvents.matsch || 0,
          delta
        });
      });

      // Bottom-Spieler
      bottomPlayers.forEach(player => {
        const playerId = player.playerId;
        if (!playerTeamEvents.has(playerId)) {
          playerTeamEvents.set(playerId, {
            displayName: player.displayName,
            matschMade: 0,
            matschReceived: 0,
            details: []
          });
        }
        
        const stats = playerTeamEvents.get(playerId);
        const delta = (bottomEvents.matsch || 0) - (topEvents.matsch || 0);
        stats.matschMade += bottomEvents.matsch || 0;
        stats.matschReceived += topEvents.matsch || 0;
        stats.details.push({
          game: game.gameNumber,
          team: 'bottom',
          made: bottomEvents.matsch || 0,
          received: topEvents.matsch || 0,
          delta
        });
      });
    });

    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 TEAM-LEVEL Matsch-Bilanz (KORREKT)                    ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    playerTeamEvents.forEach((stats, playerId) => {
      const bilanz = stats.matschMade - stats.matschReceived;
      console.log(`${stats.displayName}:`);
      console.log(`  Bilanz: ${bilanz} (Made: ${stats.matschMade}, Received: ${stats.matschReceived})`);
      console.log(`  Spiele: ${stats.details.length}`);
      
      // Zeige alle Spiele
      console.log(`  Details:`);
      stats.details.forEach(detail => {
        console.log(`    Spiel ${detail.game} (${detail.team}): Made ${detail.made}, Received ${detail.received}, Delta ${detail.delta}`);
      });
      console.log();
    });

    // Vergleich mit Player-Level
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 VERGLEICH: Team-Level vs. Player-Level                ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const totalEventCountsByPlayer = summary.totalEventCountsByPlayer || {};

    playerTeamEvents.forEach((teamStats, playerId) => {
      const playerEvents = totalEventCountsByPlayer[playerId] || {};
      const teamBilanz = teamStats.matschMade - teamStats.matschReceived;
      const playerBilanz = (playerEvents.matschMade || 0) - (playerEvents.matschReceived || 0);
      
      console.log(`${teamStats.displayName}:`);
      console.log(`  Team-Level (KORREKT für Charts): ${teamBilanz} (${teamStats.matschMade}/${teamStats.matschReceived})`);
      console.log(`  Player-Level (FALSCH für Charts): ${playerBilanz} (${playerEvents.matschMade || 0}/${playerEvents.matschReceived || 0})`);
      console.log(`  Unterschied: ${teamBilanz - playerBilanz}`);
      console.log();
    });

    console.log('🎉 Analyse abgeschlossen!');

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

