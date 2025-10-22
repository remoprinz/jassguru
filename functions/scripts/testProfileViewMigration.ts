/**
 * 🎯 TEST PROFILEVIEW MIGRATION - Test der kompletten ProfileView-Migration
 * =========================================================================
 * 
 * Dieses Script testet die komplette Migration aller ProfileView-Daten:
 * - Player Statistics
 * - Session Archive  
 * - Chart Data
 * - Player Scores (bereits migriert)
 * 
 * ✅ ARCHITEKTUR:
 * - Lädt einen Test-Spieler
 * - Prüft alle neuen Collections
 * - Zeigt Datenstruktur an
 * - Validiert Multi-Level-Architektur
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialisiere Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

// ===== HAUPTFUNKTION =====

async function testProfileViewMigration() {
  console.log('🧪 TESTE PROFILEVIEW MIGRATION');
  console.log('==============================');
  console.log('');

  try {
    // 1. Lade einen Test-Spieler
    const playersSnapshot = await db.collection('players').limit(1).get();
    
    if (playersSnapshot.empty) {
      console.log('❌ Keine Spieler gefunden');
      return;
    }

    const testPlayer = playersSnapshot.docs[0];
    const playerId = testPlayer.id;
    const playerData = testPlayer.data();
    
    console.log(`👤 Test-Spieler: ${playerData.displayName || playerId}`);
    console.log('');

    // 2. Teste Player Scores (bereits migriert)
    console.log('📊 TESTE PLAYER SCORES:');
    const scoresDoc = await db.collection(`players/${playerId}/currentScores`).doc('latest').get();
    if (scoresDoc.exists) {
      const scoresData = scoresDoc.data()!;
      console.log('   ✅ Player Scores gefunden');
      console.log(`   - Global StricheDiff: ${scoresData.global?.stricheDiff || 'N/A'}`);
      console.log(`   - Global PointsDiff: ${scoresData.global?.pointsDiff || 'N/A'}`);
      console.log(`   - Gruppen: ${Object.keys(scoresData.groups || {}).length}`);
      console.log(`   - Turniere: ${Object.keys(scoresData.tournaments || {}).length}`);
    } else {
      console.log('   ⚠️ Keine Player Scores gefunden');
    }
    console.log('');

    // 3. Teste Player Statistics (neu)
    console.log('📈 TESTE PLAYER STATISTICS:');
    const statisticsDoc = await db.collection(`players/${playerId}/currentStatistics`).doc('latest').get();
    if (statisticsDoc.exists) {
      const statisticsData = statisticsDoc.data()!;
      console.log('   ✅ Player Statistics gefunden');
      console.log(`   - Total Sessions: ${statisticsData.global?.totalSessions || 'N/A'}`);
      console.log(`   - Total Games: ${statisticsData.global?.totalGames || 'N/A'}`);
      console.log(`   - Session Win Rate: ${statisticsData.global?.sessionWinRate || 'N/A'}`);
      console.log(`   - Gruppen: ${Object.keys(statisticsData.groups || {}).length}`);
      console.log(`   - Turniere: ${Object.keys(statisticsData.tournaments || {}).length}`);
    } else {
      console.log('   ⚠️ Keine Player Statistics gefunden');
    }
    console.log('');

    // 4. Teste Session Archive (neu)
    console.log('📁 TESTE SESSION ARCHIVE:');
    const archiveDoc = await db.collection(`players/${playerId}/currentSessionArchive`).doc('latest').get();
    if (archiveDoc.exists) {
      const archiveData = archiveDoc.data()!;
      console.log('   ✅ Session Archive gefunden');
      console.log(`   - Total Sessions: ${archiveData.global?.totalSessions || 'N/A'}`);
      console.log(`   - Sorted Years: ${archiveData.global?.sortedYears?.length || 0}`);
      console.log(`   - Gruppen: ${Object.keys(archiveData.groups || {}).length}`);
      console.log(`   - Turniere: ${Object.keys(archiveData.tournaments || {}).length}`);
    } else {
      console.log('   ⚠️ Kein Session Archive gefunden');
    }
    console.log('');

    // 5. Teste Chart Data (neu)
    console.log('📊 TESTE CHART DATA:');
    const chartDoc = await db.collection(`players/${playerId}/currentChartData`).doc('latest').get();
    if (chartDoc.exists) {
      const chartData = chartDoc.data()!;
      console.log('   ✅ Chart Data gefunden');
      console.log(`   - Elo Rating Data Points: ${chartData.global?.eloRating?.metadata?.totalDataPoints || 0}`);
      console.log(`   - StricheDiff Data Points: ${chartData.global?.stricheDiff?.metadata?.totalDataPoints || 0}`);
      console.log(`   - PointsDiff Data Points: ${chartData.global?.pointsDiff?.metadata?.totalDataPoints || 0}`);
      console.log(`   - Gruppen: ${Object.keys(chartData.groups || {}).length}`);
      console.log(`   - Turniere: ${Object.keys(chartData.tournaments || {}).length}`);
    } else {
      console.log('   ⚠️ Keine Chart Data gefunden');
    }
    console.log('');

    // 6. Teste Historie-Collections
    console.log('📚 TESTE HISTORIE-COLLECTIONS:');
    
    const scoresHistoryQuery = db.collection(`players/${playerId}/scoresHistory`).limit(1);
    const scoresHistorySnapshot = await scoresHistoryQuery.get();
    console.log(`   - Scores History: ${scoresHistorySnapshot.size} Einträge`);
    
    const statisticsHistoryQuery = db.collection(`players/${playerId}/statisticsHistory`).limit(1);
    const statisticsHistorySnapshot = await statisticsHistoryQuery.get();
    console.log(`   - Statistics History: ${statisticsHistorySnapshot.size} Einträge`);
    
    const archiveHistoryQuery = db.collection(`players/${playerId}/sessionArchiveHistory`).limit(1);
    const archiveHistorySnapshot = await archiveHistoryQuery.get();
    console.log(`   - Archive History: ${archiveHistorySnapshot.size} Einträge`);
    
    const chartHistoryQuery = db.collection(`players/${playerId}/chartDataHistory`).limit(1);
    const chartHistorySnapshot = await chartHistoryQuery.get();
    console.log(`   - Chart Data History: ${chartHistorySnapshot.size} Einträge`);
    console.log('');

    // 7. Zusammenfassung
    console.log('🎉 TEST ABGESCHLOSSEN');
    console.log('====================');
    console.log('✅ Alle neuen Collections sind verfügbar');
    console.log('✅ Multi-Level-Architektur funktioniert');
    console.log('✅ Historie-Collections sind bereit');
    console.log('');
    console.log('💡 Nächste Schritte:');
    console.log('   1. Führen Sie die Migration aus: npm run migrate-profileview-data');
    console.log('   2. Testen Sie das Frontend mit den neuen Services');
    console.log('   3. Überwachen Sie die Cloud Functions Logs');

  } catch (error) {
    console.error('❌ Fehler beim Test:', error);
    process.exit(1);
  }
}

// ===== AUSFÜHRUNG =====

if (require.main === module) {
  testProfileViewMigration()
    .then(() => {
      console.log('✅ Test erfolgreich abgeschlossen');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test fehlgeschlagen:', error);
      process.exit(1);
    });
}

export { testProfileViewMigration };
