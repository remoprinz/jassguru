const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

// Importiere die interne Aggregations-Funktion
const { aggregateTournamentIntoSummaryInternal } = require('./lib/processTournamentCompletion');

const db = admin.firestore();

async function createTournamentSummary() {
  console.log('🚀 [CREATE] Erstelle Tournament-Summary manuell...');
  
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  
  try {
    // 1. Lösche alte Tournament-Sessions
    console.log('\n🗑️ [CLEANUP] Lösche alte Tournament-Sessions...');
    const oldSessionsSnap = await db.collection('jassGameSummaries')
      .where('tournamentId', '==', tournamentId)
      .get();
    
    for (const doc of oldSessionsSnap.docs) {
      console.log(`  - Lösche altes Dokument: ${doc.id}`);
      await doc.ref.delete();
    }
    
    console.log('✅ Alte Dokumente gelöscht');
    
    // 2. Führe interne Aggregation direkt aus
    console.log('\n🔧 [AGGREGATE] Führe interne Tournament-Aggregation aus...');
    
    const result = await aggregateTournamentIntoSummaryInternal(tournamentId);
    
    console.log('✅ Aggregation erfolgreich ausgeführt');
    console.log('Result:', result);
    
    // 3. Prüfe Ergebnis
    console.log('\n📊 [VERIFY] Prüfe neues Tournament-Dokument...');
    const newSessionsSnap = await db.collection('jassGameSummaries')
      .where('tournamentId', '==', tournamentId)
      .where('status', '==', 'completed')
      .get();
    
    if (newSessionsSnap.empty) {
      console.log('❌ FEHLER: Kein neues Tournament-Dokument erstellt!');
    } else {
      console.log(`✅ SUCCESS: ${newSessionsSnap.docs.length} neue Tournament-Session(s) erstellt!`);
      
      for (const doc of newSessionsSnap.docs) {
        const data = doc.data();
        console.log(`\n📄 [DOKUMENT] ${doc.id}:`);
        console.log(`  - GameResults: ${data.gameResults?.length || 0} Spiele`);
        console.log(`  - Game-Level finalStriche: ${!!data.gameResults?.[0]?.finalStriche}`);
        console.log(`  - Game-Level durationSeconds: ${!!data.gameResults?.[0]?.durationSeconds}`);
        console.log(`  - Game-Level completedAt: ${!!data.gameResults?.[0]?.completedAt}`);
        
        if (data.gameResults?.[0]?.finalStriche) {
          const firstGame = data.gameResults[0];
          console.log(`  - Erstes Spiel Striche Top: ${JSON.stringify(firstGame.finalStriche.top)}`);
          console.log(`  - Erstes Spiel Striche Bottom: ${JSON.stringify(firstGame.finalStriche.bottom)}`);
        }
        
        // 4. Triggere Player Stats Update
        console.log('\n🔄 [STATS] Triggere Player Stats Update...');
        const participantPlayerIds = data.participantPlayerIds || [];
        
        for (const playerId of participantPlayerIds) {
          try {
            const { updatePlayerStats } = require('./lib/playerStatsCalculator');
            await updatePlayerStats(playerId);
            console.log(`  ✅ Stats updated for player: ${playerId}`);
          } catch (error) {
            console.log(`  ❌ Stats update failed for player ${playerId}:`, error.message);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Fehler bei Tournament-Summary-Erstellung:', error);
  }
}

createTournamentSummary().then(() => {
  console.log('\n🏁 Tournament-Summary-Erstellung abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
}); 