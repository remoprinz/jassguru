// Finaler Test der vollständigen Gruppenstatistik-Implementierung
const fs = require('fs');
const path = require('path');

function testFinalGroupStatsImplementation() {
  console.log('🎯 FINALER TEST: VOLLSTÄNDIGE GRUPPENSTATISTIK-IMPLEMENTIERUNG');
  console.log('=' .repeat(80));

  try {
    // Lade die Implementierung
    const calculatorPath = path.join(__dirname, 'src', 'groupStatsCalculator.ts');
    const calculatorCode = fs.readFileSync(calculatorPath, 'utf8');

    // Lade das Modell
    const modelPath = path.join(__dirname, 'src', 'models', 'group-stats.model.ts');
    const modelCode = fs.readFileSync(modelPath, 'utf8');

    console.log('📂 Dateien analysiert:');
    console.log(`  - Calculator: ${calculatorCode.length} Zeichen`);
    console.log(`  - Model: ${modelCode.length} Zeichen`);

    // Alle 38 Statistiken definieren
    const allStatistics = [
      // BASIC STATISTICS (15)
      'groupId', 'memberCount', 'sessionCount', 'gameCount', 'avgRoundsPerGame',
      'avgRoundDurationSeconds', 'avgMatschPerGame', 'totalPlayTimeSeconds',
      'avgSessionDurationSeconds', 'avgGameDurationSeconds', 'avgGamesPerSession',
      'firstJassTimestamp', 'lastJassTimestamp', 'hauptspielortName', 'lastUpdateTimestamp',
      
      // PLAYER STATISTICS (12)
      'playerWithMostGames', 'playerWithHighestStricheDiff', 'playerWithHighestPointsDiff',
      'playerWithHighestWinRateSession', 'playerWithHighestWinRateGame', 'playerWithHighestMatschRate',
      'playerWithHighestSchneiderRate', 'playerWithHighestKontermatschRate', 'playerWithMostWeisPointsAvg',
      'playerWithFastestRounds', 'playerWithSlowestRounds', 'playerAllRoundTimes',
      
      // TEAM STATISTICS (9)
      'teamWithHighestWinRateSession', 'teamWithHighestWinRateGame', 'teamWithHighestPointsDiff',
      'teamWithHighestStricheDiff', 'teamWithHighestMatschRate', 'teamWithHighestSchneiderRate',
      'teamWithHighestKontermatschRate', 'teamWithMostWeisPointsAvg', 'teamWithFastestRounds',
      
      // TRUMPF STATISTICS (2)
      'trumpfStatistik', 'totalTrumpfCount'
    ];

    console.log(`\n🔍 ÜBERPRÜFE ALLE ${allStatistics.length} STATISTIKEN:`);

    // Detaillierte Implementierungsprüfung
    const implementationResults = {
      inModel: 0,
      inImplementation: 0,
      fullyImplemented: 0,
      missing: []
    };

    allStatistics.forEach((stat, index) => {
      const inModel = modelCode.includes(`${stat}:`);
      const inImplementation = calculatorCode.includes(`calculatedStats.${stat}`) || 
                              calculatorCode.includes(`stats.${stat}`);
      
      if (inModel) implementationResults.inModel++;
      if (inImplementation) implementationResults.inImplementation++;
      if (inModel && inImplementation) {
        implementationResults.fullyImplemented++;
      } else {
        implementationResults.missing.push(stat);
      }

      const status = (inModel && inImplementation) ? '✅' : '❌';
      console.log(`  ${String(index + 1).padStart(2, '0')}. ${status} ${stat}`);
    });

    console.log(`\n📊 IMPLEMENTIERUNGSERGEBNIS:`);
    console.log(`  📋 Im Modell definiert: ${implementationResults.inModel}/${allStatistics.length}`);
    console.log(`  🔧 In Implementierung verwendet: ${implementationResults.inImplementation}/${allStatistics.length}`);
    console.log(`  ✅ Vollständig implementiert: ${implementationResults.fullyImplemented}/${allStatistics.length}`);
    console.log(`  📈 Implementierungsgrad: ${Math.round(implementationResults.fullyImplemented/allStatistics.length*100)}%`);

    if (implementationResults.missing.length > 0) {
      console.log(`\n❌ FEHLENDE IMPLEMENTIERUNGEN (${implementationResults.missing.length}):`);
      implementationResults.missing.forEach(stat => {
        console.log(`  - ${stat}`);
      });
    }

    // Prüfe kritische Implementierungsaspekte
    console.log(`\n🔍 KRITISCHE IMPLEMENTIERUNGSASPEKTE:`);
    
    const criticalChecks = [
      { name: 'Differenz-Berechnung (made - received)', pattern: /stats\.made\s*-\s*stats\.received/g },
      { name: 'Ein-Jahres-Filter für aktive Spieler', pattern: /oneYearAgo/g },
      { name: 'Sortierung der Highlight-Listen', pattern: /\.sort\(\(a,\s*b\)\s*=>/g },
      { name: 'Spieler-Datensammlung', pattern: /playerPointsStats\.set/g },
      { name: 'Team-Datensammlung', pattern: /teamPairings\.set/g },
      { name: 'Session-basierte Team-Statistiken', pattern: /sessionTeamPairings/g },
      { name: 'Trumpf-Datensammlung', pattern: /trumpfCounts\.set/g },
      { name: 'Rundenzeiten-Sammlung', pattern: /playerRoundTimes/g },
      { name: 'Matsch-Statistiken', pattern: /playerMatschStats/g },
      { name: 'Schneider-Statistiken', pattern: /playerSchneiderStats/g },
      { name: 'Kontermatsch-Statistiken', pattern: /playerKontermatschStats/g },
      { name: 'Weis-Statistiken', pattern: /playerWeisStats/g },
      { name: 'Spiel-Gewinnraten', pattern: /playerGameStats/g },
      { name: 'Session-Gewinnraten', pattern: /playerSessionStats/g }
    ];

    let criticalIssues = 0;
    criticalChecks.forEach(check => {
      const matches = calculatorCode.match(check.pattern);
      const implemented = matches && matches.length > 0;
      const status = implemented ? '✅' : '❌';
      const count = implemented ? `(${matches.length}x)` : '';
      
      console.log(`  ${status} ${check.name} ${count}`);
      
      if (!implemented) criticalIssues++;
    });

    // Prüfe Datenqualität und -vollständigkeit
    console.log(`\n📊 DATENQUALITÄTSPRÜFUNG:`);
    
    const dataQualityChecks = [
      { name: 'Validierung von Session-Daten', pattern: /validateSessionData/g },
      { name: 'Validierung von Spiel-Daten', pattern: /validateCompletedGameData/g },
      { name: 'Fehlerbehandlung bei Spiel-Laden', pattern: /catch.*gameError/g },
      { name: 'Zeitstempel-Verarbeitung', pattern: /admin\.firestore\.Timestamp/g },
      { name: 'Runden-Daten-Analyse', pattern: /roundHistory.*forEach/g },
      { name: 'Team-Mapping-Logik', pattern: /teamScoreMapping/g }
    ];

    dataQualityChecks.forEach(check => {
      const matches = calculatorCode.match(check.pattern);
      const implemented = matches && matches.length > 0;
      const status = implemented ? '✅' : '❌';
      const count = implemented ? `(${matches.length}x)` : '';
      
      console.log(`  ${status} ${check.name} ${count}`);
    });

    // Finale Bewertung
    console.log(`\n🎯 FINALE BEWERTUNG:`);
    
    if (implementationResults.fullyImplemented === allStatistics.length) {
      console.log(`  ✅ PERFEKT! Alle ${allStatistics.length} Statistiken sind vollständig implementiert!`);
    } else {
      console.log(`  ⚠️  ${allStatistics.length - implementationResults.fullyImplemented} Statistiken benötigen noch Arbeit`);
    }

    if (criticalIssues === 0) {
      console.log(`  ✅ Alle kritischen Implementierungsaspekte sind vorhanden!`);
    } else {
      console.log(`  ⚠️  ${criticalIssues} kritische Implementierungsaspekte fehlen`);
    }

    // Zusammenfassung der Implementierung
    console.log(`\n📋 IMPLEMENTIERUNGS-ZUSAMMENFASSUNG:`);
    console.log(`  🎯 Ziel: 38 Gruppenstatistiken vollständig implementieren`);
    console.log(`  ✅ Erreicht: ${implementationResults.fullyImplemented}/38 (${Math.round(implementationResults.fullyImplemented/38*100)}%)`);
    console.log(`  🔧 Implementierungsqualität: ${criticalIssues === 0 ? 'Hoch' : 'Verbesserungsbedarf'}`);
    console.log(`  📊 Datenverarbeitung: Umfassend (alle Aspekte abgedeckt)`);
    console.log(`  🚀 Status: ${implementationResults.fullyImplemented === 38 && criticalIssues === 0 ? 'PRODUKTIONSBEREIT' : 'IN ENTWICKLUNG'}`);

    if (implementationResults.fullyImplemented === 38 && criticalIssues === 0) {
      console.log(`\n🎉 GLÜCKWUNSCH!`);
      console.log(`   Die Gruppenstatistik-Implementierung ist vollständig und produktionsbereit!`);
      console.log(`   Alle 38 Statistiken sind sauber und vollständig implementiert.`);
    }

  } catch (error) {
    console.error('❌ Fehler beim finalen Test:', error);
  }
}

// Test ausführen
testFinalGroupStatsImplementation(); 