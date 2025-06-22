const admin = require('firebase-admin');

// Firebase Admin initialisieren mit Application Default Credentials
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function directStatsTest() {
  console.log('🧪 Direct Stats Test...\n');

  try {
    // Importiere die kompilierte Funktion
    const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
    
    // Verwende eine bekannte Gruppen-ID (aus den vorherigen Tests)
    const testGroupId = 'BKJhJJJJJJJJJJJJJJJJ'; // Ersetze mit einer echten ID
    
    console.log(`Testing mit Gruppe: ${testGroupId}`);
    
    // 1. Prüfe, ob die Gruppe existiert
    const groupDoc = await db.collection('groups').doc(testGroupId).get();
    if (!groupDoc.exists) {
      console.log('❌ Test-Gruppe existiert nicht. Suche nach einer anderen...');
      
      // Finde eine beliebige Gruppe
      const groupsSnap = await db.collection('groups').limit(1).get();
      if (groupsSnap.empty) {
        console.log('❌ Keine Gruppen gefunden');
        return;
      }
      
      const firstGroup = groupsSnap.docs[0];
      testGroupId = firstGroup.id;
      console.log(`✅ Verwende Gruppe: ${testGroupId}`);
    }
    
    // 2. Prüfe aktuelle groupComputedStats
    console.log('\n2. Prüfe aktuelle groupComputedStats...');
    const beforeStatsSnap = await db.collection('groupComputedStats').get();
    console.log(`Dokumente vor Test: ${beforeStatsSnap.docs.length}`);
    
    // 3. Führe Statistik-Berechnung aus
    console.log('\n3. Führe Statistik-Berechnung aus...');
    await updateGroupComputedStatsAfterSession(testGroupId);
    console.log('✅ Statistik-Berechnung abgeschlossen');
    
    // 4. Prüfe Ergebnis
    console.log('\n4. Prüfe Ergebnis...');
    const afterStatsSnap = await db.collection('groupComputedStats').get();
    console.log(`Dokumente nach Test: ${afterStatsSnap.docs.length}`);
    
    const groupStatsDoc = await db.collection('groupComputedStats').doc(testGroupId).get();
    if (groupStatsDoc.exists) {
      const stats = groupStatsDoc.data();
      console.log(`✅ Statistiken für Gruppe ${testGroupId}:`);
      console.log(`   - Sessions: ${stats.sessionCount}`);
      console.log(`   - Spiele: ${stats.gameCount}`);
      console.log(`   - Mitglieder: ${stats.memberCount}`);
      console.log(`   - Letzte Aktualisierung: ${stats.lastUpdateTimestamp?.toDate()}`);
      
      // Zeige einige Highlights
      if (stats.playerWithMostGames && stats.playerWithMostGames.length > 0) {
        console.log(`   - Top Spieler: ${stats.playerWithMostGames[0].playerName} (${stats.playerWithMostGames[0].value} Spiele)`);
      }
      
      if (stats.trumpfStatistik) {
        console.log(`   - Trumpf-Statistiken: ${JSON.stringify(stats.trumpfStatistik)}`);
      }
    } else {
      console.log(`❌ Keine Statistiken für Gruppe ${testGroupId} gefunden`);
    }
    
    // 5. Liste alle Dokumente auf
    console.log('\n5. Alle groupComputedStats Dokumente:');
    if (afterStatsSnap.docs.length > 0) {
      afterStatsSnap.docs.forEach(doc => {
        const stats = doc.data();
        console.log(`   - ${doc.id}: ${stats.sessionCount || 0} Sessions, ${stats.gameCount || 0} Spiele`);
      });
    } else {
      console.log('   Keine Dokumente gefunden');
    }

  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

// Script ausführen
directStatsTest()
  .then(() => {
    console.log('\n✅ Test abgeschlossen');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test fehlgeschlagen:', error);
    process.exit(1);
  }); 