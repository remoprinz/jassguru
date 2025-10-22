#!/usr/bin/env ts-node

/**
 * 🔧 MASTER FIX DIRECT SCRIPT
 * 
 * Ruft die masterFix Logik direkt auf, ohne über die Cloud Function zu gehen
 */

import * as admin from 'firebase-admin';

// Firebase Admin SDK initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function directMasterFix(groupId: string, sessionId: string) {
  console.log('🔧 Direct Master Fix started...');
  console.log(`📊 Group: ${groupId}`);
  console.log(`🎮 Session: ${sessionId}`);
  
  try {
    // 1. Hole Session-Daten
    const summaryRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
    const summarySnap = await summaryRef.get();
    
    if (!summarySnap.exists) {
      console.log('❌ Session not found');
      return;
    }
    
    const summary = summarySnap.data();
    const participantPlayerIds = summary?.participantPlayerIds || [];
    
    console.log('✅ Session found:', {
      status: summary?.status,
      participants: participantPlayerIds.length,
      gamesPlayed: summary?.gamesPlayed,
      eloUpdated: summary?.eloUpdatedAt ? 'Yes' : 'No'
    });
    
    if (participantPlayerIds.length === 0) {
      console.log('⚠️ No participants found, skipping');
      return;
    }
    
    // 2. Prüfe, ob ratingHistory Einträge fehlen
    let needsFix = false;
    for (const playerId of participantPlayerIds) {
      const historyRef = db.collection(`players/${playerId}/ratingHistory`);
      const historySnap = await historyRef
        .where('sessionId', '==', sessionId)
        .limit(1)
        .get();
      
      if (historySnap.empty) {
        needsFix = true;
        console.log(`❌ Missing ratingHistory for player: ${playerId}`);
      } else {
        console.log(`✅ Found ratingHistory for player: ${playerId}`);
      }
    }
    
    if (!needsFix) {
      console.log('✅ All ratingHistory entries exist, no fix needed');
      return;
    }
    
    console.log('🔧 RatingHistory entries missing, starting fix...');
    
    // 3. Importiere und führe updateEloForSession aus
    console.log('📊 Running updateEloForSession...');
    const { updateEloForSession } = await import('../src/jassEloUpdater');
    await updateEloForSession(groupId, sessionId);
    console.log('✅ updateEloForSession completed');
    
    // 4. Importiere und führe saveRatingHistorySnapshot aus
    console.log('📝 Running saveRatingHistorySnapshot...');
    const { saveRatingHistorySnapshot } = await import('../src/ratingHistoryService');
    await saveRatingHistorySnapshot(
      groupId,
      sessionId,
      participantPlayerIds,
      'session_end'
    );
    console.log('✅ saveRatingHistorySnapshot completed');
    
    // 5. Aktualisiere Chart-Daten
    console.log('📊 Updating chart data...');
    const { saveChartDataSnapshot } = await import('../src/chartDataService');
    await saveChartDataSnapshot(groupId);
    console.log('✅ Chart data updated');
    
    console.log('🎉 Master Fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Master Fix failed:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  const groupId = process.argv[2] || 'Rosen10player';
  const sessionId = process.argv[3] || 'kFI60_GTBnYADP7BQZSg9';
  
  directMasterFix(groupId, sessionId)
    .then(() => {
      console.log('🔧 Direct Master Fix completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Direct Master Fix failed:', error);
      process.exit(1);
    });
}

export { directMasterFix };
