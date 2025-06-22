const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

async function testGroupStatsCollection() {
  console.log('🔍 Testing Group Stats Collection...\n');

  try {
    // 1. Finde eine Gruppe mit Sessions
    console.log('1. Suche nach Gruppen mit Sessions...');
    const groupsSnap = await db.collection('groups').limit(5).get();
    
    if (groupsSnap.empty) {
      console.log('❌ Keine Gruppen gefunden');
      return;
    }

    let testGroupId = null;
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      const sessionsSnap = await db.collection('jassGameSummaries')
        .where('groupId', '==', groupId)
        .where('status', '==', 'completed')
        .limit(1)
        .get();
      
      if (!sessionsSnap.empty) {
        testGroupId = groupId;
        console.log(`✅ Gruppe gefunden: ${groupId}`);
        break;
      }
    }

    if (!testGroupId) {
      console.log('❌ Keine Gruppe mit abgeschlossenen Sessions gefunden');
      return;
    }

    // 2. Prüfe, ob bereits Statistiken in groupComputedStats existieren
    console.log('\n2. Prüfe bestehende Statistiken...');
    const existingStatsSnap = await db.collection('groupComputedStats').doc(testGroupId).get();
    
    if (existingStatsSnap.exists) {
      const stats = existingStatsSnap.data();
      console.log(`✅ Statistiken gefunden für Gruppe ${testGroupId}:`);
      console.log(`   - Mitglieder: ${stats.memberCount}`);
      console.log(`   - Sessions: ${stats.sessionCount}`);
      console.log(`   - Spiele: ${stats.gameCount}`);
      console.log(`   - Letzte Aktualisierung: ${stats.lastUpdateTimestamp?.toDate()}`);
      
      // Zeige einige Highlights
      if (stats.playerWithMostGames && stats.playerWithMostGames.length > 0) {
        console.log(`   - Spieler mit meisten Spielen: ${stats.playerWithMostGames[0].playerName} (${stats.playerWithMostGames[0].value} Spiele)`);
      }
      
      if (stats.trumpfStatistik) {
        console.log(`   - Trumpf-Statistiken: ${JSON.stringify(stats.trumpfStatistik)}`);
      }
    } else {
      console.log(`❌ Keine Statistiken in groupComputedStats für Gruppe ${testGroupId} gefunden`);
      
      // 3. Triggere manuelle Berechnung
      console.log('\n3. Triggere manuelle Statistik-Berechnung...');
      
      // Importiere die Funktion
      const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');
      
      console.log('Berechne Statistiken...');
      await updateGroupComputedStatsAfterSession(testGroupId);
      
      // 4. Prüfe erneut
      console.log('\n4. Prüfe Statistiken nach Berechnung...');
      const newStatsSnap = await db.collection('groupComputedStats').doc(testGroupId).get();
      
      if (newStatsSnap.exists) {
        const stats = newStatsSnap.data();
        console.log(`✅ Neue Statistiken erstellt für Gruppe ${testGroupId}:`);
        console.log(`   - Mitglieder: ${stats.memberCount}`);
        console.log(`   - Sessions: ${stats.sessionCount}`);
        console.log(`   - Spiele: ${stats.gameCount}`);
        console.log(`   - Letzte Aktualisierung: ${stats.lastUpdateTimestamp?.toDate()}`);
      } else {
        console.log(`❌ Statistiken immer noch nicht gefunden nach Berechnung`);
      }
    }

    // 5. Liste alle groupComputedStats Dokumente auf
    console.log('\n5. Alle groupComputedStats Dokumente:');
    const allStatsSnap = await db.collection('groupComputedStats').get();
    
    if (allStatsSnap.empty) {
      console.log('❌ Keine Dokumente in groupComputedStats Collection gefunden');
    } else {
      console.log(`✅ ${allStatsSnap.docs.length} Statistik-Dokumente gefunden:`);
      allStatsSnap.docs.forEach(doc => {
        const stats = doc.data();
        console.log(`   - ${doc.id}: ${stats.sessionCount} Sessions, ${stats.gameCount} Spiele`);
      });
    }

  } catch (error) {
    console.error('❌ Fehler beim Testen:', error);
  }
}

// Script ausführen
testGroupStatsCollection()
  .then(() => {
    console.log('\n✅ Test abgeschlossen');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test fehlgeschlagen:', error);
    process.exit(1);
  }); 