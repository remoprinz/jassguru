/**
 * 🔍 ANALYSE: Event-Counts Berechnung
 * 
 * Analysiert wie totalEventCountsByPlayer berechnet wird
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
  console.log('║  🔍 ANALYSE: Event-Counts Berechnung                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Lade jassGameSummary
    const summaryDoc = await db
      .collection('groups')
      .doc(GROUP_ID)
      .collection('jassGameSummaries')
      .doc(JASS_GAME_SUMMARY_ID)
      .get();

    const summary = summaryDoc.data();
    const gameResults = summary.gameResults || [];
    const totalEventCountsByPlayer = summary.totalEventCountsByPlayer || {};

    console.log('📊 DB totalEventCountsByPlayer:\n');
    Object.entries(totalEventCountsByPlayer).forEach(([playerId, events]) => {
      const matschBilanz = (events.matschMade || 0) - (events.matschReceived || 0);
      const schneiderBilanz = (events.schneiderMade || 0) - (events.schneiderReceived || 0);
      console.log(`${playerId.substring(0, 8)}...: Matsch ${matschBilanz} (${events.matschMade || 0}/${events.matschReceived || 0}), Schneider ${schneiderBilanz} (${events.schneiderMade || 0}/${events.schneiderReceived || 0})`);
    });

    console.log('\n\n📊 Manuell berechnet (pro Spiel):\n');
    
    const playerEvents = new Map();
    
    gameResults.forEach((game, gameIndex) => {
      const gameTeams = game.teams || {};
      const topPlayers = gameTeams.top?.players || [];
      const bottomPlayers = gameTeams.bottom?.players || [];
      
      const gameEventCounts = game.eventCounts || {};
      const topEvents = gameEventCounts.top || {};
      const bottomEvents = gameEventCounts.bottom || {};

      console.log(`\n🎮 Spiel ${game.gameNumber || (gameIndex + 1)}:`);
      console.log(`   Top: Matsch ${topEvents.matsch || 0}, Schneider ${topEvents.schneider || 0}`);
      console.log(`   Bottom: Matsch ${bottomEvents.matsch || 0}, Schneider ${bottomEvents.schneider || 0}`);

      // Top-Spieler
      topPlayers.forEach(player => {
        const playerId = player.playerId;
        if (!playerEvents.has(playerId)) {
          playerEvents.set(playerId, {
            displayName: player.displayName || playerId,
            matschMade: 0,
            matschReceived: 0,
            schneiderMade: 0,
            schneiderReceived: 0
          });
        }
        
        const events = playerEvents.get(playerId);
        events.matschMade += topEvents.matsch || 0;
        events.matschReceived += bottomEvents.matsch || 0;
        events.schneiderMade += topEvents.schneider || 0;
        events.schneiderReceived += bottomEvents.schneider || 0;
      });

      // Bottom-Spieler
      bottomPlayers.forEach(player => {
        const playerId = player.playerId;
        if (!playerEvents.has(playerId)) {
          playerEvents.set(playerId, {
            displayName: player.displayName || playerId,
            matschMade: 0,
            matschReceived: 0,
            schneiderMade: 0,
            schneiderReceived: 0
          });
        }
        
        const events = playerEvents.get(playerId);
        events.matschMade += bottomEvents.matsch || 0;
        events.matschReceived += topEvents.matsch || 0;
        events.schneiderMade += bottomEvents.schneider || 0;
        events.schneiderReceived += topEvents.schneider || 0;
      });
    });

    console.log('\n\n📊 Vergleich:\n');
    
    playerEvents.forEach((calculatedEvents, playerId) => {
      const dbEvents = totalEventCountsByPlayer[playerId] || {};
      
      const calculatedMatschBilanz = calculatedEvents.matschMade - calculatedEvents.matschReceived;
      const dbMatschBilanz = (dbEvents.matschMade || 0) - (dbEvents.matschReceived || 0);
      
      const calculatedSchneiderBilanz = calculatedEvents.schneiderMade - calculatedEvents.schneiderReceived;
      const dbSchneiderBilanz = (dbEvents.schneiderMade || 0) - (dbEvents.schneiderReceived || 0);
      
      console.log(`\n👤 ${calculatedEvents.displayName}:`);
      console.log(`   Matsch: Berechnet ${calculatedMatschBilanz} (${calculatedEvents.matschMade}/${calculatedEvents.matschReceived}), DB ${dbMatschBilanz} (${dbEvents.matschMade || 0}/${dbEvents.matschReceived || 0})`);
      console.log(`   Schneider: Berechnet ${calculatedSchneiderBilanz} (${calculatedEvents.schneiderMade}/${calculatedEvents.schneiderReceived}), DB ${dbSchneiderBilanz} (${dbEvents.schneiderMade || 0}/${dbEvents.schneiderReceived || 0})`);
      
      if (calculatedMatschBilanz !== dbMatschBilanz || calculatedSchneiderBilanz !== dbSchneiderBilanz) {
        console.log(`   ❌ UNTERSCHIED!`);
      } else {
        console.log(`   ✅ ÜBEREINSTIMMUNG!`);
      }
    });

    console.log('\n🎉 Analyse abgeschlossen!');

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

