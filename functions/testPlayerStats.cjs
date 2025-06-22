const admin = require('firebase-admin');
const path = require('path');

// --- Konfiguration ---
const serviceAccountPath = path.resolve(__dirname, './serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Import NACH der Initialisierung von admin
const { recalculateAllPlayerStatistics } = require('./lib/playerStatsRecalculation');

async function testPlayerStatsRecalculation() {
    console.log("Starte Test der Spielerstatistik-Neuberechnung...");
    
    try {
        // Erstelle einen Test-User und setze Admin-Claims
        const testUser = await admin.auth().createUser({
            uid: 'test-admin-uid-' + Date.now(),
            email: 'test-admin@example.com'
        });
        
        await admin.auth().setCustomUserClaims(testUser.uid, { admin: true });
        
        // Simuliere einen Admin-Request
        const mockRequest = {
            auth: {
                uid: testUser.uid
            }
        };
        
        const result = await recalculateAllPlayerStatistics(mockRequest);
        console.log("✅ Spielerstatistik-Neuberechnung erfolgreich:", result);
        
        // Cleanup: Lösche den Test-User
        await admin.auth().deleteUser(testUser.uid);
        
    } catch (error) {
        console.error("❌ Fehler bei der Spielerstatistik-Neuberechnung:", error);
    }
}

testPlayerStatsRecalculation().then(() => {
    console.log("\nTest abgeschlossen.");
    process.exit(0);
}).catch(error => {
    console.error("Ein schwerwiegender Fehler ist während des Tests aufgetreten:", error);
    process.exit(1);
}); 