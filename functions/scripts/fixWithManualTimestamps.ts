import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Korrigiert mit manuellen Timestamps aus den completedGames Daten
 */
async function fixWithManualTimestamps() {
  const sessionId = 'XRZov4VU7tuM_0GBmYoWw';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  console.log('🔧 Fixing with MANUAL timestamps...\n');
  
  // Manuelle Timestamps aus den completedGames Daten
  const gameTimestamps = {
    1: new Date('2025-10-23T18:18:05.000Z'), // 23. Oktober 2025 um 20:18:05 UTC+2
    2: new Date('2025-10-23T19:26:15.000Z'), // 23. Oktober 2025 um 21:26:15 UTC+2
    3: new Date('2025-10-23T20:53:23.000Z'), // 23. Oktober 2025 um 22:53:23 UTC+2
    4: new Date('2025-10-23T22:11:27.000Z'), // 24. Oktober 2025 um 00:11:27 UTC+2
  };
  
  // Korrekte Elo-Werte
  const correctFinalRatings = {
    'b16c1120111b7d9e7d733837': { // Remo
      gameByGameRatings: [
        { gameNumber: 1, rating: 144.32, delta: 6.17 },
        { gameNumber: 2, rating: 137.60, delta: -6.72 },
        { gameNumber: 3, rating: 131.85, delta: -5.75 },
        { gameNumber: 4, rating: 139.46, delta: 7.61 }
      ]
    },
    'F1uwdthL6zu7F0cYf1jbe': { // Frank
      gameByGameRatings: [
        { gameNumber: 1, rating: 79.62, delta: 6.17 },
        { gameNumber: 2, rating: 72.90, delta: -6.72 },
        { gameNumber: 3, rating: 67.15, delta: -5.75 },
        { gameNumber: 4, rating: 74.76, delta: 7.61 }
      ]
    },
    '9K2d1OQ1mCXddko7ft6y': { // Michael
      gameByGameRatings: [
        { gameNumber: 1, rating: 109.28, delta: -6.17 },
        { gameNumber: 2, rating: 116.00, delta: 6.72 },
        { gameNumber: 3, rating: 121.75, delta: 5.75 },
        { gameNumber: 4, rating: 114.14, delta: -7.61 }
      ]
    },
    'TPBwj8bP9W59n5LoGWP5': { // Schmuudii
      gameByGameRatings: [
        { gameNumber: 1, rating: 93.83, delta: -6.17 },
        { gameNumber: 2, rating: 100.55, delta: 6.72 },
        { gameNumber: 3, rating: 106.30, delta: 5.75 },
        { gameNumber: 4, rating: 98.69, delta: -7.61 }
      ]
    }
  };
  
  console.log('📊 GAME TIMESTAMPS:');
  for (const [gameNum, timestamp] of Object.entries(gameTimestamps)) {
    console.log(`  Spiel ${gameNum}: ${timestamp.toISOString()}`);
  }
  
  // Update ratingHistory
  console.log('\n📝 Updating ratingHistory with REAL timestamps...');
  
  for (const [playerId, data] of Object.entries(correctFinalRatings)) {
    for (const gameData of data.gameByGameRatings) {
      const gameNumber = gameData.gameNumber;
      const realTimestamp = gameTimestamps[gameNumber as keyof typeof gameTimestamps];
      
      if (!realTimestamp) {
        console.log(`⚠️ No timestamp for game ${gameNumber}`);
        continue;
      }
      
      // Finde den Entry für dieses Spiel
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
        .where('sessionId', '==', sessionId)
        .where('gameNumber', '==', gameNumber)
        .where('eventType', '==', 'game')
        .get();
      
      if (historySnap.empty) {
        console.log(`⚠️ No entry found for player ${playerId.slice(0,8)}... game ${gameNumber}`);
        continue;
      }
      
      const doc = historySnap.docs[0];
      await doc.ref.update({
        completedAt: admin.firestore.Timestamp.fromDate(realTimestamp),
        rating: gameData.rating,
        delta: gameData.delta
      });
      
      console.log(`   ✅ ${playerId.slice(0,8)}... Spiel ${gameNumber}: ${realTimestamp.toISOString()} → Rating ${gameData.rating.toFixed(2)}`);
    }
  }
  
  // Regeneriere chartData_elo
  console.log('\n📝 Regenerating chartData_elo...');
  await regenerateChartData(groupId);
  
  console.log('\n🎉 DONE! All timestamps and chart data updated!');
}

