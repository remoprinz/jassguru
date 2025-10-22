#!/usr/bin/env ts-node

/**
 * 🔍 DIAGNOSE SCRIPT
 * 
 * Analysiert das jassGameSummaries Dokument vom 20. Oktober 2025
 * und zeigt detaillierte Informationen über das Problem
 */

import * as admin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';

// Firebase Admin SDK initialisieren
if (!admin.apps.length) {
  initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function diagnoseProblem() {
  console.log('🔍 Diagnosing missing rating history problem...');
  console.log('');
  
  const sessionId = 'kFI60_GTBnYADP7BQZSg9';
  const groupId = 'Rosen10player';
  
  try {
    // 1. Prüfe jassGameSummaries Dokument
    console.log('📄 Checking jassGameSummaries document...');
    const summaryRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
    const summarySnap = await summaryRef.get();
    
    if (!summarySnap.exists) {
      console.error(`❌ Document ${sessionId} not found in group ${groupId}`);
      return;
    }
    
    const summary = summarySnap.data();
    console.log('✅ Document exists');
    console.log(`   Status: ${summary?.status}`);
    console.log(`   Created: ${summary?.createdAt?.toDate?.()?.toISOString()}`);
    console.log(`   Ended: ${summary?.endedAt?.toDate?.()?.toISOString()}`);
    console.log(`   Participants: ${summary?.participantPlayerIds?.length || 0}`);
    console.log(`   Games: ${summary?.gamesPlayed || 0}`);
    console.log(`   Elo Updated: ${summary?.eloUpdatedAt ? 'Yes' : 'No'}`);
    console.log('');
    
    // 2. Prüfe completedGames Subcollection
    console.log('🎮 Checking completedGames subcollection...');
    const cgSnap = await summaryRef.collection('completedGames').get();
    console.log(`   Completed games: ${cgSnap.size}`);
    
    if (cgSnap.size === 0) {
      console.log('⚠️ No completedGames subcollection found - this is the problem!');
    }
    console.log('');
    
    // 3. Prüfe Session-Level Daten
    console.log('📊 Checking session-level data...');
    console.log(`   gameResults: ${Array.isArray(summary?.gameResults) ? summary.gameResults.length : 'Not found'}`);
    console.log(`   finalStriche: ${summary?.finalStriche ? 'Found' : 'Not found'}`);
    console.log(`   teams: ${summary?.teams ? 'Found' : 'Not found'}`);
    console.log('');
    
    // 4. Prüfe Team-Struktur
    console.log('👥 Checking team structure...');
    const topPlayers = summary?.teams?.top?.players?.map((p: any) => p.playerId) || [];
    const bottomPlayers = summary?.teams?.bottom?.players?.map((p: any) => p.playerId) || [];
    console.log(`   Top players: ${topPlayers.length} (${topPlayers.join(', ')})`);
    console.log(`   Bottom players: ${bottomPlayers.length} (${bottomPlayers.join(', ')})`);
    console.log(`   Valid structure: ${topPlayers.length === 2 && bottomPlayers.length === 2 ? 'Yes' : 'No'}`);
    console.log('');
    
    // 5. Prüfe Spieler-Ratings
    console.log('📈 Checking player ratings...');
    const allPlayers = [...topPlayers, ...bottomPlayers];
    for (const playerId of allPlayers) {
      const playerRef = db.collection('players').doc(playerId);
      const playerSnap = await playerRef.get();
      
      if (playerSnap.exists) {
        const playerData = playerSnap.data();
        console.log(`   ${playerId}: Rating ${playerData?.rating || 100}, Games ${playerData?.gamesPlayed || 0}`);
      } else {
        console.log(`   ${playerId}: Not found`);
      }
    }
    console.log('');
    
    // 6. Prüfe ratingHistory Einträge
    console.log('📝 Checking ratingHistory entries...');
    for (const playerId of allPlayers) {
      const historyRef = db.collection(`players/${playerId}/ratingHistory`);
      const historySnap = await historyRef
        .where('sessionId', '==', sessionId)
        .get();
      
      console.log(`   ${playerId}: ${historySnap.size} entries for this session`);
      
      if (historySnap.size === 0) {
        console.log(`   ⚠️ No ratingHistory entries found for ${playerId} - this confirms the problem!`);
      }
    }
    console.log('');
    
    // 7. Prüfe Chart-Daten
    console.log('📊 Checking chart data...');
    const chartDataRef = db.collection(`groups/${groupId}/chartData`).doc('eloProgression');
    const chartDataSnap = await chartDataRef.get();
    
    if (chartDataSnap.exists) {
      const chartData = chartDataSnap.data();
      console.log(`   Chart data exists: Yes`);
      console.log(`   Last updated: ${chartData?.lastUpdated?.toDate?.()?.toISOString()}`);
      console.log(`   Data points: ${chartData?.dataPointCount || 0}`);
      console.log(`   Players: ${chartData?.playerCount || 0}`);
    } else {
      console.log(`   Chart data exists: No`);
    }
    console.log('');
    
    // 8. Zusammenfassung
    console.log('📋 DIAGNOSIS SUMMARY:');
    console.log('====================');
    console.log(`✅ jassGameSummaries document exists`);
    console.log(`${cgSnap.size === 0 ? '❌' : '✅'} completedGames subcollection: ${cgSnap.size} entries`);
    console.log(`${Array.isArray(summary?.gameResults) ? '✅' : '❌'} gameResults array: ${Array.isArray(summary?.gameResults) ? summary.gameResults.length : 0} entries`);
    console.log(`${summary?.finalStriche ? '✅' : '❌'} finalStriche data: ${summary?.finalStriche ? 'Found' : 'Missing'}`);
    console.log(`${topPlayers.length === 2 && bottomPlayers.length === 2 ? '✅' : '❌'} Team structure: Valid`);
    console.log(`${summary?.eloUpdatedAt ? '✅' : '❌'} Elo updated: ${summary?.eloUpdatedAt ? 'Yes' : 'No'}`);
    console.log('');
    
    // 9. Empfehlung
    console.log('💡 RECOMMENDATION:');
    console.log('==================');
    if (cgSnap.size === 0 && Array.isArray(summary?.gameResults) && summary?.finalStriche) {
      console.log('🔧 Run the fix script to repair missing ratingHistory entries');
      console.log('   Command: npx ts-node scripts/masterFix.ts');
    } else {
      console.log('⚠️ Manual investigation required - data structure issues detected');
    }
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  diagnoseProblem()
    .then(() => {
      console.log('🔍 Diagnosis completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Diagnosis failed:', error);
      process.exit(1);
    });
}

export { diagnoseProblem };
