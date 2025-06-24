const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert('./serviceAccountKey.json'),
  databaseURL: 'https://jassguru.firebaseio.com'
});

const db = admin.firestore();

const PLAYER_ID = 'b16c1120111b7d9e7d733837'; // Remo's player ID

async function triggerPlayerStatsRecalculation() {
  console.log(`🚀 Starte Neuberechnung der Player-Statistiken für: ${PLAYER_ID}`);
  
  try {
    // 1. Lösche die bestehenden playerComputedStats
    console.log('📝 Lösche bestehende playerComputedStats...');
    const statsRef = db.collection('playerComputedStats').doc(PLAYER_ID);
    await statsRef.delete();
    console.log('✅ Bestehende Statistiken gelöscht');
    
    // 2. Warte kurz
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. Triggere Neuberechnung durch Update einer jassGameSummary
    console.log('🔄 Triggere Neuberechnung durch jassGameSummary Update...');
    
    // Finde eine Session mit diesem Spieler
    const sessionsSnapshot = await db
      .collection('jassGameSummaries')
      .where('participantPlayerIds', 'array-contains', PLAYER_ID)
      .where('status', '==', 'completed')
      .limit(1)
      .get();
    
    if (sessionsSnapshot.empty) {
      throw new Error('Keine Sessions für diesen Spieler gefunden!');
    }
    
    const sessionDoc = sessionsSnapshot.docs[0];
    const sessionId = sessionDoc.id;
    console.log(`📊 Verwende Session: ${sessionId}`);
    
    // Update der Session um den Trigger auszulösen
    await sessionDoc.ref.update({
      lastStatsUpdateTrigger: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('⚡ Update-Trigger gesendet');
    
    // 4. Warte auf Verarbeitung
    console.log('⏳ Warte 10 Sekunden auf Verarbeitung...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 5. Prüfe ob neue Statistiken erstellt wurden
    console.log('🔍 Prüfe neue Statistiken...');
    const newStatsSnap = await statsRef.get();
    
    if (newStatsSnap.exists) {
      const newStats = newStatsSnap.data();
      console.log('✅ ERFOLG! Neue Statistiken erstellt:');
      console.log('📈 Durchschnittswerte:');
      console.log(`   • Ø Striche pro Spiel: ${newStats.avgStrichePerGame?.toFixed(1) || 'N/A'}`);
      console.log(`   • Ø Punkte pro Spiel: ${newStats.avgPointsPerGame?.toFixed(1) || 'N/A'}`);
      console.log(`   • Ø Matsch pro Spiel: ${newStats.avgMatschPerGame?.toFixed(2) || 'N/A'}`);
      console.log(`   • Ø Schneider pro Spiel: ${newStats.avgSchneiderPerGame?.toFixed(2) || 'N/A'}`);
      console.log(`   • Rundentempo: ${newStats.avgRoundDurationMilliseconds ? `${(newStats.avgRoundDurationMilliseconds / 1000 / 60).toFixed(1)}min` : 'N/A'}`);
      
      console.log('🎯 Win-Rates:');
      console.log(`   • Session Win-Rate: ${newStats.sessionWinRateInfo?.displayText || 'N/A'}`);
      console.log(`   • Game Win-Rate: ${newStats.gameWinRateInfo?.displayText || 'N/A'}`);
      
      console.log('📊 Totals:');
      console.log(`   • Total Sessions: ${newStats.totalSessions || 0}`);
      console.log(`   • Total Games: ${newStats.totalGames || 0}`);
      console.log(`   • Total Tournaments: ${newStats.totalTournamentsParticipated || 0}`);
      
      // Zeige die wichtigsten Verbesserungen
      console.log('🚀 VERBESSERUNGEN:');
      console.log(`   • Striche: ${newStats.avgStrichePerGame?.toFixed(1)} (vorher 2.6 - jetzt gemacht+erhalten)`);
      console.log(`   • Punkte: ${newStats.avgPointsPerGame?.toFixed(1)} (vorher 4260 - jetzt gemacht+erhalten)`);
      console.log(`   • Matsch: ${newStats.avgMatschPerGame?.toFixed(2)} (vorher 0.75 - jetzt gemacht+erhalten)`);
      console.log(`   • Schneider: ${newStats.avgSchneiderPerGame?.toFixed(2)} (vorher 0.18 - jetzt gemacht+erhalten)`);
      
    } else {
      console.log('❌ FEHLER: Keine neuen Statistiken gefunden!');
      console.log('💡 Möglicherweise dauert die Verarbeitung länger. Prüfen Sie in ein paar Minuten erneut.');
    }
    
  } catch (error) {
    console.error('❌ FEHLER bei der Neuberechnung:', error);
  }
}

// Hauptfunktion ausführen
triggerPlayerStatsRecalculation()
  .then(() => {
    console.log('🎉 Skript abgeschlossen');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Kritischer Fehler:', error);
    process.exit(1);
  });
