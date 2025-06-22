const admin = require('firebase-admin');

// Firebase Admin für Emulator initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'jasstafel-c2c0c'
  });
}

// Emulator-Einstellungen
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const db = admin.firestore();

async function testAllGroupStatistics() {
  console.log('🔍 VOLLSTÄNDIGER TEST ALLER 38 GRUPPEN-STATISTIKEN');
  console.log('=' .repeat(80));

  try {
    // Alle Gruppen laden
    const groupsSnap = await db.collection('groups').get();
    const groups = [];
    
    groupsSnap.forEach(doc => {
      const data = doc.data();
      groups.push({
        id: doc.id,
        name: data.name || 'Unbenannte Gruppe',
        memberCount: Object.keys(data.players || {}).length
      });
    });

    console.log(`📊 Gefundene Gruppen: ${groups.length}`);
    groups.forEach(group => {
      console.log(`  - ${group.name} (${group.id}): ${group.memberCount} Mitglieder`);
    });
    console.log();

    // Für jede Gruppe die Statistiken testen
    for (const group of groups) {
      await testGroupStatistics(group.id, group.name);
    }

  } catch (error) {
    console.error('❌ Fehler beim Testen der Gruppen-Statistiken:', error);
  }
}

async function testGroupStatistics(groupId, groupName) {
  console.log(`\n🎯 TESTE GRUPPE: ${groupName} (${groupId})`);
  console.log('-'.repeat(60));

  try {
    // Gruppen-Statistiken laden
    const statsDoc = await db.collection('groupComputedStats').doc(groupId).get();
    
    if (!statsDoc.exists) {
      console.log('❌ Keine Statistiken gefunden für diese Gruppe');
      return;
    }

    const stats = statsDoc.data();
    
    // Alle 38 Statistiken definieren und testen
    const allStatistics = [
      // === BASIC STATISTICS (15) ===
      { key: 'groupId', name: 'Gruppen-ID', category: 'Basic' },
      { key: 'memberCount', name: 'Mitgliederanzahl', category: 'Basic' },
      { key: 'sessionCount', name: 'Session-Anzahl', category: 'Basic' },
      { key: 'gameCount', name: 'Spiel-Anzahl', category: 'Basic' },
      { key: 'avgRoundsPerGame', name: 'Ø Runden pro Spiel', category: 'Basic' },
      { key: 'avgRoundDurationSeconds', name: 'Ø Rundendauer (Sek)', category: 'Basic' },
      { key: 'avgMatschPerGame', name: 'Ø Matsch pro Spiel', category: 'Basic' },
      { key: 'totalPlayTimeSeconds', name: 'Gesamte Spielzeit (Sek)', category: 'Basic' },
      { key: 'avgSessionDurationSeconds', name: 'Ø Session-Dauer (Sek)', category: 'Basic' },
      { key: 'avgGameDurationSeconds', name: 'Ø Spiel-Dauer (Sek)', category: 'Basic' },
      { key: 'avgGamesPerSession', name: 'Ø Spiele pro Session', category: 'Basic' },
      { key: 'firstJassTimestamp', name: 'Erster Jass Zeitstempel', category: 'Basic' },
      { key: 'lastJassTimestamp', name: 'Letzter Jass Zeitstempel', category: 'Basic' },
      { key: 'hauptspielortName', name: 'Hauptspielort Name', category: 'Basic' },
      { key: 'lastUpdateTimestamp', name: 'Letztes Update', category: 'Basic' },

      // === PLAYER STATISTICS (12) ===
      { key: 'playerWithMostGames', name: 'Spieler mit meisten Spielen', category: 'Player' },
      { key: 'playerWithHighestStricheDiff', name: 'Spieler mit höchster Striche-Diff', category: 'Player' },
      { key: 'playerWithHighestPointsDiff', name: 'Spieler mit höchster Punkte-Diff', category: 'Player' },
      { key: 'playerWithHighestWinRateSession', name: 'Spieler mit höchster Session-Gewinnrate', category: 'Player' },
      { key: 'playerWithHighestWinRateGame', name: 'Spieler mit höchster Spiel-Gewinnrate', category: 'Player' },
      { key: 'playerWithHighestMatschRate', name: 'Spieler mit höchster Matsch-Rate', category: 'Player' },
      { key: 'playerWithHighestSchneiderRate', name: 'Spieler mit höchster Schneider-Rate', category: 'Player' },
      { key: 'playerWithHighestKontermatschRate', name: 'Spieler mit höchster Kontermatsch-Rate', category: 'Player' },
      { key: 'playerWithMostWeisPointsAvg', name: 'Spieler mit meisten Weis-Punkten Ø', category: 'Player' },
      { key: 'playerWithFastestRounds', name: 'Spieler mit schnellsten Runden', category: 'Player' },
      { key: 'playerWithSlowestRounds', name: 'Spieler mit langsamsten Runden', category: 'Player' },
      { key: 'playerAllRoundTimes', name: 'Alle Spieler Rundenzeiten', category: 'Player' },

      // === TEAM STATISTICS (9) ===
      { key: 'teamWithHighestWinRateSession', name: 'Team mit höchster Session-Gewinnrate', category: 'Team' },
      { key: 'teamWithHighestWinRateGame', name: 'Team mit höchster Spiel-Gewinnrate', category: 'Team' },
      { key: 'teamWithHighestPointsDiff', name: 'Team mit höchster Punkte-Diff', category: 'Team' },
      { key: 'teamWithHighestStricheDiff', name: 'Team mit höchster Striche-Diff', category: 'Team' },
      { key: 'teamWithHighestMatschRate', name: 'Team mit höchster Matsch-Rate', category: 'Team' },
      { key: 'teamWithHighestSchneiderRate', name: 'Team mit höchster Schneider-Rate', category: 'Team' },
      { key: 'teamWithHighestKontermatschRate', name: 'Team mit höchster Kontermatsch-Rate', category: 'Team' },
      { key: 'teamWithMostWeisPointsAvg', name: 'Team mit meisten Weis-Punkten Ø', category: 'Team' },
      { key: 'teamWithFastestRounds', name: 'Team mit schnellsten Runden', category: 'Team' },

      // === TRUMPF STATISTICS (2) ===
      { key: 'trumpfStatistik', name: 'Trumpf-Statistik', category: 'Trumpf' },
      { key: 'totalTrumpfCount', name: 'Gesamte Trumpf-Anzahl', category: 'Trumpf' }
    ];

    console.log(`📈 STATISTIK-ÜBERSICHT (${allStatistics.length} Statistiken):`);
    
    // Kategorien gruppieren
    const categories = {};
    allStatistics.forEach(stat => {
      if (!categories[stat.category]) {
        categories[stat.category] = [];
      }
      categories[stat.category].push(stat);
    });

    let totalImplemented = 0;
    let totalWithData = 0;

    // Für jede Kategorie
    Object.keys(categories).forEach(categoryName => {
      console.log(`\n📂 ${categoryName.toUpperCase()} (${categories[categoryName].length} Statistiken):`);
      
      categories[categoryName].forEach(stat => {
        const value = stats[stat.key];
        const isImplemented = value !== undefined;
        const hasData = isImplemented && (
          (typeof value === 'number' && value > 0) ||
          (typeof value === 'string' && value.length > 0) ||
          (Array.isArray(value) && value.length > 0) ||
          (typeof value === 'object' && value !== null && Object.keys(value).length > 0) ||
          (value instanceof admin.firestore.Timestamp)
        );

        let status = '❌'; // Nicht implementiert
        if (isImplemented) {
          status = hasData ? '✅' : '⚪'; // Mit Daten : Implementiert aber keine Daten
          totalImplemented++;
          if (hasData) totalWithData++;
        }

        let displayValue = 'undefined';
        if (isImplemented) {
          if (Array.isArray(value)) {
            displayValue = `Array[${value.length}]`;
          } else if (typeof value === 'object' && value !== null) {
            if (value instanceof admin.firestore.Timestamp) {
              displayValue = `Timestamp(${new Date(value.toMillis()).toLocaleDateString()})`;
            } else {
              displayValue = `Object{${Object.keys(value).length} keys}`;
            }
          } else {
            displayValue = String(value);
          }
        }

        console.log(`  ${status} ${stat.name}: ${displayValue}`);
      });
    });

    console.log(`\n📊 ZUSAMMENFASSUNG für ${groupName}:`);
    console.log(`  🔧 Implementiert: ${totalImplemented}/${allStatistics.length} (${Math.round(totalImplemented/allStatistics.length*100)}%)`);
    console.log(`  📈 Mit Daten: ${totalWithData}/${allStatistics.length} (${Math.round(totalWithData/allStatistics.length*100)}%)`);
    
    // Fehlende Statistiken auflisten
    const missing = allStatistics.filter(stat => stats[stat.key] === undefined);
    if (missing.length > 0) {
      console.log(`\n❌ FEHLENDE STATISTIKEN (${missing.length}):`);
      missing.forEach(stat => {
        console.log(`  - ${stat.name} (${stat.key})`);
      });
    }

    // Implementierte aber leere Statistiken
    const empty = allStatistics.filter(stat => {
      const value = stats[stat.key];
      return value !== undefined && (
        (typeof value === 'number' && value === 0) ||
        (typeof value === 'string' && value.length === 0) ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' && value !== null && !(value instanceof admin.firestore.Timestamp) && Object.keys(value).length === 0) ||
        value === null
      );
    });
    
    if (empty.length > 0) {
      console.log(`\n⚪ IMPLEMENTIERT ABER LEER (${empty.length}):`);
      empty.forEach(stat => {
        console.log(`  - ${stat.name} (${stat.key})`);
      });
    }

  } catch (error) {
    console.error(`❌ Fehler beim Testen der Statistiken für Gruppe ${groupName}:`, error);
  }
}

// Test ausführen
testAllGroupStatistics().then(() => {
  console.log('\n✅ Test abgeschlossen');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test fehlgeschlagen:', error);
  process.exit(1);
}); 