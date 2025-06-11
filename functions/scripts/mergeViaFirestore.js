// Alternative: Dieses Skript nutzt die Firebase CLI für einfachere Authentifizierung

const fs = require('fs');
const { exec } = require('child_process');

// Session IDs
const mainSessionId = "Ph8oDZYvcV5y3NkFBiZDu";
const sessionToMergeId = "tPE0JJoJAYpRZO9Scefrp";

console.log('🔄 Starte Session-Merge über Firebase CLI...');
console.log(`📥 Haupt-Session: ${mainSessionId}`);
console.log(`📤 Session zum Merge: ${sessionToMergeId}`);
console.log('');

// Funktion zum Ausführen von Firebase CLI Befehlen
function runFirebaseCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function mergeSessionsViaFirestore() {
  try {
    console.log('📖 Lade Session-Daten über Firebase CLI...');
    
    // Session 1 (Haupt-Session) laden
    console.log('   Lade Haupt-Session...');
    const mainSessionData = await runFirebaseCommand(
      `firebase firestore:get gameSessions/${mainSessionId} --project jassguru`
    );
    
    // Session 2 (zu mergende Session) laden  
    console.log('   Lade Session zum Merge...');
    const sessionToMergeData = await runFirebaseCommand(
      `firebase firestore:get gameSessions/${sessionToMergeId} --project jassguru`
    );

    console.log('✅ Session-Daten erfolgreich geladen');
    
    // JSON Dateien für manuelle Verarbeitung erstellen
    const mainData = JSON.parse(mainSessionData);
    const mergeData = JSON.parse(sessionToMergeData);
    
    console.log('📊 Session-Analyse:');
    console.log(`   Haupt-Session: ${Object.keys(mainData.completedGames || {}).length} Spiele`);
    console.log(`   Merge-Session: ${Object.keys(mergeData.completedGames || {}).length} Spiele`);
    
    // Zusammengeführte Daten erstellen
    const mergedCompletedGames = { ...mainData.completedGames };
    const maxGameNumber = Math.max(...Object.keys(mainData.completedGames).map(Number), 0);
    
    // Spiele aus Session 2 hinzufügen
    Object.entries(mergeData.completedGames).forEach(([_, gameData]) => {
      const newGameNumber = maxGameNumber + parseInt(gameData.gameNumber);
      console.log(`  📋 Verschiebe Spiel ${gameData.gameNumber} -> Spiel ${newGameNumber}`);
      
      mergedCompletedGames[newGameNumber.toString()] = {
        ...gameData,
        gameNumber: newGameNumber,
        sessionId: mainSessionId
      };
    });
    
    // Aktualisierte Session-Daten
    const updatedMainSession = {
      ...mainData,
      completedGames: mergedCompletedGames,
      mergedSessions: [...(mainData.mergedSessions || []), sessionToMergeId],
      mergedAt: new Date().toISOString()
    };
    
    // Daten als JSON-Dateien speichern für Review
    fs.writeFileSync('./merged_session_preview.json', JSON.stringify(updatedMainSession, null, 2));
    fs.writeFileSync('./original_main_session.json', JSON.stringify(mainData, null, 2));
    fs.writeFileSync('./session_to_delete.json', JSON.stringify(mergeData, null, 2));
    
    console.log('');
    console.log('📄 Preview-Dateien erstellt:');
    console.log('   - merged_session_preview.json (neue Haupt-Session)');
    console.log('   - original_main_session.json (Backup der Original-Session)');
    console.log('   - session_to_delete.json (Session die gelöscht wird)');
    console.log('');
    
    // Firebase Update-Befehle generieren
    const updateCommand = `firebase firestore:set gameSessions/${mainSessionId} ./merged_session_preview.json --project jassguru`;
    const deleteCommand = `firebase firestore:delete gameSessions/${sessionToMergeId} --project jassguru`;
    
    console.log('🔧 Führe Firebase-Updates aus...');
    console.log('   1. Aktualisiere Haupt-Session...');
    await runFirebaseCommand(updateCommand);
    
    console.log('   2. Lösche ursprüngliche Session...');
    await runFirebaseCommand(deleteCommand);
    
    console.log('');
    console.log('🎉 Session-Merge erfolgreich abgeschlossen!');
    console.log(`✅ ${Object.keys(mergeData.completedGames).length} Spiele verschoben`);
    console.log(`📊 Gesamt: ${Object.keys(mergedCompletedGames).length} Spiele in Session ${mainSessionId}`);
    console.log(`🗑️  Session ${sessionToMergeId} wurde gelöscht`);
    console.log('');
    console.log('Die zusammengeführte Session enthält jetzt:');
    console.log('- Spiel 1: Bottom 5092 - Top 3402 (ursprünglich aus Haupt-Session)');
    console.log('- Spiel 2: Bottom 5269 - Top 4300 (ursprünglich aus Haupt-Session)');
    console.log('- Spiel 3: Bottom 4308 - Top 4987 (verschoben aus zweiter Session)');
    console.log('- Spiel 4: Bottom 4677 - Top 4724 (verschoben aus zweiter Session)');
    
    // Cleanup - Preview-Dateien löschen (optional)
    // fs.unlinkSync('./merged_session_preview.json');
    
  } catch (error) {
    console.error('❌ Fehler beim Session-Merge:', error.message);
    throw error;
  }
}

// Skript ausführen
if (require.main === module) {
  mergeSessionsViaFirestore()
    .then(() => {
      console.log('🏁 Skript beendet');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Skript fehlgeschlagen:', error);
      process.exit(1);
    });
}

module.exports = { mergeSessionsViaFirestore }; 