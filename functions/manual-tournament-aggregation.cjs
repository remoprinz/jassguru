const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function manualTournamentAggregation() {
  console.log('🚀 [MANUAL] Starte manuelle Tournament-Aggregation...');
  
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  
  try {
    // 1. Prüfe Tournament-Status
    console.log('\n🏆 [CHECK] Prüfe Tournament-Status...');
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    
    if (!tournamentDoc.exists) {
      console.log('❌ Tournament nicht gefunden!');
      return;
    }
    
    const tournamentData = tournamentDoc.data();
    console.log(`  - Status: ${tournamentData.status}`);
    console.log(`  - Name: ${tournamentData.name}`);
    
    // 2. Lösche altes fehlerhaftes Dokument falls vorhanden
    console.log('\n🗑️ [CLEANUP] Lösche alte Tournament-Sessions...');
    const oldSessionsSnap = await db.collection('jassGameSummaries')
      .where('tournamentId', '==', tournamentId)
      .get();
    
    for (const doc of oldSessionsSnap.docs) {
      console.log(`  - Lösche altes Dokument: ${doc.id}`);
      await doc.ref.delete();
    }
    
    // 3. Setze Tournament-Status für Trigger
    console.log('\n🔄 [TRIGGER] Setze Tournament-Status für Aggregation...');
    await tournamentRef.update({
      status: 'completed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Tournament-Status auf "completed" gesetzt');
    
    // 4. Direkte Cloud Function URL aufrufen
    console.log('\n☁️ [FUNCTION] Rufe Cloud Function direkt auf...');
    
    try {
      const response = await fetch('https://aggregatetournamentintosummary-lmrqgwbcka-uc.a.run.app', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            tournamentId: tournamentId
          }
        })
      });
      
      if (response.ok) {
        const result = await response.text();
        console.log('✅ Cloud Function erfolgreich aufgerufen');
        console.log(`Response: ${result}`);
      } else {
        console.log(`❌ Cloud Function Fehler: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.log(`Error Details: ${errorText}`);
      }
    } catch (fetchError) {
      console.log('❌ Fetch Fehler:', fetchError.message);
      
      // Fallback: Verwende Firebase Admin SDK direkt
      console.log('\n🔧 [FALLBACK] Verwende Admin SDK direkt...');
      
      // Importiere die Funktion direkt
      const { aggregateTournamentIntoSummary } = require('./lib/processTournamentCompletion');
      
      const result = await aggregateTournamentIntoSummary({
        data: { tournamentId: tournamentId }
      });
      
      console.log('✅ Direkte Funktion erfolgreich ausgeführt');
      console.log('Result:', result);
    }
    
    // 5. Warte und prüfe Ergebnis
    console.log('\n⏳ [WAIT] Warte 10 Sekunden auf Verarbeitung...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 6. Prüfe neues Dokument
    console.log('\n📊 [VERIFY] Prüfe neues Tournament-Dokument...');
    const newSessionsSnap = await db.collection('jassGameSummaries')
      .where('tournamentId', '==', tournamentId)
      .where('status', '==', 'completed')
      .get();
    
    if (newSessionsSnap.empty) {
      console.log('❌ FEHLER: Kein neues Tournament-Dokument erstellt!');
    } else {
      console.log(`✅ SUCCESS: ${newSessionsSnap.docs.length} neue Tournament-Session(s) erstellt!`);
      
      const newDoc = newSessionsSnap.docs[0];
      const newData = newDoc.data();
      console.log(`  - Dokument ID: ${newDoc.id}`);
      console.log(`  - GameResults: ${newData.gameResults?.length || 0} Spiele`);
      console.log(`  - Game-Level finalStriche: ${!!newData.gameResults?.[0]?.finalStriche}`);
      console.log(`  - Game-Level durationSeconds: ${!!newData.gameResults?.[0]?.durationSeconds}`);
    }
    
  } catch (error) {
    console.error('❌ Fehler bei manueller Aggregation:', error);
  }
}

manualTournamentAggregation().then(() => {
  console.log('\n🏁 Manuelle Aggregation abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
}); 