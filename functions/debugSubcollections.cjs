const admin = require('firebase-admin');

// Firebase initialisieren
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Debug-Skript für Subcollections
 */
async function debugSubcollections() {
  console.log('🔍 Debug Subcollections...');
  
  try {
    // Eine spezifische Session testen
    const sessionId = 'fNGTXwzTxxinFXW1EF91B';
    
    console.log(`\n🔍 Teste Session: ${sessionId}`);
    
    // Direkte Abfrage der Subcollection
    try {
      const completedGamesRef = db.collection('jassGameSummaries').doc(sessionId).collection('completedGames');
      console.log(`📋 Collection-Pfad: ${completedGamesRef.path}`);
      
      const snapshot = await completedGamesRef.get();
      console.log(`📊 Dokumente gefunden: ${snapshot.size}`);
      
      if (snapshot.size > 0) {
        snapshot.docs.slice(0, 2).forEach((doc, index) => {
          const data = doc.data();
          console.log(`  📄 Dokument ${index + 1} (${doc.id}):`);
          console.log(`    - Game Number: ${data.gameNumber}`);
          console.log(`    - Round History: ${data.roundHistory?.length || 0} Runden`);
          console.log(`    - Keys: ${Object.keys(data).join(', ')}`);
        });
      }
    } catch (error) {
      console.error(`❌ Fehler beim Zugriff auf Subcollection:`, error.message);
    }
    
    // Alternative: Alle Collections auflisten
    console.log(`\n📚 Alle Collections für Session ${sessionId}:`);
    try {
      const sessionRef = db.collection('jassGameSummaries').doc(sessionId);
      const subcollections = await sessionRef.listCollections();
      subcollections.forEach(collection => {
        console.log(`  - ${collection.id}`);
      });
    } catch (error) {
      console.error(`❌ Fehler beim Auflisten der Subcollections:`, error.message);
    }
    
    // Teste alle migrierten Sessions
    console.log(`\n🔍 Teste alle migrierten Sessions:`);
    const sessionsSnapshot = await db.collection('jassGameSummaries')
      .where('migratedAt', '!=', null)
      .get();
    
    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionId = sessionDoc.id;
      console.log(`\n📋 Session: ${sessionId}`);
      
      try {
        const subcollections = await sessionDoc.ref.listCollections();
        console.log(`  Subcollections: ${subcollections.map(c => c.id).join(', ')}`);
        
        if (subcollections.some(c => c.id === 'completedGames')) {
          const completedGamesSnapshot = await sessionDoc.ref.collection('completedGames').get();
          console.log(`  ✅ completedGames: ${completedGamesSnapshot.size} Dokumente`);
        } else {
          console.log(`  ❌ Keine completedGames Subcollection`);
        }
      } catch (error) {
        console.error(`  ❌ Fehler: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Kritischer Fehler:', error);
  }
}

// Debug ausführen
debugSubcollections()
  .then(() => {
    console.log('🏁 Debug beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Debug fehlgeschlagen:', error);
    process.exit(1);
  }); 