async function regenerateChartData(groupId: string) {
  const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
    .orderBy('completedAt', 'asc')
    .get();
  
  const allLabels = new Set<string>();
  const playerDataMap = new Map<string, any[]>();
  
  for (const doc of sessionsSnap.docs) {
    const sessionData = doc.data();
    const playerFinalRatings = sessionData.playerFinalRatings || {};
    const sessionDate = sessionData.completedAt?.toDate?.() || new Date();
    const label = sessionDate.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit', 
      year: '2-digit' 
    });
    
    allLabels.add(label);
    
    for (const [playerId, ratingData] of Object.entries(playerFinalRatings)) {
      if (!playerDataMap.has(playerId)) {
        playerDataMap.set(playerId, []);
      }
      
      const data = ratingData as any;
      if (data && typeof data.rating === 'number') {
        playerDataMap.get(playerId)!.push({
          label,
          rating: data.rating
        });
      }
    }
  }
  
  const sortedLabels = Array.from(allLabels).sort((a, b) => {
    const [dayA, monthA, yearA] = a.split('.');
    const [dayB, monthB, yearB] = b.split('.');
    const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
    const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
    return dateA.getTime() - dateB.getTime();
  });
  
  const colors = [
    { bg: 'rgba(5, 150, 105, 0.1)', border: '#059669' },
    { bg: 'rgba(234, 88, 12, 0.1)', border: '#ea580c' },
    { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6' },
    { bg: 'rgba(220, 38, 38, 0.1)', border: '#dc2626' },
    { bg: 'rgba(147, 51, 234, 0.1)', border: '#9333ea' },
    { bg: 'rgba(236, 72, 153, 0.1)', border: '#ec4899' },
    { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b' },
    { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981' },
    { bg: 'rgba(139, 92, 246, 0.1)', border: '#8b5cf6' },
    { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444' },
  ];
  
  const datasets = [];
  let colorIndex = 0;
  
  for (const [playerId, dataPoints] of playerDataMap.entries()) {
    const memberDoc = await db.doc(`groups/${groupId}/members/${playerId}`).get();
    const memberData = memberDoc.data();
    const displayName = memberData?.displayName || `Spieler_${playerId.slice(0, 6)}`;
    
    const data = sortedLabels.map(label => {
      const dataPoint = dataPoints.find(d => d.label === label);
      return dataPoint ? dataPoint.rating : null;
    });
    
    const color = colors[colorIndex % colors.length];
    colorIndex++;
    
    datasets.push({
      label: displayName,
      data,
      backgroundColor: color.bg,
      borderColor: color.border,
      playerId,
      displayName,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.1,
      spanGaps: true,
    });
  }
  
  datasets.sort((a, b) => {
    const aLast = a.data.filter((d: any) => d !== null).pop() || 0;
    const bLast = b.data.filter((d: any) => d !== null).pop() || 0;
    return bLast - aLast;
  });
  
  const chartData = {
    datasets,
    labels: sortedLabels,
    lastUpdated: admin.firestore.Timestamp.now(),
    totalPlayers: datasets.length,
    totalSessions: sortedLabels.length,
  };
  
  await db.doc(`groups/${groupId}/aggregated/chartData_elo`).set(chartData);
  console.log('✅ chartData_elo regenerated!');
}

fixWithManualTimestamps()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

