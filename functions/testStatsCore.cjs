const admin = require('firebase-admin');
const path = require('path');

// --- Konfiguration ---
const serviceAccountPath = path.resolve(__dirname, './serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Import der Kernlogik
const { calculateGroupStatisticsInternal } = require('./lib/groupStatsCalculator');

async function testStatisticsCore() {
    console.log("Starte Test der Statistik-Kernlogik...");
    
    try {
        // Teste Gruppenstatistiken für eine Gruppe mit Daten
        console.log("\n--- Test: Gruppenstatistiken für 'Testgruppe' ---");
        const groupStats = await calculateGroupStatisticsInternal('UYYJnqdIOhZlygFG2lMo');
        
        console.log("Gruppenstatistiken berechnet:");
        console.log(`- Mitglieder: ${groupStats.memberCount}`);
        console.log(`- Sessions: ${groupStats.sessionCount}`);
        console.log(`- Spiele: ${groupStats.gameCount}`);
        console.log(`- Spielzeit: ${groupStats.totalPlayTimeSeconds}s`);
        console.log(`- Spieler mit meisten Spielen: ${groupStats.playerWithMostGames?.length || 0} Einträge`);
        console.log(`- Teams mit höchster Gewinnrate: ${groupStats.teamWithHighestWinRateGame?.length || 0} Einträge`);
        
        // Speichere die Statistiken
        const db = admin.firestore();
        await db.collection('groupComputedStats').doc('UYYJnqdIOhZlygFG2lMo').set(groupStats);
        console.log("✅ Gruppenstatistiken erfolgreich gespeichert!");
        
        // Teste auch eine Gruppe ohne Daten
        console.log("\n--- Test: Gruppenstatistiken für leere Gruppe ---");
        const emptyGroupStats = await calculateGroupStatisticsInternal('Bsgfd7Qt5ez1Hh8ytZGc');
        console.log(`- Sessions: ${emptyGroupStats.sessionCount} (sollte 0 sein)`);
        console.log(`- Spiele: ${emptyGroupStats.gameCount} (sollte 0 sein)`);
        
        console.log("\n✅ Alle Tests erfolgreich abgeschlossen!");
        
    } catch (error) {
        console.error("❌ Fehler beim Test:", error);
    }
}

testStatisticsCore().then(() => {
    console.log("\nTest abgeschlossen.");
    process.exit(0);
}).catch(error => {
    console.error("Ein schwerwiegender Fehler ist während des Tests aufgetreten:", error);
    process.exit(1);
}); 