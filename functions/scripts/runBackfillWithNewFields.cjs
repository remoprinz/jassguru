#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Lade das Hauptscript
const { runBackfill } = require('./backfillPartnerOpponentStats.cjs');

(async () => {
  try {
    console.log('\n🚀 STARTE BACKFILL MIT NEUEN FELDERN (Rundentempo & Trumpfansagen)...\n');
    
    await runBackfill();
    
    console.log('\n✅ BACKFILL ABGESCHLOSSEN!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    process.exit(1);
  }
})();
