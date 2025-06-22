const admin = require('firebase-admin');

// Firebase initialisieren
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Diagnose-Skript um herauszufinden, wo die ursprünglichen Legacy-Daten sind
 */
async function diagnoseLegacyData() {
  console.log('🔍 Starte Legacy-Daten-Diagnose...');
  
  try {
    // Alle migrierten Session-Dokumente finden
    const sessionsSnapshot = await db.collection('jassGameSummaries')
      .where('migratedAt', '!=', null)
      .get();
    
    console.log(`📊 Gefunden: ${sessionsSnapshot.size} migrierte Sessions`);
    
    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionId = sessionDoc.id;
      const sessionData = sessionDoc.data();
      
      console.log(`\n🔍 Analysiere Session: ${sessionId}`);
      console.log(`   📅 Migriert am: ${sessionData.migratedAt?.toDate()}`);
      console.log(`   📝 Migriert von: ${sessionData.migratedBy}`);
      
      // Prüfen ob completedGames Subcollection existiert
      const completedGamesSnapshot = await db.collection('jassGameSummaries', sessionId, 'completedGames').get();
      console.log(`   📋 completedGames Subcollection: ${completedGamesSnapshot.size} Dokumente`);
      
      // Prüfen ob sessions Collection existiert (alte Struktur)
      const oldSessionSnapshot = await db.collection('sessions').doc(sessionId).get();
      console.log(`   📋 Alte sessions Collection: ${oldSessionSnapshot.exists ? 'EXISTIERT' : 'NICHT VORHANDEN'}`);
      
      if (oldSessionSnapshot.exists) {
        const oldSessionData = oldSessionSnapshot.data();
        console.log(`   📊 Alte Session Daten:`);
        console.log(`      - Status: ${oldSessionData.status}`);
        console.log(`      - Games: ${oldSessionData.games?.length || 0}`);
        console.log(`      - Completed Games Count: ${oldSessionData.completedGamesCount || 0}`);
        
        // Prüfen ob completedGames in der alten Session existieren
        const oldCompletedGamesSnapshot = await db.collection('sessions', sessionId, 'completedGames').get();
        console.log(`   📋 Alte completedGames Subcollection: ${oldCompletedGamesSnapshot.size} Dokumente`);
        
        if (oldCompletedGamesSnapshot.size > 0) {
          console.log(`   ✅ ROHDATEN GEFUNDEN in alter sessions Collection!`);
          
          // Erste paar Dokumente anzeigen
          oldCompletedGamesSnapshot.docs.slice(0, 2).forEach((doc, index) => {
            const gameData = doc.data();
            console.log(`      Spiel ${index + 1} (${doc.id}):`);
            console.log(`        - Game Number: ${gameData.gameNumber}`);
            console.log(`        - Round History: ${gameData.roundHistory?.length || 0} Runden`);
            console.log(`        - Trumpf Counts: ${Object.keys(gameData.trumpfCountsByPlayer || {}).length} Spieler`);
            console.log(`        - Round Durations: ${Object.keys(gameData.roundDurationsByPlayer || {}).length} Spieler`);
          });
        }
      }
      
      // Prüfen ob activeGames existieren
      const activeGamesSnapshot = await db.collection('activeGames')
        .where('sessionId', '==', sessionId)
        .get();
      console.log(`   📋 ActiveGames: ${activeGamesSnapshot.size} Dokumente`);
      
      // Aktuelle completedGames Struktur analysieren
      if (sessionData.completedGames) {
        console.log(`   📊 Aktuelle completedGames Struktur:`);
        if (typeof sessionData.completedGames === 'string') {
          console.log(`      - Typ: String (Rosen10player)`);
          console.log(`      - Wert: ${sessionData.completedGames}`);
        } else if (typeof sessionData.completedGames === 'object') {
          console.log(`      - Typ: Object`);
          console.log(`      - Keys: ${Object.keys(sessionData.completedGames).join(', ')}`);
          
          if (sessionData.completedGames.aggregatedRoundDurationsByPlayer) {
            const roundDurations = sessionData.completedGames.aggregatedRoundDurationsByPlayer;
            const validDurations = Object.values(roundDurations).filter(d => d.roundCount > 0 || d.totalDuration > 0).length;
            console.log(`      - Round Durations: ${validDurations}/${Object.keys(roundDurations).length} gültig`);
          }
          
          if (sessionData.completedGames.aggregatedTrumpfCountsByPlayer) {
            const trumpfCounts = sessionData.completedGames.aggregatedTrumpfCountsByPlayer;
            console.log(`      - Trumpf Counts: ${Object.keys(trumpfCounts).length} Spieler`);
          }
        }
      }
    }
    
    // Zusätzlich alle Collections auflisten
    console.log(`\n📚 Alle verfügbaren Collections:`);
    const collections = await db.listCollections();
    collections.forEach(collection => {
      console.log(`   - ${collection.id}`);
    });
    
  } catch (error) {
    console.error('❌ Fehler bei der Diagnose:', error);
  }
}

// Diagnose ausführen
diagnoseLegacyData()
  .then(() => {
    console.log('🏁 Diagnose beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Diagnose fehlgeschlagen:', error);
    process.exit(1);
  }); 