#!/usr/bin/env node

/**
 * Inspect Partner Stats aus neuer Struktur
 */

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
  const playerId = '1sDvqN_kvqZLB-4eSZFqZ'; // Marc
  const partnerId = '9K2d1OQ1mCXddko7ft6y';
  
  console.log('🔍 Inspect Partner Stats...\n');
  
  const partnerDoc = await db.doc(`players/${playerId}/partnerStats/${partnerId}`).get();
  
  if (partnerDoc.exists) {
    const data = partnerDoc.data();
    console.log('Partner Data:', JSON.stringify(data, null, 2));
  } else {
    console.log('❌ Partner Stats not found');
  }
  
  process.exit(0);
}

inspect();

