const admin = require('firebase-admin');
const { updatePlayerStats } = require('./playerStatsCalculator');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'jassguru'
  });
}

async function testPlayerStatsUpdate() {
  const playerId = process.argv[2];
  
  if (!playerId) {
    console.error('Bitte geben Sie eine Player-ID an: node manualPlayerStatsUpdate.js <playerId>');
    process.exit(1);
  }

  console.log(`🔄 Teste Player-Statistik-Update für Player: ${playerId}`);
  
  try {
    await updatePlayerStats(playerId);
    console.log('✅ Player-Statistiken erfolgreich aktualisiert!');
    
    // Lade die aktualisierten Statistiken
    const db = admin.firestore();
    const statsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      console.log('\n📊 Session-Level Highlights:');
      console.log('Höchste Punkte:', stats.highestPointsSession?.value || 'null');
      console.log('Niedrigste Punkte:', stats.lowestPointsSession?.value || 'null');
      console.log('Meiste Striche:', stats.highestStricheSession?.value || 'null');
      console.log('Meiste erhaltene Striche:', stats.highestStricheReceivedSession?.value || 'null');
      console.log('Meiste Matsche:', stats.mostMatschSession?.value || 'null');
      console.log('Meiste erhaltene Matsche:', stats.mostMatschReceivedSession?.value || 'null');
      console.log('Meiste Weispunkte:', stats.mostWeisPointsSession?.value || 'null');
      console.log('Meiste erhaltene Weispunkte:', stats.mostWeisPointsReceivedSession?.value || 'null');
    } else {
      console.log('❌ Keine Statistiken gefunden');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Update:', error);
  }
  
  process.exit(0);
}

testPlayerStatsUpdate(); 