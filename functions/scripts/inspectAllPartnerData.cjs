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
  const partnerId = '1sDvqN_kvqZLB-4eSZFqZ';
  
  console.log('🔍 Inspect COMPLETE Partner Stats for Remo...\n');
  
  const partnerDoc = await db.doc(`players/${playerId}/partnerStats/${partnerId}`).get();
  
  if (partnerDoc.exists) {
    const data = partnerDoc.data();
    console.log('Partner Data:', JSON.stringify(data, null, 2));
  } else {
    console.log('❌ Partner Stats not found');
  }
  
  // Also check playerComputedStats for comparison
  console.log('\n📊 Old playerComputedStats (for comparison):\n');
  const oldStatsDoc = await db.collection('playerComputedStats').doc(playerId).get();
  if (oldStatsDoc.exists) {
    const oldData = oldStatsDoc.data();
    console.log('Old partnerAggregates:', oldData.partnerAggregates?.find(p => p.partnerId === partnerId));
  }
  
  process.exit(0);
}

inspect();

