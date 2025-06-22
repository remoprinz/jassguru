const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./functions/serviceAccountKey.json'),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

async function resetGroupStats() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ'; // Deine Gruppe
  
  try {
    console.log('🗑️ === GRUPPEN-STATISTIKEN RESET ===');
    console.log(`Lösche alte groupComputedStats für Gruppe: ${groupId}`);
    
    // Lösche die alten Gruppen-Statistiken
    await db.collection('groupComputedStats').doc(groupId).delete();
    console.log('✅ Alte groupComputedStats gelöscht');
    
    console.log('⚡ Triggere Neukalkulation durch jassGameSummary Update...');
    
    // Triggere Neukalkulation über ein beliebiges jassGameSummary Update
    const sessionRef = db.collection('jassGameSummaries').doc('83fBU_l0Rcok3a_DRt0-Z');
    await sessionRef.update({
      triggerGroupStatsRecalculation: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Neukalkulation getriggert');
    console.log('⏳ Warte 15 Sekunden auf Verarbeitung...');
    
    // Warte auf Verarbeitung
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Prüfe die neuen Statistiken
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
      }
    } else {
      console.log('⚠️ Neue Statistiken noch nicht verfügbar. Versuche es in ein paar Minuten nochmal.');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Reset der Gruppen-Statistiken:', error);
  }
}

resetGroupStats().then(() => {
  console.log('🏁 Script beendet');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script-Fehler:', error);
  process.exit(1);
}); 