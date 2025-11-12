#!/usr/bin/env node

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspect() {
  const playerId = 'b16c1120111b7d9e7d733837'; // Remo
  
  console.log('🔍 Inspect ALL Partner Stats for Remo...\n');
  
  const partnerStatsSnap = await db.collection(`players/${playerId}/partnerStats`).get();
  
  console.log(`Found ${partnerStatsSnap.size} partners:\n`);
  
  for (const doc of partnerStatsSnap.docs) {
    const data = doc.data();
    console.log('═══════════════════════════════════════');
    console.log(`Partner: ${data.partnerDisplayName || doc.id}`);
    console.log('═══════════════════════════════════════');
    console.log(JSON.stringify(data, null, 2));
    console.log('');
  }
  
  process.exit(0);
}

inspect();

