const admin = require('firebase-admin');

// Firebase Admin mit serviceAccountKey initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
    projectId: 'jassguru'
  });
}

// Import der TypeScript-Funktion über die kompilierte JS-Version
const { updatePlayerStats } = require('./lib/playerStatsCalculator');

async function triggerPlayerStatsUpdate() {
  const playerId = 'b16c1120111b7d9e7d733837';
  
  console.log(`🔄 Triggere Player-Statistik-Update für Player: ${playerId}`);
  
  try {
    await updatePlayerStats(playerId);
    console.log('✅ Player-Statistiken erfolgreich aktualisiert!');
    
    // Lade die aktualisierten Statistiken
    const db = admin.firestore();
    const statsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (statsDoc.exists) {
      const stats = statsDoc.data();
      console.log('\n📊 NACHHER - Session-Level Highlights:');
      console.log('Höchste Punkte:', stats.highestPointsSession?.value || 'null');
      console.log('Niedrigste Punkte:', stats.lowestPointsSession?.value || 'null');
      console.log('Meiste Striche:', stats.highestStricheSession?.value || 'null');
      console.log('Meiste erhaltene Striche:', stats.highestStricheReceivedSession?.value || 'null');
      console.log('Meiste Matsche:', stats.mostMatschSession?.value || 'null');
      console.log('Meiste erhaltene Matsche:', stats.mostMatschReceivedSession?.value || 'null');
      console.log('Meiste Weispunkte:', stats.mostWeisPointsSession?.value || 'null');
      console.log('Meiste erhaltene Weispunkte:', stats.mostWeisPointsReceivedSession?.value || 'null');
      
      if (stats.highestPointsSession) {
        console.log('\n🎯 Höchste Punkte Details:');
        console.log('Session ID:', stats.highestPointsSession.relatedId);
        console.log('Datum:', stats.highestPointsSession.date.toDate().toLocaleDateString('de-CH'));
        console.log('Label:', stats.highestPointsSession.label);
      }
    } else {
      console.log('❌ Keine Statistiken gefunden');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Update:', error);
  }
  
  process.exit(0);
}

triggerPlayerStatsUpdate(); 