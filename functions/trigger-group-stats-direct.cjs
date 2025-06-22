const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
    projectId: 'jassguru'
  });
}

async function triggerGroupStatsManual() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ'; // Deine Gruppe
  
  try {
    console.log('🎯 === MANUELLE GRUPPEN-STATISTIKEN UPDATE ===');
    console.log(`Triggere manuelle updateGroupStats Cloud Function für: ${groupId}`);
    
    // Importiere die updateGroupStats Funktion direkt
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    console.log('⚡ Starte direkte Neuberechnung...');
    await updateGroupComputedStatsAfterSession(groupId);
    
    console.log('✅ Neuberechnung abgeschlossen');
    console.log('⏳ Warte 3 Sekunden auf Verarbeitung...');
    
    // Warte auf Verarbeitung
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Prüfe die neuen Statistiken
    const db = admin.firestore();
    const newStatsDoc = await db.collection('groupComputedStats').doc(groupId).get();
    
    if (newStatsDoc.exists) {
      const newStats = newStatsDoc.data();
      console.log('\n🎉 === NEUE GRUPPEN-STATISTIKEN ===');
      console.log(`Sessions: ${newStats.sessionCount} (sollte 7 sein, nicht 8)`);
      console.log(`Spiele: ${newStats.gameCount}`);
      console.log(`Mitglieder: ${newStats.memberCount}`);
      console.log(`Erste Partie: ${newStats.firstJassTimestamp?.toDate()}`);
      console.log(`Letzte Partie: ${newStats.lastJassTimestamp?.toDate()}`);
      console.log(`Update-Zeit: ${newStats.lastUpdateTimestamp?.toDate()}`);
      
      if (newStats.sessionCount === 7) {
        console.log('\n✅ PERFEKT: Sessions korrekt auf 7 reduziert!');
        console.log('💡 Die Turnier-Sessions werden jetzt korrekt herausgefiltert.');
      } else {
        console.log(`\n⚠️ Sessions noch bei ${newStats.sessionCount}, sollte aber 7 sein.`);
        console.log('🔍 Möglicherweise müssen die groupStatsCalculator Logik überprüft werden.');
      }
    } else {
      console.log('⚠️ Neue Statistiken noch nicht verfügbar.');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim manuellen Gruppen-Stats Update:', error);
  }
}

triggerGroupStatsManual().then(() => {
  console.log('🏁 Script beendet');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script-Fehler:', error);
  process.exit(1);
}); 