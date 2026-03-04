/**
 * 🔍 PRÜFE: Team-Matsch-Statistiken in groupStats
 * 
 * Warum zeigen Teams (0/0) aber trotzdem eine Matsch-Bilanz?
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
  console.log('║  🔍 PRÜFE: Team-Matsch-Statistiken                        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Lade jassGameSummary
    const summaryDoc = await db
      .collection('groups')
      .doc(GROUP_ID)
      .collection('jassGameSummaries')
      .doc(JASS_GAME_SUMMARY_ID)
      .get();

    const summary = summaryDoc.data();
    const gameResults = summary.gameResults || [];

    // 2. Lade aggregated/chartData_matsch
    const matschChartDoc = await db
      .doc(`groups/${GROUP_ID}/aggregated/chartData_matsch`)
      .get();

    if (!matschChartDoc.exists) {
      console.log('❌ chartData_matsch nicht gefunden!');
      return;
    }

    const matschChartData = matschChartDoc.data();
    
    // Finde Tournament-Session Index
    const tournamentDate = summary.completedAt?.toDate?.()?.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const tournamentIndex = matschChartData.labels.findIndex(label => label === tournamentDate);

    console.log(`📊 Tournament-Session: ${tournamentDate} (Index ${tournamentIndex})\n`);

    // 3. Prüfe Chart-Daten für alle Spieler
    console.log('📊 CHART-DATEN (chartData_matsch):');
    console.log('─'.repeat(80));

    matschChartData.datasets.forEach(dataset => {
      const value = dataset.data[tournamentIndex];
      const prevValue = tournamentIndex > 0 ? dataset.data[tournamentIndex - 1] : 0;
      const delta = value !== null ? value - (prevValue || 0) : null;
      
      console.log(`${dataset.label}: ${value} (Delta: ${delta})`);
    });

    // 4. Lade groupStats
    const groupDoc = await db.collection('groups').doc(GROUP_ID).get();
    const groupStats = groupDoc.data();

    console.log('\n\n📊 GROUPSTATS - Team-Matsch-Bilanz:');
    console.log('─'.repeat(80));

    const teamMatschData = groupStats?.teamWithHighestMatschBilanz || groupStats?.teamWithHighestMatschRate || [];
    
    if (teamMatschData.length === 0) {
      console.log('⚠️  Keine Team-Matsch-Daten in groupStats!');
    } else {
      teamMatschData.forEach(team => {
        console.log(`\n${team.names.join(' & ')}:`);
        console.log(`  Bilanz: ${team.value}`);
        console.log(`  Made: ${team.eventsMade || 0}`);
        console.log(`  Received: ${team.eventsReceived || 0}`);
        console.log(`  Games Played: ${team.eventsPlayed || 0}`);
      });
    }

    // 5. Berechne Team-Matsch-Bilanz aus gameResults (Team-Level)
    console.log('\n\n📊 TEAM-LEVEL EVENT-COUNTS aus gameResults:');
    console.log('─'.repeat(80));

    const teamStatsFromGameResults = new Map();

    gameResults.forEach(game => {
      const gameTeams = game.teams || {};
      const topPlayers = gameTeams.top?.players || [];
      const bottomPlayers = gameTeams.bottom?.players || [];
      
      const getTeamId = (players) => players.map(p => p.playerId).sort().join('-');
      const getTeamName = (players) => players.map(p => p.displayName || p.playerId).join(' & ');
      
      const topTeamId = getTeamId(topPlayers);
      const bottomTeamId = getTeamId(bottomPlayers);
      const topTeamName = getTeamName(topPlayers);
      const bottomTeamName = getTeamName(bottomPlayers);

      const gameEventCounts = game.eventCounts || {};
      const topEvents = gameEventCounts.top || {};
      const bottomEvents = gameEventCounts.bottom || {};

      // Top-Team
      if (!teamStatsFromGameResults.has(topTeamId)) {
        teamStatsFromGameResults.set(topTeamId, {
          teamName: topTeamName,
          matschMade: 0,
          matschReceived: 0,
          gamesPlayed: 0
        });
      }
      const topStats = teamStatsFromGameResults.get(topTeamId);
      topStats.matschMade += topEvents.matsch || 0;
      topStats.matschReceived += bottomEvents.matsch || 0;
      topStats.gamesPlayed++;

      // Bottom-Team
      if (!teamStatsFromGameResults.has(bottomTeamId)) {
        teamStatsFromGameResults.set(bottomTeamId, {
          teamName: bottomTeamName,
          matschMade: 0,
          matschReceived: 0,
          gamesPlayed: 0
        });
      }
      const bottomStats = teamStatsFromGameResults.get(bottomTeamId);
      bottomStats.matschMade += bottomEvents.matsch || 0;
      bottomStats.matschReceived += topEvents.matsch || 0;
      bottomStats.gamesPlayed++;
    });

    teamStatsFromGameResults.forEach((stats, teamId) => {
      const bilanz = stats.matschMade - stats.matschReceived;
      console.log(`\n${stats.teamName}:`);
      console.log(`  Bilanz: ${bilanz}`);
      console.log(`  Made: ${stats.matschMade}`);
      console.log(`  Received: ${stats.matschReceived}`);
      console.log(`  Games: ${stats.gamesPlayed}`);
    });

    // 6. Berechne Team-Matsch-Bilanz aus Spieler-Event-Counts (aggregiert)
    console.log('\n\n📊 PLAYER-LEVEL EVENT-COUNTS aggregiert zu Teams:');
    console.log('─'.repeat(80));

    const teamStatsFromPlayerEvents = new Map();
    const totalEventCountsByPlayer = summary.totalEventCountsByPlayer || {};

    gameResults.forEach(game => {
      const gameTeams = game.teams || {};
      const topPlayers = gameTeams.top?.players || [];
      const bottomPlayers = gameTeams.bottom?.players || [];
      
      const getTeamId = (players) => players.map(p => p.playerId).sort().join('-');
      const getTeamName = (players) => players.map(p => p.displayName || p.playerId).join(' & ');
      
      const topTeamId = getTeamId(topPlayers);
      const bottomTeamId = getTeamId(bottomPlayers);
      const topTeamName = getTeamName(topPlayers);
      const bottomTeamName = getTeamName(bottomPlayers);

      // NICHT SO: Wir können nicht einfach playerEvents aggregieren
      // weil die über ALLE 15 Spiele sind, nicht nur für dieses Team
    });

    console.log('⚠️  Player-Event-Counts können NICHT direkt zu Team-Stats aggregiert werden!');
    console.log('   Sie enthalten Events aus ALLEN Spielen, nicht nur für ein bestimmtes Team.');

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

