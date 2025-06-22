const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren
const serviceAccount = require('./functions/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function triggerRecalculationAndVerify() {
  console.log('🔄 Triggering player stats recalculation and verification...\n');
  
  const playerId = 'b16c1120111b7d9e7d733837'; // Remo
  
  try {
    // 1. Zeige aktuelle Daten (falls vorhanden)
    console.log('📊 Current stats status:');
    const currentStatsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    if (currentStatsDoc.exists) {
      console.log('✅ Stats exist - will be updated');
    } else {
      console.log('❌ No stats found - will be created from scratch');
    }
    
    // 2. Triggere Neuberechnung durch Update einer jassGameSummary
    console.log('\n🔄 Triggering recalculation...');
    
    const summariesSnapshot = await db.collection('jassGameSummaries')
      .where('participantPlayerIds', 'array-contains', playerId)
      .limit(1)
      .get();
    
    if (!summariesSnapshot.empty) {
      const firstSummary = summariesSnapshot.docs[0];
      
      // Triggere den onJassGameSummaryWritten Trigger
      await firstSummary.ref.update({
        triggerRecalculation: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Triggered recalculation via summary: ${firstSummary.id}`);
    } else {
      console.log('❌ No game summaries found to trigger recalculation');
      return;
    }
    
    // 3. Warte auf Verarbeitung
    console.log('\n⏳ Waiting for Cloud Function to process...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // 4. Lese und analysiere die Ergebnisse
    console.log('\n📖 Reading updated stats...');
    const updatedStatsDoc = await db.collection('playerComputedStats').doc(playerId).get();
    
    if (!updatedStatsDoc.exists) {
      console.log('❌ Stats still not found after recalculation. Cloud Function may have failed.');
      return;
    }
    
    const stats = updatedStatsDoc.data();
    
    console.log('\n🎉 === NEUBERECHNETE STATISTIKEN ===');
    
    // Grundlegende Zahlen
    console.log('\n📊 Grunddaten:');
    console.log(`Sessions: ${stats.totalSessions} (${stats.sessionWins} Siege, ${stats.sessionLosses} Niederlagen, ${stats.sessionTies} Unentschieden)`);
    console.log(`Games: ${stats.totalGames} (${stats.gameWins} Siege, ${stats.gameLosses} Niederlagen)`);
    
    // Win-Rate Berechnungen überprüfen
    console.log('\n🧮 === WIN-RATE BERECHNUNGEN ÜBERPRÜFEN ===');
    
    // Session Win-Rate (Unentschieden ausschließen)
    const decidedSessions = stats.sessionWins + stats.sessionLosses;
    const expectedSessionWinRate = decidedSessions > 0 ? (stats.sessionWins / decidedSessions) : 0;
    
    console.log('\n📊 Session Win-Rate Verifikation:');
    console.log(`   Entschiedene Sessions: ${stats.sessionWins} Siege + ${stats.sessionLosses} Niederlagen = ${decidedSessions}`);
    console.log(`   Erwartete Rate: ${stats.sessionWins}/${decidedSessions} = ${(expectedSessionWinRate * 100).toFixed(1)}%`);
    
    if (stats.sessionWinRateInfo) {
      console.log(`   ✅ Neue Struktur: ${stats.sessionWinRateInfo.displayText}`);
      console.log(`   📈 Details: wins=${stats.sessionWinRateInfo.wins}, total=${stats.sessionWinRateInfo.total}, rate=${(stats.sessionWinRateInfo.rate * 100).toFixed(1)}%`);
      
      // Verifikation
      if (stats.sessionWinRateInfo.wins === stats.sessionWins && 
          stats.sessionWinRateInfo.total === decidedSessions) {
        console.log('   ✅ Session Win-Rate Berechnung KORREKT!');
      } else {
        console.log('   ❌ Session Win-Rate Berechnung FALSCH!');
      }
    } else {
      console.log('   ⚠️ sessionWinRateInfo nicht vorhanden');
    }
    
    // Game Win-Rate
    const expectedGameWinRate = stats.totalGames > 0 ? (stats.gameWins / stats.totalGames) : 0;
    
    console.log('\n🎮 Game Win-Rate Verifikation:');
    console.log(`   Erwartete Rate: ${stats.gameWins}/${stats.totalGames} = ${(expectedGameWinRate * 100).toFixed(1)}%`);
    
    if (stats.gameWinRateInfo) {
      console.log(`   ✅ Neue Struktur: ${stats.gameWinRateInfo.displayText}`);
      console.log(`   📈 Details: wins=${stats.gameWinRateInfo.wins}, total=${stats.gameWinRateInfo.total}, rate=${(stats.gameWinRateInfo.rate * 100).toFixed(1)}%`);
      
      // Verifikation
      if (stats.gameWinRateInfo.wins === stats.gameWins && 
          stats.gameWinRateInfo.total === stats.totalGames) {
        console.log('   ✅ Game Win-Rate Berechnung KORREKT!');
      } else {
        console.log('   ❌ Game Win-Rate Berechnung FALSCH!');
      }
    } else {
      console.log('   ⚠️ gameWinRateInfo nicht vorhanden');
    }
    
    // Partner-Statistiken überprüfen
    console.log('\n👥 === PARTNER WIN-RATES ÜBERPRÜFEN ===');
    if (stats.partnerAggregates && stats.partnerAggregates.length > 0) {
      stats.partnerAggregates.slice(0, 3).forEach((partner, index) => {
        console.log(`\n${index + 1}. ${partner.partnerDisplayName}:`);
        console.log(`   Sessions: ${partner.sessionsWonWith}/${partner.sessionsPlayedWith}`);
        console.log(`   Games: ${partner.gamesWonWith}/${partner.gamesPlayedWith}`);
        
        if (partner.sessionWinRateInfo) {
          console.log(`   📊 Session Rate: ${partner.sessionWinRateInfo.displayText}`);
          
          // Verifikation
          if (partner.sessionWinRateInfo.wins === partner.sessionsWonWith && 
              partner.sessionWinRateInfo.total === partner.sessionsPlayedWith) {
            console.log('   ✅ Partner Session Win-Rate KORREKT!');
          } else {
            console.log('   ❌ Partner Session Win-Rate FALSCH!');
          }
        }
        
        if (partner.gameWinRateInfo) {
          console.log(`   🎮 Game Rate: ${partner.gameWinRateInfo.displayText}`);
          
          // Verifikation
          if (partner.gameWinRateInfo.wins === partner.gamesWonWith && 
              partner.gameWinRateInfo.total === partner.gamesPlayedWith) {
            console.log('   ✅ Partner Game Win-Rate KORREKT!');
          } else {
            console.log('   ❌ Partner Game Win-Rate FALSCH!');
          }
        }
      });
    }
    
    console.log('\n✅ Recalculation and verification completed!');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

triggerRecalculationAndVerify().then(() => {
  console.log('\n🎉 Verification script finished!');
  process.exit(0);
}).catch(err => {
  console.error('💥 Unerwarteter Fehler:', err);
  process.exit(1);
}); 