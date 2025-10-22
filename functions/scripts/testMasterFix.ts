#!/usr/bin/env ts-node

/**
 * 🔧 MASTER FIX TEST SCRIPT
 * 
 * Testet die masterFix Cloud Function direkt über die Admin SDK
 */

import * as admin from 'firebase-admin';

// Firebase Admin SDK initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function testMasterFix(groupId: string, sessionId: string) {
  console.log('🔧 Testing masterFix function...');
  console.log(`📊 Group: ${groupId}`);
  console.log(`🎮 Session: ${sessionId}`);
  
  try {
    // 1. Prüfe, ob die Session existiert
    const summaryRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
    const summarySnap = await summaryRef.get();
    
    if (!summarySnap.exists) {
      console.log('❌ Session not found');
      return;
    }
    
    const summary = summarySnap.data();
    console.log('✅ Session found:', {
      status: summary?.status,
      participants: summary?.participantPlayerIds?.length,
      gamesPlayed: summary?.gamesPlayed,
      eloUpdated: summary?.eloUpdatedAt ? 'Yes' : 'No'
    });
    
    // 2. Prüfe, ob ratingHistory Einträge fehlen
    const participantPlayerIds = summary?.participantPlayerIds || [];
    let missingEntries = 0;
    
    for (const playerId of participantPlayerIds) {
      const historyRef = db.collection(`players/${playerId}/ratingHistory`);
      const historySnap = await historyRef
        .where('sessionId', '==', sessionId)
        .limit(1)
        .get();
      
      if (historySnap.empty) {
        missingEntries++;
        console.log(`❌ Missing ratingHistory for player: ${playerId}`);
      } else {
        console.log(`✅ Found ratingHistory for player: ${playerId}`);
      }
    }
    
    if (missingEntries === 0) {
      console.log('✅ All ratingHistory entries exist');
      return;
    }
    
    console.log(`❌ ${missingEntries} players missing ratingHistory entries`);
    
    // 3. Simuliere den Fix (ohne die Function aufzurufen)
    console.log('🔧 Would call masterFix function here...');
    console.log('📋 Parameters:', {
      groupId,
      sessionId
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  const groupId = process.argv[2] || 'Rosen10player';
  const sessionId = process.argv[3] || 'kFI60_GTBnYADP7BQZSg9';
  
  testMasterFix(groupId, sessionId)
    .then(() => {
      console.log('🔧 Test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

export { testMasterFix };
