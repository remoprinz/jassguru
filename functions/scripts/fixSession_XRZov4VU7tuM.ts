import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Script zum Korrigieren der fehlerhaften Session XRZov4VU7tuM_0GBmYoWw
 * 
 * PROBLEM: Die Session wurde mit der alten Elo-Berechnung verarbeitet
 * LÖSUNG: Manuell korrigierte Werte basierend auf korrekter Elo-Berechnung
 */
async function fixSession() {
  const sessionId = 'XRZov4VU7tuM_0GBmYoWw';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  console.log('🔧 FIXING SESSION:', sessionId);
  
  // Korrekte finale Elo-Werte (manuell berechnet)
  const correctFinalRatings = {
    'b16c1120111b7d9e7d733837': { // Remo
      rating: 139.46,
      ratingDelta: 1.31,
      gamesPlayed: 4,
      gameByGameRatings: [
        { gameNumber: 1, rating: 144.32, delta: 6.17 },
        { gameNumber: 2, rating: 137.60, delta: -6.72 },
        { gameNumber: 3, rating: 131.85, delta: -5.75 },
        { gameNumber: 4, rating: 139.46, delta: 7.61 }
      ]
    },
    'F1uwdthL6zu7F0cYf1jbe': { // Frank
      rating: 74.76,
      ratingDelta: 1.31,
      gamesPlayed: 4,
      gameByGameRatings: [
        { gameNumber: 1, rating: 79.62, delta: 6.17 },
        { gameNumber: 2, rating: 72.90, delta: -6.72 },
        { gameNumber: 3, rating: 67.15, delta: -5.75 },
        { gameNumber: 4, rating: 74.76, delta: 7.61 }
      ]
    },
    '9K2d1OQ1mCXddko7ft6y': { // Michael
      rating: 114.14,
      ratingDelta: -1.31,
      gamesPlayed: 4,
      gameByGameRatings: [
        { gameNumber: 1, rating: 109.28, delta: -6.17 },
        { gameNumber: 2, rating: 116.00, delta: 6.72 },
        { gameNumber: 3, rating: 121.75, delta: 5.75 },
        { gameNumber: 4, rating: 114.14, delta: -7.61 }
      ]
    },
    'TPBwj8bP9W59n5LoGWP5': { // Schmuudii
      rating: 98.69,
      ratingDelta: -1.31,
      gamesPlayed: 4,
      gameByGameRatings: [
        { gameNumber: 1, rating: 93.83, delta: -6.17 },
        { gameNumber: 2, rating: 100.55, delta: 6.72 },
        { gameNumber: 3, rating: 106.30, delta: 5.75 },
        { gameNumber: 4, rating: 98.69, delta: -7.61 }
      ]
    }
  };
  
  try {
    // 1. Update jassGameSummaries playerFinalRatings
    console.log('\n📝 1. Updating jassGameSummaries...');
    const sessionRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
    const playerFinalRatings: any = {};
    
    for (const [playerId, data] of Object.entries(correctFinalRatings)) {
      playerFinalRatings[playerId] = {
        rating: data.rating,
        ratingDelta: data.ratingDelta,
        gamesPlayed: data.gamesPlayed
      };
    }
    
    await sessionRef.update({ playerFinalRatings });
    console.log('✅ jassGameSummaries updated');
    
    // 2. Update players/{playerId} globalRating
    console.log('\n📝 2. Updating player globalRatings...');
    for (const [playerId, data] of Object.entries(correctFinalRatings)) {
      await db.doc(`players/${playerId}`).update({
        globalRating: data.rating,
        lastSessionDelta: data.ratingDelta
      });
      console.log(`   ✅ Player ${playerId.slice(0, 8)}... → ${data.rating.toFixed(2)}`);
    }
    
    // 3. Update ratingHistory Einträge
    console.log('\n📝 3. Updating ratingHistory entries...');
    for (const [playerId, data] of Object.entries(correctFinalRatings)) {
      // Hole alle Einträge dieser Session
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
        .where('sessionId', '==', sessionId)
        .where('eventType', '==', 'game')
        .get();
      
      // Sortiere nach gameNumber
      const entries = historySnap.docs.sort((a, b) => {
        return (a.data().gameNumber || 0) - (b.data().gameNumber || 0);
      });
      
      // Update jeden Eintrag
      for (let i = 0; i < entries.length && i < data.gameByGameRatings.length; i++) {
        const doc = entries[i];
        const correctData = data.gameByGameRatings[i];
        
        await doc.ref.update({
          rating: correctData.rating,
          delta: correctData.delta
        });
        
        console.log(`   ✅ ${playerId.slice(0, 8)}... Spiel ${correctData.gameNumber}: ${correctData.rating.toFixed(2)} (${correctData.delta > 0 ? '+' : ''}${correctData.delta.toFixed(2)})`);
      }
      
      // Lösche session_end Eintrag falls vorhanden
      const sessionEndSnap = await db.collection(`players/${playerId}/ratingHistory`)
        .where('sessionId', '==', sessionId)
        .where('eventType', '==', 'session_end')
        .get();
      
      for (const doc of sessionEndSnap.docs) {
        await doc.ref.delete();
        console.log(`   🗑️ ${playerId.slice(0, 8)}... session_end entry deleted`);
      }
    }
    
    // 4. Update chartData_elo
    console.log('\n📝 4. Updating chartData_elo...');
    const chartDataRef = db.doc(`groups/${groupId}/aggregated/chartData_elo`);
    const chartDataSnap = await chartDataRef.get();
    const chartData = chartDataSnap.data();
    
    if (chartData && chartData.datasets) {
      // Finde Session-Label (24.10.25)
      const sessionDate = new Date('2025-10-24');
      const sessionLabel = sessionDate.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit' 
      });
      
      const labelIndex = chartData.labels?.indexOf(sessionLabel);
      
      if (labelIndex !== undefined && labelIndex >= 0) {
        for (const dataset of chartData.datasets) {
          const playerId = dataset.playerId as string;
          const playerRating = correctFinalRatings[playerId as keyof typeof correctFinalRatings];
          if (playerRating) {
            dataset.data[labelIndex] = playerRating.rating;
            console.log(`   ✅ ${dataset.label}: ${playerRating.rating.toFixed(2)}`);
          }
        }
        
        await chartDataRef.update({ datasets: chartData.datasets });
        console.log('✅ chartData_elo updated');
      } else {
        console.log('⚠️ Session label not found in chartData_elo');
      }
    }
    
    console.log('\n🎉 SESSION ERFOLGREICH KORRIGIERT!');
    console.log('\n📊 KORREKTE FINALE WERTE:');
    console.log('   Remo:     139.46 (+1.31)');
    console.log('   Frank:     74.76 (+1.31)');
    console.log('   Michael:  114.14 (-1.31)');
    console.log('   Schmuudii: 98.69 (-1.31)');
    
  } catch (error) {
    console.error('❌ ERROR:', error);
  }
}

fixSession()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

