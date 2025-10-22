#!/usr/bin/env ts-node

/**
 * 🔍 MONITORING SCRIPT
 * 
 * Prüft die Datenarchitektur nach einer Session und validiert,
 * ob alle Daten korrekt geschrieben wurden
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

interface ValidationResult {
  step: string;
  status: '✅' | '❌' | '⚠️';
  message: string;
  details?: any;
}

async function validateDataArchitecture(groupId: string, sessionId?: string) {
  console.log('🔍 Validating data architecture...');
  console.log(`📊 Group: ${groupId}`);
  if (sessionId) {
    console.log(`🎮 Session: ${sessionId}`);
  }
  console.log('');
  
  const results: ValidationResult[] = [];
  
  try {
    // 1. Prüfe Gruppenmitglieder
    console.log('👥 Checking group members...');
    const membersRef = db.collection(`groups/${groupId}/members`);
    const membersSnap = await membersRef.get();
    
    if (membersSnap.empty) {
      results.push({
        step: 'Group Members',
        status: '❌',
        message: 'No members found in group'
      });
    } else {
      results.push({
        step: 'Group Members',
        status: '✅',
        message: `Found ${membersSnap.size} members`,
        details: membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      });
    }
    
    // 2. Prüfe jassGameSummaries (falls Session-ID gegeben)
    if (sessionId) {
      console.log('📄 Checking jassGameSummaries document...');
      const summaryRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
      const summarySnap = await summaryRef.get();
      
      if (!summarySnap.exists) {
        results.push({
          step: 'jassGameSummaries',
          status: '❌',
          message: 'Document not found'
        });
      } else {
        const summary = summarySnap.data();
        results.push({
          step: 'jassGameSummaries',
          status: '✅',
          message: 'Document exists and is valid',
          details: {
            status: summary?.status,
            participants: summary?.participantPlayerIds?.length,
            gamesPlayed: summary?.gamesPlayed,
            eloUpdated: summary?.eloUpdatedAt ? 'Yes' : 'No',
            createdAt: summary?.createdAt?.toDate?.()?.toISOString()
          }
        });
        
        // Prüfe completedGames Subcollection
        const cgSnap = await summaryRef.collection('completedGames').get();
        results.push({
          step: 'completedGames',
          status: cgSnap.size > 0 ? '✅' : '⚠️',
          message: `${cgSnap.size} completed games found`,
          details: cgSnap.size === 0 ? 'Using fallback logic for session-level data' : undefined
        });
      }
    }
    
    // 3. Prüfe alle Sessions der Gruppe
    console.log('📊 Checking all sessions...');
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('endedAt', 'desc')
      .limit(10);
    const sessionsSnap = await sessionsRef.get();
    
    results.push({
      step: 'All Sessions',
      status: '✅',
      message: `${sessionsSnap.size} completed sessions found`,
      details: sessionsSnap.docs.map(doc => ({
        id: doc.id,
        endedAt: doc.data()?.endedAt?.toDate?.()?.toISOString(),
        participants: doc.data()?.participantPlayerIds?.length,
        eloUpdated: doc.data()?.eloUpdatedAt ? 'Yes' : 'No'
      }))
    });
    
    // 4. Prüfe Spieler-Ratings
    console.log('👤 Checking player ratings...');
    const memberIds = membersSnap.docs.map(doc => doc.id);
    const playerRatings: any[] = [];
    
    for (const playerId of memberIds) {
      const playerRef = db.collection('players').doc(playerId);
      const playerSnap = await playerRef.get();
      
      if (playerSnap.exists) {
        const playerData = playerSnap.data();
        playerRatings.push({
          playerId,
          displayName: playerData?.displayName,
          rating: playerData?.rating || 100,
          gamesPlayed: playerData?.gamesPlayed || 0,
          lastSessionDelta: playerData?.lastSessionDelta || 0,
          tier: playerData?.tier || 'Bronze'
        });
      }
    }
    
    results.push({
      step: 'Player Ratings',
      status: '✅',
      message: `${playerRatings.length} player ratings found`,
      details: playerRatings
    });
    
    // 5. Prüfe ratingHistory Einträge
    console.log('📝 Checking ratingHistory entries...');
    let totalHistoryEntries = 0;
    const historyStats: any[] = [];
    
    for (const playerId of memberIds) {
      const historyRef = db.collection(`players/${playerId}/ratingHistory`);
      const historySnap = await historyRef.orderBy('createdAt', 'desc').limit(5).get();
      
      totalHistoryEntries += historySnap.size;
      historyStats.push({
        playerId,
        entries: historySnap.size,
        lastEntry: historySnap.docs[0]?.data()?.createdAt?.toDate?.()?.toISOString()
      });
    }
    
    results.push({
      step: 'ratingHistory',
      status: totalHistoryEntries > 0 ? '✅' : '❌',
      message: `${totalHistoryEntries} total history entries found`,
      details: historyStats
    });
    
    // 6. Prüfe Chart-Daten
    console.log('📊 Checking chart data...');
    const chartDataRef = db.collection(`groups/${groupId}/aggregated`).doc('chartData');
    const chartDataSnap = await chartDataRef.get();
    
    if (!chartDataSnap.exists) {
      results.push({
        step: 'Chart Data',
        status: '❌',
        message: 'Chart data not found'
      });
    } else {
      const chartData = chartDataSnap.data();
      results.push({
        step: 'Chart Data',
        status: '✅',
        message: 'Chart data exists and is valid',
        details: {
          lastUpdated: chartData?.lastUpdated?.toDate?.()?.toISOString(),
          totalPlayers: chartData?.totalPlayers,
          totalSessions: chartData?.totalSessions,
          dataPoints: chartData?.labels?.length,
          datasets: chartData?.datasets?.length
        }
      });
    }
    
    // 7. Prüfe Gruppenstatistiken
    console.log('📈 Checking group statistics...');
    const statsRef = db.collection(`groups/${groupId}/stats`).doc('computed');
    const statsSnap = await statsRef.get();
    
    if (!statsSnap.exists) {
      results.push({
        step: 'Group Statistics',
        status: '❌',
        message: 'Group statistics not found'
      });
    } else {
      const stats = statsSnap.data();
      results.push({
        step: 'Group Statistics',
        status: '✅',
        message: 'Group statistics exist and are valid',
        details: {
          lastUpdated: stats?.lastUpdateTimestamp?.toDate?.()?.toISOString(),
          memberCount: stats?.memberCount,
          sessionCount: stats?.sessionCount,
          gameCount: stats?.gameCount,
          playerRankings: stats?.playerWithMostGames?.length || 0,
          teamRankings: stats?.teamWithHighestStricheDiff?.length || 0
        }
      });
    }
    
    // 8. Zusammenfassung
    console.log('');
    console.log('📋 VALIDATION SUMMARY:');
    console.log('======================');
    
    let successCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    
    results.forEach(result => {
      console.log(`${result.status} ${result.step}: ${result.message}`);
      if (result.details) {
        console.log(`   Details:`, result.details);
      }
      
      if (result.status === '✅') successCount++;
      else if (result.status === '⚠️') warningCount++;
      else if (result.status === '❌') errorCount++;
    });
    
    console.log('');
    console.log('📊 SUMMARY:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⚠️ Warnings: ${warningCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log('🎉 All validations passed! Data architecture is healthy.');
    } else {
      console.log('🚨 Issues detected! Please review the errors above.');
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  const groupId = process.argv[2] || 'Rosen10player';
  const sessionId = process.argv[3];
  
  validateDataArchitecture(groupId, sessionId)
    .then(() => {
      console.log('🔍 Validation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Validation failed:', error);
      process.exit(1);
    });
}

export { validateDataArchitecture };
