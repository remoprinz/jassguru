#!/usr/bin/env node

/**
 * Repariert den displayName für User "Fabinski" 
 * Synchronisiert von users-Dokument zu players-Dokument
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

async function fixFabinskiDisplayName() {
  const userId = "zDntgLnirGboVYbGCqQtMXXg8Kh1";
  const playerId = "NEROr2WAYG41YEiV9v4ba";
  
  try {
    // 1. Lese users-Dokument
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists()) {
      console.error('❌ User-Dokument nicht gefunden!');
      return;
    }
    
    const userData = userDoc.data();
    const correctDisplayName = userData.displayName;
    console.log(`📝 Korrekter DisplayName aus users-Dokument: "${correctDisplayName}"`);
    
    // 2. Aktualisiere players-Dokument
    await db.collection('players').doc(playerId).update({
      displayName: correctDisplayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Player-Dokument ${playerId} aktualisiert mit DisplayName: "${correctDisplayName}"`);
    
    // 3. Prüfe Ergebnis
    const updatedPlayerDoc = await db.collection('players').doc(playerId).get();
    const updatedData = updatedPlayerDoc.data();
    console.log(`🔍 Verifikation - neuer DisplayName: "${updatedData.displayName}"`);
    
  } catch (error) {
    console.error('❌ Fehler bei der Reparatur:', error);
  }
}

fixFabinskiDisplayName().then(() => {
  console.log('🎉 Reparatur abgeschlossen!');
  process.exit(0);
});
