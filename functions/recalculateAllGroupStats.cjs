const admin = require('firebase-admin');
const path = require('path');

// --- Konfiguration ---
const serviceAccountPath = path.resolve(__dirname, './serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Import NACH der Initialisierung von admin
const { calculateGroupStatisticsInternal } = require('./lib/groupStatsCalculator');

const db = admin.firestore();

async function recalculateAllGroupStats() {
    console.log("Starte die Neuberechnung der Statistiken für ALLE Gruppen...");

    const groupsSnap = await db.collection('groups').get();
    
    if (groupsSnap.empty) {
        console.log("Keine Gruppen in der Datenbank gefunden.");
      return;
    }

    console.log(`Found ${groupsSnap.docs.length} groups. Processing each...`);

    for (const groupDoc of groupsSnap.docs) {
        const groupId = groupDoc.id;
        const groupName = groupDoc.data().name || 'Unbenannte Gruppe';
        
        try {
            console.log(`\n--- Neuberechnung für Gruppe: "${groupName}" (ID: ${groupId}) ---`);
        
            // Die interne Berechnungsfunktion aufrufen
            const newStats = await calculateGroupStatisticsInternal(groupId);
            
            // Die berechneten Statistiken in die 'groupComputedStats'-Collection schreiben
            const statsRef = db.collection('groupComputedStats').doc(groupId);
            await statsRef.set(newStats);
            
            console.log(`✅ Erfolgreich neue Statistiken für Gruppe "${groupName}" berechnet und gespeichert.`);
        
      } catch (error) {
            console.error(`❌ Fehler bei der Neuberechnung für Gruppe "${groupName}" (ID: ${groupId}):`, error);
      }
    }
}

recalculateAllGroupStats().then(() => {
    console.log("\nNeuberechnung für alle Gruppen abgeschlossen.");
    process.exit(0);
}).catch(error => {
    console.error("Ein schwerwiegender Fehler ist während des Skripts aufgetreten:", error);
    process.exit(1);
}); 