const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Firebase Admin MUSS ZUERST initialisiert werden
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ERST DANACH darf der Calculator importiert werden, da er auf die initialisierte App zugreift
const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');

async function recalculateGroupStats() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  console.log(`🔄 Starte FINALE, KORRIGIERTE Neuberechnung für Gruppe ${groupId}...`);
  
  try {
    await updateGroupComputedStatsAfterSession(groupId);
    console.log(`✅ Statistiken für Gruppe ${groupId} erfolgreich und vollständig neu berechnet!`);
  } catch (error) {
    console.error(`❌ Fehler bei der Neuberechnung:`, error);
  }
  
  // Warten Sie kurz, damit die Logs durchlaufen können, bevor der Prozess beendet wird.
  setTimeout(() => process.exit(0), 2000);
}

recalculateGroupStats(); 