const { updatePlayerStats } = require('./src/playerStatsCalculator');

// Player IDs von den betroffenen Spielern
const AFFECTED_PLAYERS = [
  'b16c1120111b7d9e7d733837', // Remo
  'F1uwdthL6zu7F0cYf1jbe',    // Frank
  '9K2d1OQ1mCXddko7ft6y',    // Michael
  'PLaDRlPBo91yu5Ij8MOT2'    // Studi
];

async function recalculateAffectedPlayers() {
  console.log('🔄 Starte Neuberechnung für betroffene Spieler...\n');

  for (const playerId of AFFECTED_PLAYERS) {
    try {
      console.log(`⏳ Berechne Statistiken für ${playerId}...`);
      await updatePlayerStats(playerId);
      console.log(`✅ Erfolgreich aktualisiert: ${playerId}\n`);
    } catch (error) {
      console.error(`❌ Fehler bei ${playerId}:`, error);
    }
  }

  console.log('🎉 Neuberechnung abgeschlossen!');
}

// Run the recalculation
recalculateAffectedPlayers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Kritischer Fehler:', error);
    process.exit(1);
  }); 